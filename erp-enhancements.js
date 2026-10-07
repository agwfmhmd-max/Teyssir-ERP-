(function () {
  "use strict";

  const DAY = 86400000;
  const SNAPSHOT_PREFIX = "teyssir_snapshot_";

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
      const reminders = subscriptionReminderHtml();
      if (reminders) div.insertAdjacentHTML("afterbegin", `<div class="erp-reminders">${reminders}</div>`);
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
   Teyssir ERP — Finance labels v12
   - Canonical SNDE/SOMELEC labels (including legacy records)
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

    // منع إشعارات المتصفح الخاصة باستحقاق الرواتب؛ لا يؤثر ذلك على عمليات الدفع.
    app.renderSalaryDueAlert = async function (div) {
      const host = div || document.getElementById('workspace');
      if (host) { const old = host.querySelector('#salaryDueAlert'); if (old) old.remove(); }
    };
  }
  boot();
})();
