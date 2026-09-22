(function () {
  "use strict";

  const DAY = 86400000;
  const SNAPSHOT_PREFIX = "teyssir_snapshot_";
  const REMINDER_KEY = "teyssir_salary_reminder_config";

  function safeJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "") || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function setConnectionState(state, detail) {
    const el = document.getElementById("connStatus");
    if (!el) return;
    const labels = {
      online: ["fa-wifi", "En ligne"],
      offline: ["fa-cloud-slash", "Hors ligne"],
      syncing: ["fa-rotate fa-spin", "Synchronisation…"],
      synced: ["fa-circle-check", "Synchronisé"],
    };
    const value = labels[state] || labels.online;
    el.className = `conn-status conn-${state}`;
    el.innerHTML = `<i class="fa-solid ${value[0]}"></i> ${detail || value[1]}`;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
  }

  function subscriptionInfo() {
    const expiry = app.state.expiryDate ? new Date(app.state.expiryDate) : null;
    const valid = expiry && !Number.isNaN(expiry.getTime());
    const days = valid ? Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / DAY)) : null;
    return { expiry, days, valid };
  }

  function subscriptionReminderHtml() {
    // تم إيقاف تنبيه قرب انتهاء الاشتراك للشركات بناءً على طلب المستخدم.
    return "";
  }

  async function salaryReminderHtml() {
    // تم إيقاف إشعار موعد دفع الرواتب للشركات مع إبقاء شاشة إدارة الرواتب والدفع.
    return "";
  }

  function enhanceBlockScreen(reason) {
    const info = subscriptionInfo();
    const card = document.querySelector("#blockScreen .block-card");
    if (!card || card.querySelector(".block-details")) return;
    const isTrial = app.state.subscriptionType === "trial";
    const message = isTrial
      ? "Votre période d’essai est arrivée à expiration. Veuillez souscrire à un abonnement pour continuer à utiliser le système."
      : "Votre abonnement a expiré. Veuillez renouveler votre abonnement pour récupérer immédiatement l’accès à toutes vos données.";
    const button = card.querySelector("button");
    const msg = document.getElementById("blockMsg");
    if (msg) msg.textContent = message;
    card.insertAdjacentHTML("beforeend", `<div class="block-details">
      <span><b>Client</b>${app.state.name || "—"}</span>
      <span><b>Expiration</b>${info.valid ? info.expiry.toLocaleDateString() : "—"}</span>
      <span><b>Type</b>${isTrial ? "Essai" : (app.state.subscriptionType || "Abonnement")}</span>
    </div>
    <div class="activation-box">
      <label for="reactivationCode">Code d’activation</label>
      <div><input id="reactivationCode" class="inp" autocomplete="one-time-code" placeholder="Saisissez le code reçu">
      <button type="button" class="btn btn-prim" onclick="app.reactivateAccount()">Activer</button></div>
    </div>`);
    if (button) {
      button.textContent = isTrial ? "S’abonner maintenant" : "Renouveler mon abonnement";
      button.onclick = () => app.openRenewalForm();
    }
  }

  function installEnhancements() {
    if (typeof app === "undefined" || app.__enhanced) return;
    app.__enhanced = true;
    app.state.subscriptionType = null;

    const originalGetData = app.getData.bind(app);
    app.getData = async function (collection, orderBy) {
      const key = `${SNAPSHOT_PREFIX}${this.state.cid}_${collection}`;
      try {
        const data = await originalGetData(collection, orderBy);
        if (data.length || navigator.onLine) localStorage.setItem(key, JSON.stringify(data));
        if (data.length) return data;
      } catch (error) {
        console.warn("Data cache fallback", collection, error);
      }
      return safeJson(key, []);
    };

    const originalMonitor = app.monitorSession.bind(app);
    app.monitorSession = function (docId, session) {
      originalMonitor(docId, session);
      if (!docId) return;
      const unsubscribe = db.collection("activation_codes").doc(docId).onSnapshot({ includeMetadataChanges: true }, (doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        this.state.subscriptionType = data.subscriptionType || "month";
        this.state.expiryDate = data.expiryDate || this.state.expiryDate;
        localStorage.setItem("teyssir_subscription_snapshot", JSON.stringify({
          subscriptionType: this.state.subscriptionType,
          expiryDate: this.state.expiryDate,
          status: data.status || "active",
        }));
        setConnectionState(doc.metadata.hasPendingWrites ? "syncing" : (navigator.onLine ? "synced" : "offline"));
      }, () => setConnectionState(navigator.onLine ? "online" : "offline"));
      this.listeners.push(unsubscribe);
    };

    const originalInit = app.init.bind(app);
    app.init = function () {
      const cached = safeJson("teyssir_subscription_snapshot", null);
      if (cached) {
        this.state.subscriptionType = cached.subscriptionType;
        this.state.expiryDate = cached.expiryDate;
      }
      originalInit();
    };

    const originalHome = app.home.bind(app);
    app.home = function (div) {
      originalHome(div);
      Promise.resolve(salaryReminderHtml()).then((salary) => {
        const reminders = `${subscriptionReminderHtml()}${salary}`;
        if (reminders) div.insertAdjacentHTML("afterbegin", `<div class="erp-reminders">${reminders}</div>`);
      });
    };

    const originalList = app.list.bind(app);
    app.list = async function (div, collection) {
      await originalList(div, collection);
      if (collection !== "salaries") return;
      const config = safeJson(REMINDER_KEY, { enabled: true, day: "last" });
      div.insertAdjacentHTML("afterbegin", `<section class="salary-reminder-tools">
        <div><strong>Rappels automatiques</strong><span>${config.enabled ? "Activés" : "Désactivés"} — ${config.day === "last" ? "fin du mois" : `jour ${config.day}`}</span></div>
        <button type="button" onclick="app.configureSalaryReminder()">Configurer</button>
        <button type="button" onclick="app.showSalaryReminderHistory()">Historique</button>
      </section>`);
    };

    app.configureSalaryReminder = function () {
      const config = safeJson(REMINDER_KEY, { enabled: true, day: "last" });
      this.showModal("Rappels automatiques des salaires", `<label>État</label>
        <select id="salaryReminderEnabled" class="select-box">
          <option value="yes" ${config.enabled ? "selected" : ""}>Activé</option>
          <option value="no" ${!config.enabled ? "selected" : ""}>Désactivé</option>
        </select>
        <label>Jour du rappel</label>
        <select id="salaryReminderDay" class="select-box">
          <option value="last" ${config.day === "last" ? "selected" : ""}>Fin du mois</option>
          <option value="25" ${config.day === "25" ? "selected" : ""}>Le 25</option>
          <option value="28" ${config.day === "28" ? "selected" : ""}>Le 28</option>
        </select>`, () => {
        localStorage.setItem(REMINDER_KEY, JSON.stringify({
          enabled: document.getElementById("salaryReminderEnabled").value === "yes",
          day: document.getElementById("salaryReminderDay").value,
        }));
        this.nav("salaries");
      });
    };

    app.showSalaryReminderHistory = function () {
      const history = safeJson("teyssir_salary_reminder_history", []);
      const rows = history.map((entry) => `<tr><td>${entry.period}</td><td>${entry.employeeCount}</td><td>${Number(entry.total).toLocaleString()} MRU</td></tr>`).join("");
      this.showModal("Historique des rappels", `<div class="table-scroll"><table><thead><tr><th>Période</th><th>Employés</th><th>Total</th></tr></thead><tbody>${rows || "<tr><td colspan='3'>Aucun rappel</td></tr>"}</tbody></table></div>`, null);
      const action = document.getElementById("modalActionBtn");
      if (action) action.style.display = "none";
    };

    const originalBlock = app.showBlockScreen.bind(app);
    app.showBlockScreen = function (reason) {
      originalBlock(reason);
      enhanceBlockScreen(reason);
    };

    app.openRenewalForm = async function () {
      this.directPayModal();
      const session = safeJson("mda_session", {});
      const values = {
        dpName: this.state.name || session.name || "",
        dpPhone: this.state.phone || session.phone || "",
        dpExistingCode: session.code || "",
      };
      Object.entries(values).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) field.value = value;
      });
      const category = document.getElementById("dpReqCategory");
      if (category) category.value = session.code ? "renew" : "new";
      this.toggleRenewInput();
    };

    app.reactivateAccount = async function () {
      const input = document.getElementById("reactivationCode");
      const code = input ? input.value.trim() : "";
      if (!code || !navigator.onLine) return alert("Une connexion Internet et un code valide sont requis.");
      this.showLoader();
      try {
        const result = await db.collection("activation_codes").where("code", "==", code).limit(1).get();
        if (result.empty) throw new Error("Code d’activation invalide.");
        const doc = result.docs[0];
        const data = doc.data();
        if (data.status !== "active" || (data.expiryDate && new Date(data.expiryDate) <= new Date())) {
          throw new Error("Ce code n’est pas actif ou a expiré.");
        }
        if (data.companyId && this.state.cid && data.companyId !== this.state.cid) throw new Error("Ce code appartient à un autre client.");
        const session = safeJson("mda_session", {});
        session.code = code;
        session.codeDocId = doc.id;
        localStorage.setItem("mda_session", JSON.stringify(session));
        this.state.codeDocId = doc.id;
        this.state.expiryDate = data.expiryDate;
        this.state.subscriptionType = data.subscriptionType || "month";
        this.monitorSession(doc.id, session);
        this.start(this.state.name, this.state.phone);
        alert("Compte réactivé. Toutes vos données et vos paramètres sont disponibles.");
      } catch (error) {
        alert(error.message);
      } finally {
        this.hideLoader();
      }
    };

    window.addEventListener("offline", () => setConnectionState("offline"));
    window.addEventListener("online", () => {
      setConnectionState("syncing");
      setTimeout(() => setConnectionState("synced"), 1800);
    });
    setConnectionState(navigator.onLine ? "online" : "offline");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installEnhancements);
  else installEnhancements();
})();


/* =========================================================
   Teyssir ERP — Finance labels + real notifications v12
   - Canonical SNDE/SOMELEC labels (including legacy records)
   - Browser notifications with explicit permission
   - Firestore notification inbox for the company supervisor
   ========================================================= */
(function installFinanceAndNotifications() {
  function boot() {
    if (typeof app === 'undefined' || typeof db === 'undefined') {
      setTimeout(boot, 80);
      return;
    }
    if (app.__financeNotificationsReady) return;
    app.__financeNotificationsReady = true;

    app.normalizeFinanceCategory = function (value) {
      const raw = String(value || '').trim();
      const normalized = raw.toLowerCase();
      if (['snde', 'الماء', 'ماء', 'eau', 'water', 'snde (الماء)', 'snde (eau)'].includes(normalized)) {
        return this.state.lang === 'fr' ? 'SNDE (Eau)' : 'SNDE (الماء)';
      }
      if (['somelec', 'الكهرباء', 'كهرباء', 'électricité', 'electricite', 'electricity', 'somelec (الكهرباء)', 'somelec (électricité)'].includes(normalized)) {
        return this.state.lang === 'fr' ? 'SOMELEC (Électricité)' : 'SOMELEC (الكهرباء)';
      }
      return raw || this.t('exp_other');
    };

    app.escapeNotificationText = function (value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[char]));
    };

    app.requestRealNotifications = async function () {
      if (!('Notification' in window)) {
        return alert(this.state.lang === 'fr' ? 'Les notifications du navigateur ne sont pas disponibles.' : 'إشعارات المتصفح غير متاحة في هذا الجهاز.');
      }
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') {
        return alert(this.state.lang === 'fr' ? 'Les notifications sont bloquées dans les paramètres du navigateur.' : 'تم منع الإشعارات. فعّلها من إعدادات المتصفح.');
      }
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    };

    app.pushRealNotification = function (title, body, key) {
      const dedupeKey = `teyssir_notification_${this.state.cid || 'local'}_${key || title}_${new Date().toISOString().slice(0, 10)}`;
      if (localStorage.getItem(dedupeKey)) return;
      localStorage.setItem(dedupeKey, '1');
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(title, { body, icon: './icon-192.png', tag: dedupeKey }); } catch (_) {}
      }
    };

    // The notification center is intentionally limited to actionable
    // salary-due and subscription-expired notices.
    const allowedNotificationTypes = new Set(['salary_due', 'subscription_expired']);
    app.notifySupervisor = async function (type, message, notificationKey) {
      if (!this.state.cid || this.state.cid === 'ADMIN' || !allowedNotificationTypes.has(type) || !message) return;
      try {
        const payload = {
          targetRole: 'admin',
          type,
          message,
          notificationKey: notificationKey || `${type}_${new Date().toISOString().slice(0, 10)}`,
          read: false,
          actor: this.state.currentUser ? this.state.currentUser.name : (this.state.name || 'مدير'),
          createdAt: new Date().toISOString()
        };
        const collection = db.collection('companies').doc(this.state.cid).collection('notifications');
        const existing = await collection.where('notificationKey', '==', payload.notificationKey).limit(1).get();
        if (existing.empty) {
          await collection.add({ ...payload, companyId: this.state.cid });
          const globalExisting = await db.collection('admin_notifications').where('notificationKey', '==', payload.notificationKey).limit(1).get();
          if (globalExisting.empty) await db.collection('admin_notifications').add({ ...payload, companyId: this.state.cid });
        }
      } catch (error) {
        // Notification failure must never block or roll back any operation.
        console.warn('Notification skipped:', error);
      }
    };
    app.syncSpecialNotifications = async function () {
      if (this.state.userRole !== 'admin' || !this.state.cid || this.state.cid === 'ADMIN') return;
      try {
        const dueSalaries = await this.getDueSalaries();
        for (const employee of dueSalaries) {
          const payDate = employee.payDate || 'due';
          await this.notifySupervisor(
            'salary_due',
            this.state.lang === 'fr'
              ? `Salaire dû : ${employee.name || 'Employé'} (${payDate})`
              : `حان موعد دفع راتب ${employee.name || 'الموظف'} بتاريخ ${payDate}`,
            `salary_due_${employee.id}_${payDate}`
          );
        }
        const expiry = this.state.expiryDate ? new Date(this.state.expiryDate) : null;
        if (expiry && !Number.isNaN(expiry.getTime()) && new Date() >= expiry) {
          await this.notifySupervisor(
            'subscription_expired',
            this.state.lang === 'fr' ? 'Votre abonnement a expiré.' : 'انتهى اشتراكك.',
            `subscription_expired_${expiry.toISOString()}`
          );
        }
      } catch (error) {
        console.warn('Special notification sync skipped:', error);
      }
    };
    app.renderSupervisorNotifications = function () {
      if (this.state.userRole !== 'admin' || !this.state.cid) return;
      const button = document.getElementById('supervisorNotifications');
      if (!button) return;
      const open = async () => {
        await this.requestRealNotifications();
        const entries = (Array.isArray(this._supervisorNotifications) ? this._supervisorNotifications : [])
          .filter((item) => allowedNotificationTypes.has(item.type));
        const body = entries.length ? entries.map((item) => `
          <div class="notification-item ${item.read ? '' : 'unread'}">
            <i class="fa-solid ${item.type === 'salary_due' ? 'fa-money-check-dollar' : 'fa-calendar-xmark'}"></i>
            <div><strong>${this.escapeNotificationText(item.message)}</strong><small>${this.escapeNotificationText(item.actor || '')} · ${this.formatDate(item.createdAt)}</small></div>
          </div>`).join('') : `<p class="notifications-empty">${this.state.lang === 'fr' ? 'Aucune notification.' : 'لا توجد إشعارات جديدة.'}</p>`;
        // Do not use showModal here: it requires an action callback and creates
        // Save/Close buttons. The notification center is display-only.
        const modal = document.getElementById('genericModal');
        document.getElementById('modalTitle').innerText = this.state.lang === 'fr' ? 'Notifications' : 'الإشعارات';
        document.getElementById('modalContent').innerHTML = `<div class="notifications-list">${body}</div>`;
        const footer = document.getElementById('modalActionBtn')?.parentElement;
        if (footer) footer.style.display = 'none';
        modal.style.display = 'flex';
        const notificationCollection = this.state.cid === 'ADMIN' ? db.collection('admin_notifications') : db.collection('companies').doc(this.state.cid).collection('notifications');
        entries.filter((item) => !item.read).slice(0, 30).forEach((item) => {
          notificationCollection.doc(item.id).update({ read: true }).catch(() => {});
        });
      };
      button.onclick = async () => {
        const modal = document.getElementById('genericModal');
        if (modal && modal.style.display === 'flex') modal.style.display = 'none';
        else await open();
      };
    };
    app.subscribeSupervisorNotifications = function () {
      if (this._notificationUnsub || this.state.userRole !== 'admin' || !this.state.cid) return;
      const notificationCollection = this.state.cid === 'ADMIN' ? db.collection('admin_notifications') : db.collection('companies').doc(this.state.cid).collection('notifications');
      this.syncSpecialNotifications();
      this._notificationUnsub = notificationCollection.limit(100).onSnapshot((snapshot) => {
        this._supervisorNotifications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((item) => item.targetRole === 'admin' && allowedNotificationTypes.has(item.type))
          .sort((a, b) => {
            const time = (item) => {
              const value = Date.parse(item.createdAt || '');
              return Number.isNaN(value) ? 0 : value;
            };
            return time(b) - time(a);
          });
        const unread = this._supervisorNotifications.filter((item) => !item.read).length;
        const badge = document.querySelector('#supervisorNotifications .notification-count');
        if (badge) { badge.textContent = unread > 99 ? '99+' : String(unread); badge.hidden = unread === 0; }
      }, (error) => console.warn('Notifications unavailable:', error));
    };
    app.ensureNotificationButton = function () {
      if (this.state.userRole !== 'admin' || document.getElementById('supervisorNotifications')) return;
      const header = document.querySelector('.top-header');
      if (!header) return;
      const button = document.createElement('button');
      button.id = 'supervisorNotifications';
      button.className = 'supervisor-notifications';
      button.type = 'button';
      button.title = this.state.lang === 'fr' ? 'Notifications' : 'الإشعارات';
      button.setAttribute('aria-label', this.state.lang === 'fr' ? 'Notifications' : 'الإشعارات');
      button.innerHTML = '<i class="fa-solid fa-bell"></i><span class="notification-count" hidden>0</span>';
      header.appendChild(button);
      this.renderSupervisorNotifications();
      this.subscribeSupervisorNotifications();
    };
    const originalStart = app.start.bind(app);
    app.start = function (name, phone) {
      originalStart(name, phone);
      setTimeout(() => {
        this.ensureNotificationButton();
        this.subscribeSupervisorNotifications();
      }, 0);
    };
    // منع إشعارات المتصفح الخاصة باستحقاق الرواتب؛ لا يؤثر ذلك على عمليات الدفع.
    app.renderSalaryDueAlert = async function (div) {
      const host = div || document.getElementById('workspace');
      if (host) { const old = host.querySelector('#salaryDueAlert'); if (old) old.remove(); }
    };

    // Ask only when the supervisor intentionally opens the notification center.
    window.addEventListener('online', () => setTimeout(() => app.ensureNotificationButton(), 300));
  }
  boot();
})();
