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
    const info = subscriptionInfo();
    if (!info.valid || info.days > 7) return "";
    const urgent = info.days <= 1;
    const priority = info.days <= 3;
    const tone = urgent ? "urgent" : priority ? "priority" : "notice";
    const trial = app.state.subscriptionType === "trial";
    const title = trial ? "Période d’essai" : "Abonnement";
    return `<section class="erp-reminder ${tone}">
      <div><strong>${title} : ${info.days} jour(s) restant(s)</strong>
      <span>Expiration : ${info.expiry.toLocaleDateString()}</span>
      <p>Votre abonnement expire bientôt. Veuillez le renouveler afin d’éviter l’interruption du service.</p></div>
      <button type="button" onclick="app.openRenewalForm()">Renouveler maintenant</button>
    </section>`;
  }

  async function salaryReminderHtml() {
    // التنبيه الجديد المعتمد على تاريخ استحقاق كل موظف يتكفل بذلك (تفادي التكرار)
    if (typeof app.getDueSalaries === "function") return "";
    const config = safeJson(REMINDER_KEY, { enabled: true, day: "last" });
    if (!config.enabled || !app.state.cid || app.state.cid === "ADMIN") return "";
    const salaries = await app.getData("salaries");
    const active = salaries.filter((employee) => employee.active !== false);
    const total = active.reduce((sum, employee) => sum + Number(employee.baseSalary || 0), 0);
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const due = config.day === "last" ? now.getDate() >= lastDay - 2 : now.getDate() >= Number(config.day || lastDay);
    if (!due || !active.length) return "";
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const history = safeJson("teyssir_salary_reminder_history", []);
    if (!history.some((entry) => entry.period === period)) {
      history.unshift({ period, employeeCount: active.length, total, createdAt: now.toISOString() });
      localStorage.setItem("teyssir_salary_reminder_history", JSON.stringify(history.slice(0, 24)));
    }
    return `<section class="erp-reminder salary">
      <div><strong>Rappel salaires — ${active.length} employé(s)</strong>
      <span>Total à payer : ${total.toLocaleString()} MRU</span></div>
      <button type="button" onclick="app.nav('salaries')">Voir les salaires</button>
    </section>`;
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
