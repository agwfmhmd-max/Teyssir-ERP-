/*
 * Durable offline sales for Teyssir ERP.
 * Offline invoices are provisional in this device's IndexedDB until Firestore
 * atomically validates stock and commits every financial/inventory record.
 */
(function installOfflineSales() {
  'use strict';
  const DB_NAME = 'teyssir-erp-offline-sales-v1';
  const DB_VERSION = 1;
  const SALES_STORE = 'sales';
  const META_STORE = 'meta';
  const LEASE_SIZE = 100;
  const PREFETCH_THRESHOLD = 10;
  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB is not available; the offline sale was not saved.'));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SALES_STORE)) database.createObjectStore(SALES_STORE, { keyPath: 'localId' });
        if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open offline sales storage.'));
      request.onblocked = () => reject(new Error('Close another Teyssir ERP tab to initialize offline sales storage.'));
    });
    return databasePromise;
  }

  function idbGet(storeName, key) {
    return openDatabase().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Local read failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Local read aborted.'));
    }));
  }

  function idbGetAll(storeName) {
    return openDatabase().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('Local list failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Local list aborted.'));
    }));
  }

  function idbPut(storeName, value) {
    return openDatabase().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error || new Error('Local save failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Local save aborted.'));
    }));
  }

  function localSequenceValue(deviceId, counter) {
    // رقم احتياطي قصير وقابل للطباعة: D + 6 خانات من معرّف الجهاز + عدّاد محلي دائم (بدل رقم من 50+ خانة).
    const tag = String(deviceId).replace(/[^0-9a-f]/gi, '').slice(0, 6).toUpperCase().padEnd(6, '0');
    return `D${tag}-${String(counter).padStart(5, '0')}`;
  }

  function consumeLocalSequence(metadata, leaseKey, onSequence) {
    const key = `${leaseKey}:fallback-sequence`;
    const current = metadata.get(key);
    current.onsuccess = () => {
      const counter = Math.max(0, Number(current.result && current.result.value) || 0) + 1;
      metadata.put({ key, value: counter });
      const deviceId = String(leaseKey).split(':').slice(-1)[0];
      onSequence(localSequenceValue(deviceId, counter), counter);
    };
    return current;
  }

  function idbPutOfflineSaleWithLease(leaseKey, payload, invoicePrefix, userNo) {
    return openDatabase().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction([META_STORE, SALES_STORE], 'readwrite');
      const metadata = transaction.objectStore(META_STORE);
      const sales = transaction.objectStore(SALES_STORE);
      let saved = null;
      let failure = null;
      const request = metadata.get(leaseKey);
      request.onsuccess = () => {
        const lease = request.result;
        const range = lease && Array.isArray(lease.ranges) ? lease.ranges.find(item => Number(item.next) <= Number(item.end)) : null;
        const saveWithSequence = (seq, sequenceText) => {
          const localId = payload.localId || createId();
          saved = Object.assign({}, payload, {
            localId, id: localId, seq, invoicePrefix, invoiceUserNo: userNo,
            invoiceNumberScheme: 'company-user-v1',
            invNum: `INV-${payload.year}-${invoicePrefix}${userNo}-${sequenceText}`,
            status: 'pending', pendingOffline: true,
            createdAt: payload.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          sales.put(saved);
        };
        if (range) {
          const seq = Number(range.next);
          range.next = seq + 1;
          metadata.put(lease);
          saveWithSequence(seq, String(seq).padStart(5, '0'));
          return;
        }
        const fallback = consumeLocalSequence(metadata, leaseKey, (sequence, counter) => saveWithSequence(counter, sequence));
        fallback.onerror = () => { failure = fallback.error || new Error('Could not allocate a local invoice number.'); transaction.abort(); };
      };
      request.onerror = () => { failure = request.error || new Error('Could not allocate a local invoice number.'); };
      transaction.oncomplete = () => resolve(saved);
      transaction.onerror = () => reject(failure || transaction.error || new Error('Could not save the offline sale.'));
      transaction.onabort = () => reject(failure || transaction.error || new Error('Could not save the offline sale.'));
    }));
  }

  function idbConsumeLeaseNumber(leaseKey, invoicePrefix, userNo, year) {
    return openDatabase().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction(META_STORE, 'readwrite');
      const store = transaction.objectStore(META_STORE);
      let result = null;
      let failure = null;
      const request = store.get(leaseKey);
      request.onsuccess = () => {
        const lease = request.result;
        const range = lease && Array.isArray(lease.ranges) ? lease.ranges.find(item => Number(item.next) <= Number(item.end)) : null;
        const localId = createId();
        if (range) {
          const seq = Number(range.next++);
          store.put(lease);
          result = { seq, year, companyCode: invoicePrefix, invoiceUserNo: userNo, localId, storageKey: leaseKey,
            full: `INV-${year}-${invoicePrefix}${userNo}-${String(seq).padStart(5, '0')}` };
          return;
        }
        const fallback = consumeLocalSequence(store, leaseKey, (sequence, counter) => {
          result = { seq: counter, year, companyCode: invoicePrefix, invoiceUserNo: userNo,
            localId, storageKey: leaseKey, full: `INV-${year}-${invoicePrefix}${userNo}-${sequence}` };
        });
        fallback.onerror = () => { failure = fallback.error || new Error('Could not allocate a local invoice number.'); transaction.abort(); };
      };
      request.onerror = () => { failure = request.error || new Error('Could not allocate a local invoice number.'); };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(failure || transaction.error || new Error('Could not reserve an invoice number.'));
      transaction.onabort = () => reject(failure || transaction.error || new Error('Could not reserve an invoice number.'));
    }));
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }

  function install(app) {
    if (app.__offlineSalesInstalled) return;
    app.__offlineSalesInstalled = true;
    app.openOfflineSalesDB = openDatabase;
    app.getOfflineSales = async function(companyId) {
      const all = await idbGetAll(SALES_STORE);
      return all.filter(sale => !companyId || sale.companyId === companyId);
    };
    app.getOfflineDeviceId = function() {
      let id = localStorage.getItem('teyssir_offline_device_id');
      if (!id) { id = createId().replace(/-/g, ''); localStorage.setItem('teyssir_offline_device_id', id); }
      return id;
    };
    app.getInvoiceLeaseKey = function(cid, year, userNo) {
      return `invoice-lease:${cid}:${year}:${userNo}:${this.getOfflineDeviceId()}`;
    };
    app.ensureOfflineInvoiceLease = async function() {
      const cid = this.state.cid;
      if (!cid) throw new Error(this.t('offline_invoice_quota'));
      const companyCode = await this.ensureInvoiceCompanyPrefix();
      const userNo = await this.ensureInvoiceUserNumber();
      const year = new Date().getFullYear().toString().slice(-2);
      const leaseKey = this.getInvoiceLeaseKey(cid, year, userNo);
      const lease = await idbGet(META_STORE, leaseKey);
      const available = lease && Array.isArray(lease.ranges)
        ? lease.ranges.reduce((sum, range) => sum + Math.max(0, Number(range.end) - Number(range.next) + 1), 0) : 0;
      if (available >= PREFETCH_THRESHOLD) return { leaseKey, companyCode, userNo, year, available };
      if (!navigator.onLine) {
        return { leaseKey, companyCode, userNo, year, available, localFallback: available === 0 };
      }
      const reserve = this.__offlineLeasePromises || (this.__offlineLeasePromises = {});
      // عند ضعف الشبكة لا ننتظر حجز المدى السحابي أكثر من 5 ثوانٍ: نتابع بالأرقام المحلية المتاحة.
      const settle = pending => Promise.race([pending, new Promise(resolve => setTimeout(() => resolve({ leaseKey, companyCode, userNo, year, available, localFallback: available === 0 }), 5000))]);
      if (reserve[leaseKey]) return settle(reserve[leaseKey]);
      reserve[leaseKey] = (async () => {
        try {
          const deviceId = this.getOfflineDeviceId();
          const seriesKey = `${year}_u${userNo}`;
          const mapKey = `${year}_u${userNo}_d${deviceId}`;
          const counterRef = db.collection('counters').doc(cid);
          const counterSnapshot = await counterRef.get();
          const counterData = counterSnapshot.exists ? (counterSnapshot.data() || {}) : {};
          const sequenceInitialized = Object.assign({}, counterData.invoiceSequenceInitialized || {});
          let historicalMax = 0;
          if (!sequenceInitialized[seriesKey]) {
            const invoices = await db.collection('invoices').where('companyId', '==', cid).get();
            const numberPattern = new RegExp(`^INV-${year}-${companyCode}${userNo}-(\\d+)$`);
            invoices.forEach(invoice => {
              const match = String((invoice.data() || {}).invNum || '').match(numberPattern);
              if (match) historicalMax = Math.max(historicalMax, Number(match[1]) || 0);
            });
          }
          const range = await db.runTransaction(async transaction => {
            const snap = await transaction.get(counterRef);
            const data = snap.exists ? (snap.data() || {}) : {};
            const sequences = Object.assign({}, data.invoiceSequences || {});
            const leases = Object.assign({}, data.offlineLeases || {});
            const initialized = Object.assign({}, data.invoiceSequenceInitialized || {});
            const start = Math.max(1, Math.floor(Number(sequences[seriesKey]) || 0) + 1, initialized[seriesKey] ? 1 : historicalMax + 1);
            const end = start + LEASE_SIZE - 1;
            sequences[seriesKey] = end;
            leases[mapKey] = { start, end, year, userNo, updatedAt: new Date().toISOString() };
            initialized[seriesKey] = true;
            transaction.set(counterRef, { invoiceSequences: sequences, offlineLeases: leases, invoiceSequenceInitialized: initialized }, { merge: true });
            return { start, end };
          });
          const current = (await idbGet(META_STORE, leaseKey)) || { key: leaseKey, ranges: [] };
          current.ranges = (current.ranges || []).filter(item => Number(item.next) <= Number(item.end));
          current.ranges.push({ start: range.start, end: range.end, next: range.start });
          current.updatedAt = new Date().toISOString();
          await idbPut(META_STORE, current);
          this.state.invoicePrefix = companyCode;
          return { leaseKey, companyCode, userNo, year, available: available + LEASE_SIZE };
        } catch (error) {
          const stillAvailable = await idbGet(META_STORE, leaseKey).catch(() => null);
          const count = stillAvailable && stillAvailable.ranges
            ? stillAvailable.ranges.reduce((sum, item) => sum + Math.max(0, Number(item.end) - Number(item.next) + 1), 0) : 0;
          if (count > 0) return { leaseKey, companyCode, userNo, year, available: count };
          console.warn('Using device-local invoice sequence until a cloud number range can be reserved', error);
          return { leaseKey, companyCode, userNo, year, available: 0, localFallback: true };
        } finally { delete reserve[leaseKey]; }
      })();
      return settle(reserve[leaseKey]);
    };
    const baseGetNextInvoiceNumber = app.getNextInvoiceNumber;
    app.getNextInvoiceNumber = async function() {
      try {
        const companyCode = await this.ensureInvoiceCompanyPrefix();
        const userNo = await this.ensureInvoiceUserNumber();
        const year = new Date().getFullYear().toString().slice(-2);
        const lease = await this.ensureOfflineInvoiceLease();
        const number = await idbConsumeLeaseNumber(lease.leaseKey, companyCode, userNo, year);
        if (navigator.onLine && lease.available - 1 < PREFETCH_THRESHOLD) this.ensureOfflineInvoiceLease().catch(error => console.warn('Invoice range prefetch failed', error));
        return number;
      } catch (error) {
        // شبكة أمان: لا تُرفض الفاتورة أونلاين بسبب تعذر نظام الأرقام المحلي؛ نستعمل المولّد الأصلي.
        if (navigator.onLine && typeof baseGetNextInvoiceNumber === 'function') {
          console.warn('Local invoice numbering failed, using base generator', error);
          return baseGetNextInvoiceNumber.call(this);
        }
        throw error;
      }
    };
    app.saveOfflineInvoice = async function(payload) {
      const leaseInfo = await this.ensureOfflineInvoiceLease();
      const leaseKey = leaseInfo.leaseKey;
      const saved = await idbPutOfflineSaleWithLease(leaseKey, Object.assign({}, payload, { year: leaseInfo.year }), leaseInfo.companyCode, leaseInfo.userNo);
      return saved;
    };
    app.finalizeOfflineInvoice = async function() {
      if (!this.cart || !this.cart.length) return alert(this.t('empty'));
      const required = new Map();
      for (const item of this.cart) required.set(item.id, (required.get(item.id) || 0) + Number(item.q || 0));
      for (const [id, quantity] of required) {
        const product = (this.cachedProducts || []).find(entry => entry.id === id);
        if (!product) return alert(this.state.lang === 'ar' ? `المنتج ${id} غير موجود في البيانات المخزنة على هذا الجهاز.` : `Le produit ${id} n'est pas disponible dans les données locales.`);
        if (Number(product.stock || 0) < quantity) return alert(this.state.lang === 'ar'
          ? `الكمية المحلية غير كافية للمنتج ${product.name || id}. المتاح ${Number(product.stock || 0)} والمطلوب ${quantity}.`
          : `Stock local insuffisant pour ${product.name || id}. Disponible : ${Number(product.stock || 0)}, demandé : ${quantity}.`);
      }
      const totalText = String(document.getElementById('cartTotal').innerText || '0').replace(/[^0-9.-]/g, '');
      const total = Number(totalText);
      const cash = Number(document.getElementById('payCash').value);
      const bank = Number(document.getElementById('payBank').value);
      const bankId = document.getElementById('posBankId').value;
      const bankName = document.getElementById('posBankName').value;
      const payMethod = document.getElementById('posPayMethod').value;
      let customerId = document.getElementById('posCustId').value;
      let customer = document.getElementById('posCustName').value;
      if (!customerId) {
        if (total - (cash + bank) > 0) return alert(this.t('err_walkin_debt'));
        customer = this.t('cust_walkin');
        customerId = 'WALK_IN';
      }
      if (payMethod !== 'cash' && !bankId) return alert(this.t('select_bank'));
      if (![total, cash, bank].every(Number.isFinite) || total <= 0 || cash < 0 || bank < 0 || cash + bank > total) return alert(this.state.lang === 'ar' ? 'مبلغ الدفع غير صالح.' : 'Montant de paiement invalide.');
      this.showLoader();
      try {
        const userNo = await this.ensureInvoiceUserNumber();
        const createdAt = new Date().toISOString();
        const paid = cash + bank;
        const items = this.cart.map(item => Object.assign({}, item));
        const totalCost = items.reduce((sum, item) => sum + Number(item.bp || 0) * Number(item.q || 0), 0);
        const saved = await this.saveOfflineInvoice({
          companyId: this.state.cid, customer, customerId, items, total, paid, debt: total - paid,
          cashAmount: cash, bankAmount: bank, bankId, bankName, payMethod,
          invoiceUserNo: userNo, totalCost, profit: total - totalCost, createdAt, status: 'pending'
        });
        this.printData = { id: saved.invNum, c: customer, t: total, items, p: paid, d: total - paid, pm: payMethod, bn: bankName };
        ['products','invoices','customers','transactions','banks'].forEach(collection => this.clearCache(collection));
        this.print(saved.invNum, customer, total, items, paid, total - paid, payMethod, bankName, true);
        this.cart = [];
        this.notify(this.t('offline_sale_saved'));
        this.nav('pos');
      } catch (error) {
        console.error('Offline invoice save failed', error);
        alert(error.message || this.t('offline_invoice_quota'));
      } finally { this.hideLoader(); }
    };
    app.saveOfflineInvoiceWithReservedNumber = async function(payload, numberInfo) {
      const saved = Object.assign({}, payload, {
        localId: numberInfo.localId,
        id: numberInfo.localId,
        seq: numberInfo.seq,
        invoicePrefix: numberInfo.companyCode,
        invoiceUserNo: numberInfo.invoiceUserNo,
        invoiceNumberScheme: 'company-user-v1',
        invNum: numberInfo.full,
        status: 'pending',
        pendingOffline: true,
        updatedAt: new Date().toISOString()
      });
      await idbPut(SALES_STORE, saved);
      return saved;
    };
    app.updateOfflineInvoice = async function(localId, patch) {
      const current = await idbGet(SALES_STORE, localId);
      if (!current) throw new Error('Offline invoice not found.');
      return idbPut(SALES_STORE, Object.assign({}, current, patch, { updatedAt: new Date().toISOString() }));
    };
    app.mergeOfflineSales = async function(collection, data) {
      const sales = await this.getOfflineSales(this.state.cid);
      const active = sales.filter(sale => sale.status === 'pending' || sale.status === 'conflict');
      if (collection === 'products') {
        const deductions = new Map();
        active.forEach(sale => (sale.items || []).forEach(item => deductions.set(item.id, (deductions.get(item.id) || 0) + Number(item.q || 0))));
        return (data || []).map(product => deductions.has(product.id)
          ? Object.assign({}, product, { stock: Number(product.stock || 0) - deductions.get(product.id), offlineReservedQty: deductions.get(product.id) })
          : product);
      }
      // أرصدة الزبائن والبنوك: تُظهر فوراً أثر الفواتير المحلية (غير المزامنة) حتى بدون إنترنت.
      // العرض فقط؛ لا تُكتب هذه الإضافة في قاعدة البيانات، وتزول تلقائياً عند اكتمال المزامنة
      // لأن الخادم سيضيف المبلغ نفسه، فلا يحدث احتساب مزدوج.
      if (collection === 'customers') {
        const debts = new Map();
        active.forEach(sale => {
          const debt = Number(sale.debt || 0);
          if (debt > 0 && sale.customerId && sale.customerId !== 'WALK_IN') debts.set(sale.customerId, (debts.get(sale.customerId) || 0) + debt);
        });
        return (data || []).map(customer => debts.has(customer.id)
          ? Object.assign({}, customer, { balance: Number(customer.balance || 0) + debts.get(customer.id), offlinePendingDebt: debts.get(customer.id) })
          : customer);
      }
      if (collection === 'banks') {
        const deposits = new Map();
        active.forEach(sale => {
          const amount = Number(sale.bankAmount || 0);
          if (amount > 0 && sale.bankId) deposits.set(sale.bankId, (deposits.get(sale.bankId) || 0) + amount);
        });
        return (data || []).map(bank => deposits.has(bank.id)
          ? Object.assign({}, bank, { balance: Number(bank.balance || 0) + deposits.get(bank.id), offlinePendingDeposit: deposits.get(bank.id) })
          : bank);
      }
      if (collection === 'invoices') {
        const localInvoices = sales.filter(sale => sale.status !== 'synced').map(sale => Object.assign({}, sale, {
          id: `offline_${sale.localId}`,
          pendingOffline: sale.status !== 'cancelled',
          offlineStatus: sale.status,
          offlineError: sale.error || null
        }));
        return [...localInvoices, ...(data || [])].sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
      }
      return data || [];
    };
    app.commitOfflineInvoice = async function(sale) {
      const invoiceRef = db.collection('invoices').doc(sale.localId);
      const saleTransactionRef = db.collection('transactions').doc(`${sale.localId}_sale`);
      const cashTransactionRef = db.collection('transactions').doc(`${sale.localId}_cash`);
      const treasuryRef = db.collection('treasury').doc(sale.companyId);
      const customerRef = sale.customerId && sale.customerId !== 'WALK_IN' && Number(sale.debt || 0) > 0
        ? db.collection('customers').doc(sale.customerId) : null;
      const bankRef = Number(sale.bankAmount || 0) > 0 && sale.bankId ? db.collection('banks').doc(sale.bankId) : null;
      const ids = [...new Set((sale.items || []).map(item => item.id))];
      const productRefs = ids.map(id => db.collection('products').doc(id));
      let treasuryAfter = null;
      // فحص تكرار رقم الفاتورة خارج المعاملة: Transaction.get() لا يقبل الاستعلامات في Firestore Web SDK،
      // وكان ذلك يُفشل مزامنة كل الفواتير المحلية بحالة «تعارض».
      await this.assertInvoiceNumberFree(sale.companyId, sale.invNum, sale.localId);
      await db.runTransaction(async transaction => {
        const existingInvoice = await transaction.get(invoiceRef);
        if (existingInvoice.exists) {
          const existing = existingInvoice.data() || {};
          if (existing.localSaleId === sale.localId) { treasuryAfter = null; return; }
          throw new Error(this.t('offline_invoice_duplicate'));
        }
        const treasurySnap = Number(sale.cashAmount || 0) > 0 ? await transaction.get(treasuryRef) : null;
        const customerSnap = customerRef ? await transaction.get(customerRef) : null;
        const bankSnap = bankRef ? await transaction.get(bankRef) : null;
        const productSnaps = [];
        for (const ref of productRefs) productSnaps.push(await transaction.get(ref));
        const products = new Map();
        productSnaps.forEach((snap, i) => {
          if (!snap.exists) throw new Error(this.state.lang === 'ar' ? `تعارض مخزون: المنتج ${ids[i]} لم يعد موجوداً. الفاتورة بقيت محفوظة محلياً.` : `Stock conflict: product ${ids[i]} no longer exists. The invoice remains saved locally.`);
          products.set(ids[i], snap.data());
        });
        const required = new Map();
        (sale.items || []).forEach(item => required.set(item.id, (required.get(item.id) || 0) + Number(item.q || 0)));
        for (const [id, quantity] of required) {
          const product = products.get(id);
          if (Number(product.stock || 0) < quantity) {
            const message = this.state.lang === 'ar'
              ? `تعارض مخزون عند المزامنة: المتاح من ${product.name || id} هو ${Number(product.stock || 0)} فقط، والمطلوب ${quantity}. بقيت الفاتورة محفوظة محلياً ولم تُسجل أو يُخصم المخزون.`
              : `Stock conflict during sync: ${Number(product.stock || 0)} unit(s) of ${product.name || id} remain; ${quantity} required. The invoice is still saved locally and was not posted.`;
            throw new Error(message);
          }
        }
        if (customerRef && !customerSnap.exists) throw new Error(this.state.lang === 'ar' ? 'تعارض مزامنة: الزبون غير موجود. بقيت الفاتورة محفوظة محلياً.' : 'Sync conflict: customer no longer exists. The invoice remains saved locally.');
        if (bankRef && !bankSnap.exists) throw new Error(this.state.lang === 'ar' ? 'تعارض مزامنة: البنك غير موجود. بقيت الفاتورة محفوظة محلياً.' : 'Sync conflict: bank no longer exists. The invoice remains saved locally.');
        let totalCost = 0;
        for (const [id, quantity] of required) {
          const product = products.get(id);
          const remaining = Number(product.stock || 0) - quantity;
          const isOpening = product.sourceType === 'opening' || (sale.items || []).some(item => item.id === id && item.sourceType === 'opening');
          if (remaining <= 0 && isOpening) transaction.delete(db.collection('products').doc(id));
          else transaction.update(db.collection('products').doc(id), { stock: remaining });
        }
        (sale.items || []).forEach(item => { totalCost += Number(item.bp || 0) * Number(item.q || 0); });
        const cash = Number(sale.cashAmount || 0);
        const bank = Number(sale.bankAmount || 0);
        const debt = Number(sale.debt || 0);
        const total = Number(sale.total || 0);
        const paid = Number(sale.paid || 0);
        const customerName = sale.customer || '';
        const at = sale.createdAt || new Date().toISOString();
        if (cash > 0) {
          const before = treasurySnap && treasurySnap.exists && treasurySnap.data().balance != null
            ? Number(treasurySnap.data().balance) : Number(this.state.cashBalance || 0);
          treasuryAfter = before + cash;
          transaction.set(treasuryRef, { balance: treasuryAfter, updatedAt: new Date().toISOString() }, { merge: true });
          transaction.set(cashTransactionRef, {
            companyId: sale.companyId, type: 'cash_in', isTreasury: true, amount: cash,
            balanceBefore: before, balanceAfter: treasuryAfter, note: `Sale ${sale.invNum}`,
            refId: sale.localId, relatedEntity: customerName, bankId: null, createdAt: at
          });
        }
        if (customerRef) transaction.update(customerRef, { balance: Number(customerSnap.data().balance || 0) + debt });
        if (bankRef) transaction.update(bankRef, { balance: Number(bankSnap.data().balance || 0) + bank });
        const profit = total - totalCost;
        transaction.set(invoiceRef, {
          companyId: sale.companyId, invNum: sale.invNum, customer: customerName, customerId: sale.customerId,
          items: sale.items, total, paid, debt, cashAmount: cash, bankAmount: bank,
          bankId: sale.bankId || '', bankName: sale.bankName || '', profit,
          invoicePrefix: sale.invoicePrefix, invoiceUserNo: sale.invoiceUserNo,
          invoiceNumberScheme: 'company-user-v1', localSaleId: sale.localId,
          createdAt: at, syncedAt: new Date().toISOString()
        });
        transaction.set(saleTransactionRef, {
          companyId: sale.companyId, type: 'sale', refId: sale.localId, invNum: sale.invNum,
          amount: total, paid, debt, cashAmount: cash, bankAmount: bank, bankId: sale.bankId || '',
          invoicePrefix: sale.invoicePrefix, invoiceUserNo: sale.invoiceUserNo,
          invoiceNumberScheme: 'company-user-v1', cogs: totalCost,
          customerId: sale.customerId, createdAt: at, note: `Invoice ${sale.invNum}`
        });
      });
      return { treasuryAfter };
    };
    app.syncOfflineSales = async function() {
      if (!navigator.onLine || !this.state.cid || this.__offlineSalesSyncing) return;
      this.__offlineSalesSyncing = true;
      let changed = false;
      try {
        const all = await this.getOfflineSales(this.state.cid);
        const pending = all.filter(sale => sale.status === 'pending');
        for (const sale of pending) {
          if (!navigator.onLine) break;
          try {
            // مهلة أمان: لا نترك المزامنة معلّقة إلى الأبد إن كانت الشبكة ميتة فعلياً.
            const result = await this.withTimeout(this.commitOfflineInvoice(sale), 45000);
            await this.updateOfflineInvoice(sale.localId, { status: 'synced', pendingOffline: false, syncedAt: new Date().toISOString(), error: null });
            if (result.treasuryAfter != null) {
              this.state.cashBalance = Number(result.treasuryAfter);
              localStorage.setItem('teyssir_cash_balance', String(this.state.cashBalance));
            }
            changed = true;
            ['products','invoices','customers','transactions','banks'].forEach(collection => this.clearCache(collection));
          } catch (error) {
            console.error('Offline invoice sync failed', sale.invNum, error);
            if (!navigator.onLine || ['unavailable','deadline-exceeded','network-request-failed','cancelled'].includes(error.code)) break;
            await this.updateOfflineInvoice(sale.localId, { status: 'conflict', error: String(error.message || error) });
            changed = true;
            break;
          }
        }
      } catch (error) { console.error('Could not read offline sales queue', error); }
      finally {
        this.__offlineSalesSyncing = false;
        if (changed && this.state.currentView === 'invoices') this.nav('invoices');
      }
    };
    app.retryOfflineSale = async function(localId) {
      await this.updateOfflineInvoice(localId, { status: 'pending', error: null });
      await this.syncOfflineSales();
      if (this.state.currentView === 'invoices') this.nav('invoices');
    };
    app.cancelOfflineSale = async function(localId) {
      const message = this.state.lang === 'ar'
        ? 'إلغاء الفاتورة المحلية المعلقة؟ ستبقى محفوظة في السجل المحلي، ولن تُرسل إلى الخادم أو تؤثر في المخزون السحابي.'
        : 'Cancel this local pending invoice? It will remain in this device history and will not be posted to the server or affect cloud stock.';
      if (!confirm(message)) return;
      await this.updateOfflineInvoice(localId, { status: 'cancelled', error: null, cancelledAt: new Date().toISOString() });
      if (this.state.currentView === 'invoices') this.nav('invoices');
    };

    const originalGetData = app.getData.bind(app);
    app.getData = async function(collection, ...args) {
      const data = await originalGetData(collection, ...args);
      return this.mergeOfflineSales(collection, data);
    };

    const originalStart = app.start.bind(app);
    app.start = function(...args) {
      const result = originalStart(...args);
      if (this.state.cid) {
        this.ensureOfflineInvoiceLease().catch(error => console.warn('Offline invoice numbers not preloaded yet', error));
        this.syncOfflineSales().catch(error => console.warn('Offline sales sync check failed', error));
      }
      return result;
    };
    window.addEventListener('online', () => {
      if (!window.app || !app.state.cid) return;
      app.syncOfflineSales().then(() => app.ensureOfflineInvoiceLease()).catch(error => console.warn('Offline sales reconnect handling failed', error));
    });
    const resumeSync = () => {
      if (!navigator.onLine || !window.app || !app.state.cid) return;
      app.syncOfflineSales().catch(error => console.warn('Offline sales resume sync failed', error));
    };
    window.addEventListener('focus', resumeSync);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resumeSync(); });
    window.setInterval(resumeSync, 30000);
  }

  function boot() {
    if (typeof app === 'undefined' || typeof db === 'undefined') { setTimeout(boot, 50); return; }
    install(app);
  }
  boot();
})();
