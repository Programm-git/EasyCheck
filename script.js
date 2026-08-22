(() => {
  const views = document.querySelectorAll(".view");
  const appViewNavMap = {
    "view-app-an": "bottom-nav-an",
    "view-app-ag": "bottom-nav-ag",
  };
  const today = new Date();

  const WORK_HISTORY_KEY = "easycheck-work-history";
  function loadWorkHistory() {
    try {
      const raw = localStorage.getItem(WORK_HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }
  function saveWorkHistory() {
    try { localStorage.setItem(WORK_HISTORY_KEY, JSON.stringify(state.workHistory)); } catch (e) {}
  }

  const WORK_SESSION_KEY = "easycheck-work-session";
  function loadWorkSession() {
    try {
      const raw = localStorage.getItem(WORK_SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }
  function saveWorkSession() {
    try {
      if (state.workSession) {
        localStorage.setItem(WORK_SESSION_KEY, JSON.stringify(state.workSession));
      } else {
        localStorage.removeItem(WORK_SESSION_KEY);
      }
    } catch (e) {}
  }

  const DEVICE_ID_KEY = "easycheck-device-id";
  function getOrCreateDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch (e) {
      return "d" + Math.random().toString(36).slice(2, 10);
    }
  }

  // ---------- Firebase (geräteübergreifende Verbindung Auftraggeber <-> Auftragnehmer) ----------
  let fb = window.easyCheckFirebase || null;
  const onFirebaseReady = new Promise((resolve) => {
    if (fb) { resolve(fb); return; }
    window.addEventListener("easycheck-firebase-ready", () => {
      fb = window.easyCheckFirebase;
      resolve(fb);
    }, { once: true });
  });

  let unsubscribeEmployees = null;
  function subscribeEmployeesForCode(code) {
    onFirebaseReady.then((firebase) => {
      if (!firebase || !code) return;
      if (unsubscribeEmployees) { unsubscribeEmployees(); unsubscribeEmployees = null; }
      const q = firebase.query(
        firebase.collection(firebase.db, "connections"),
        firebase.where("employerCode", "==", code)
      );
      unsubscribeEmployees = firebase.onSnapshot(q, (snapshot) => {
        state.employees = snapshot.docs.map(d => ({ connectionId: d.id, ...d.data() }));
        renderEmployeeList();
        const statEl = document.getElementById("ag-stat-mitarbeiter");
        if (statEl) statEl.textContent = state.employees.length;
      }, () => {});
    });
  }

  let unsubscribeConnectedEmployers = null;
  function subscribeEmployersForAN(deviceId) {
    onFirebaseReady.then((firebase) => {
      if (!firebase || !deviceId) return;
      if (unsubscribeConnectedEmployers) { unsubscribeConnectedEmployers(); unsubscribeConnectedEmployers = null; }
      const q = firebase.query(
        firebase.collection(firebase.db, "connections"),
        firebase.where("deviceId", "==", deviceId)
      );
      unsubscribeConnectedEmployers = firebase.onSnapshot(q, (snapshot) => {
        state.connectedEmployers = snapshot.docs.map(d => ({ connectionId: d.id, code: d.data().employerCode }));
        renderConnectedEmployers();
        renderAnStats();
      }, () => {});
    });
  }

  function removeConnectionFromFirebase(connectionId) {
    onFirebaseReady.then((firebase) => {
      if (!firebase || !connectionId) return;
      firebase.deleteDoc(firebase.doc(firebase.db, "connections", connectionId)).catch(() => {});
    });
  }

  function connectEmployeeToFirebase(code, name) {
    onFirebaseReady.then((firebase) => {
      if (!firebase) return;
      const deviceId = getOrCreateDeviceId();
      const ref = firebase.doc(firebase.db, "connections", `${code}_${deviceId}`);
      firebase.setDoc(ref, {
        employerCode: code,
        deviceId,
        name,
        hours: 0,
        active: true,
        connectedAt: firebase.serverTimestamp(),
      }, { merge: true }).catch(() => {});
    });
  }

  // ---------- Termine / Postfach (geräteübergreifend über Firebase) ----------
  let unsubscribeAppointments = { auftragnehmer: null, auftraggeber: null };

  function handleAppointmentSnapshot(role, snapshot) {
    const wasAlreadyLoaded = state.appointmentsLoaded[role];
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    state.termine[role] = list;

    snapshot.docChanges().forEach(change => {
      if (change.type !== "added" && change.type !== "modified") return;
      const item = { id: change.doc.id, ...change.doc.data() };
      if (
        wasAlreadyLoaded &&
        item.status === "pending" &&
        item.requestedByRole === otherRole(role) &&
        state.autoAccept[role]
      ) {
        acceptTerminMessage(role, item);
      }
    });

    state.appointmentsLoaded[role] = true;

    refreshCalendar(role);
    renderPostfach(role);
  }

  function subscribeAppointmentsForAG(code) {
    onFirebaseReady.then((firebase) => {
      if (!firebase || !code) return;
      if (unsubscribeAppointments.auftraggeber) { unsubscribeAppointments.auftraggeber(); }
      const q = firebase.query(
        firebase.collection(firebase.db, "appointments"),
        firebase.where("employerCode", "==", code)
      );
      unsubscribeAppointments.auftraggeber = firebase.onSnapshot(q, (snapshot) => {
        handleAppointmentSnapshot("auftraggeber", snapshot);
      }, () => {});
    });
  }

  function subscribeAppointmentsForAN(deviceId) {
    onFirebaseReady.then((firebase) => {
      if (!firebase || !deviceId) return;
      if (unsubscribeAppointments.auftragnehmer) { unsubscribeAppointments.auftragnehmer(); }
      const q = firebase.query(
        firebase.collection(firebase.db, "appointments"),
        firebase.where("deviceId", "==", deviceId)
      );
      unsubscribeAppointments.auftragnehmer = firebase.onSnapshot(q, (snapshot) => {
        handleAppointmentSnapshot("auftragnehmer", snapshot);
      }, () => {});
    });
  }

  function createAppointmentInFirebase(payload) {
    onFirebaseReady.then((firebase) => {
      if (!firebase) return;
      firebase.addDoc(firebase.collection(firebase.db, "appointments"), {
        ...payload,
        status: "pending",
        createdAt: firebase.serverTimestamp(),
      }).catch(() => {});
    });
  }

  function updateAppointmentStatusInFirebase(id, status) {
    onFirebaseReady.then((firebase) => {
      if (!firebase) return;
      const ref = firebase.doc(firebase.db, "appointments", id);
      firebase.updateDoc(ref, { status }).catch(() => {});
    });
  }

  let unsubscribeNotifications = null;
  function subscribeNotificationsForAG(code) {
    onFirebaseReady.then((firebase) => {
      if (!firebase || !code) return;
      if (unsubscribeNotifications) { unsubscribeNotifications(); }
      const q = firebase.query(
        firebase.collection(firebase.db, "notifications"),
        firebase.where("employerCode", "==", code)
      );
      unsubscribeNotifications = firebase.onSnapshot(q, (snapshot) => {
        state.postfach.auftraggeber = snapshot.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            sender: data.sender,
            text: data.text,
            unread: true,
            type: "info",
            sortKey: (data.createdAt && data.createdAt.toMillis) ? data.createdAt.toMillis() : Date.now(),
          };
        });
        renderPostfach("auftraggeber");
      }, () => {});
    });
  }

  function sendWorkNotificationToFirebase(employerCode, sender, text) {
    onFirebaseReady.then((firebase) => {
      if (!firebase || !employerCode) return;
      firebase.addDoc(firebase.collection(firebase.db, "notifications"), {
        employerCode,
        deviceId: getOrCreateDeviceId(),
        sender,
        text,
        createdAt: firebase.serverTimestamp(),
      }).catch(() => {});
    });
  }

  const NAME_KEYS = { auftragnehmer: "easycheck-name-auftragnehmer", auftraggeber: "easycheck-name-auftraggeber" };
  function loadName(role) {
    try { return localStorage.getItem(NAME_KEYS[role]); } catch (e) { return null; }
  }
  function saveName(role, name) {
    try { localStorage.setItem(NAME_KEYS[role], name); } catch (e) {}
  }

  const EMAIL_KEYS = { auftragnehmer: "easycheck-email-auftragnehmer", auftraggeber: "easycheck-email-auftraggeber" };
  function loadEmail(role) {
    try { return localStorage.getItem(EMAIL_KEYS[role]); } catch (e) { return null; }
  }
  function saveEmail(role, email) {
    try { localStorage.setItem(EMAIL_KEYS[role], email); } catch (e) {}
  }

  const ADDRESS_KEY = "easycheck-address-auftraggeber";
  function loadAddress() {
    try { return localStorage.getItem(ADDRESS_KEY); } catch (e) { return null; }
  }
  function saveAddress(address) {
    try { localStorage.setItem(ADDRESS_KEY, address); } catch (e) {}
  }

  const INVITE_CODE_KEY = "easycheck-invite-code";
  function getOrCreateInviteCode() {
    try {
      let code = localStorage.getItem(INVITE_CODE_KEY);
      if (!code) {
        code = generateInviteCode();
        localStorage.setItem(INVITE_CODE_KEY, code);
      }
      return code;
    } catch (e) {
      return generateInviteCode();
    }
  }

  const AUTO_ACCEPT_KEY = "easycheck-auto-accept";
  function loadAutoAccept() {
    try {
      const raw = localStorage.getItem(AUTO_ACCEPT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch (e) {}
    return { auftragnehmer: false, auftraggeber: false };
  }
  function saveAutoAccept() {
    try { localStorage.setItem(AUTO_ACCEPT_KEY, JSON.stringify(state.autoAccept)); } catch (e) {}
  }

  const state = {
    termine: { auftragnehmer: [], auftraggeber: [] },
    appointmentsLoaded: { auftragnehmer: false, auftraggeber: false },
    employees: [],
    connectedEmployers: [],
    workHistory: loadWorkHistory(),
    workSession: loadWorkSession(),
    autoAccept: loadAutoAccept(),
    postfach: { auftragnehmer: [], auftraggeber: [] },
    calendarView: {
      auftragnehmer: { year: today.getFullYear(), month: today.getMonth() },
      auftraggeber: { year: today.getFullYear(), month: today.getMonth() },
    },
    selectedDate: { auftragnehmer: null, auftraggeber: null },
  };

  function nameFromEmail(email) {
    const local = email.split("@")[0] || email;
    return local.charAt(0).toUpperCase() + local.slice(1);
  }

  const LAST_ROLE_KEY = "easycheck-last-role";
  function saveLastRole(role) {
    try { localStorage.setItem(LAST_ROLE_KEY, role); } catch (e) {}
  }
  function getLastRole() {
    try { return localStorage.getItem(LAST_ROLE_KEY); } catch (e) { return null; }
  }

  function showView(id) {
    views.forEach(v => v.classList.toggle("active", v.id === id));

    const navId = appViewNavMap[id];
    document.body.classList.toggle("show-nav", !!navId);
    document.body.classList.toggle("role-ag", id === "view-app-ag");
    document.querySelectorAll(".bottom-nav").forEach(nav => {
      nav.classList.toggle("active", nav.id === navId);
    });

    const topbarBadge = document.getElementById("topbar-badge");
    if (topbarBadge) {
      if (id === "view-app-an") topbarBadge.textContent = "Auftragnehmer";
      else if (id === "view-app-ag") topbarBadge.textContent = "Auftraggeber";
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function generateInviteCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  const inviteCodeEl = document.getElementById("ag-invite-code");
  const inviteCopyBtn = document.getElementById("ag-invite-copy");
  inviteCopyBtn.addEventListener("click", () => {
    const code = inviteCodeEl.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    const original = inviteCopyBtn.textContent;
    inviteCopyBtn.textContent = "Kopiert ✓";
    setTimeout(() => { inviteCopyBtn.textContent = original; }, 1800);
  });

  // ---------- Kalender ----------
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const monthShort = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const weekdayLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  function renderCalendar(role, containerId) {
    const container = document.getElementById(containerId);
    const view = state.calendarView[role];
    const year = view.year;
    const month = view.month;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const todayKey = formatDateKey(today);
    const eventCounts = {};
    state.termine[role].filter(t => t.status !== "declined").forEach(t => {
      eventCounts[t.date] = (eventCounts[t.date] || 0) + 1;
    });

    let html = `<div class="calendar-header">
      <button type="button" class="calendar-nav" data-dir="-1" aria-label="Vorheriger Monat">‹</button>
      <span>${monthNames[month]} ${year}</span>
      <button type="button" class="calendar-nav" data-dir="1" aria-label="Nächster Monat">›</button>
    </div><div class="calendar-grid">`;
    weekdayLabels.forEach(w => { html += `<div class="calendar-weekday">${w}</div>`; });
    for (let i = 0; i < startWeekday; i++) {
      html += `<div class="calendar-day"></div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = formatDateKey(new Date(year, month, d));
      const count = eventCounts[dateKey] || 0;
      const classes = ["calendar-day", "in-month"];
      if (dateKey === todayKey) classes.push("today");
      if (count > 0) classes.push("has-event");
      if (dateKey === state.selectedDate[role]) classes.push("selected");
      const dots = count > 0
        ? `<div class="calendar-day-dots">${"<span></span>".repeat(Math.min(count, 4))}</div>`
        : "";
      html += `<div class="${classes.join(" ")}" data-date="${dateKey}">${d}${dots}</div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
  }

  function setupCalendarNav(role, containerId) {
    const container = document.getElementById(containerId);
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".calendar-nav");
      if (!btn) return;
      const view = state.calendarView[role];
      view.month += Number(btn.dataset.dir);
      if (view.month < 0) { view.month = 11; view.year -= 1; }
      if (view.month > 11) { view.month = 0; view.year += 1; }
      renderCalendar(role, containerId);
    });
  }

  function setupCalendarDayClick(role, calendarContainerId, appointmentsContainerId) {
    const container = document.getElementById(calendarContainerId);
    container.addEventListener("click", (e) => {
      const day = e.target.closest(".calendar-day.in-month");
      if (!day) return;
      const date = day.dataset.date;
      state.selectedDate[role] = (state.selectedDate[role] === date) ? null : date;
      renderCalendar(role, calendarContainerId);
      renderAppointments(role, appointmentsContainerId);
    });
  }

  function renderAppointments(role, containerId) {
    const container = document.getElementById(containerId);
    const selected = state.selectedDate[role];
    let list = state.termine[role].filter(t => t.status !== "declined");
    if (selected) {
      list = list.filter(t => t.date === selected);
    }
    list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    if (list.length === 0) {
      const emptyText = selected ? "Keine Termine an diesem Tag." : "Noch keine Termine eingetragen.";
      container.innerHTML = `<div class="appointment-empty">${emptyText}</div>`;
      return;
    }

    container.innerHTML = list.map(t => {
      const [y, m, d] = t.date.split("-").map(Number);
      let statusBadge = "";
      if (t.status === "pending") {
        statusBadge = `<span class="appointment-pending">Angefragt</span>`;
      } else if (t.status === "confirmed") {
        statusBadge = `<span class="appointment-confirmed">Bestätigt ✓</span>`;
      }
      return `<div class="appointment-row">
        <div class="appointment-date"><div class="day">${d}</div><div class="month">${monthShort[m - 1]}</div></div>
        <div class="appointment-info">
          <div class="appointment-title">${escapeHtml(t.title)}</div>
          <div class="appointment-time">${escapeHtml(t.time)} Uhr</div>
        </div>
        ${statusBadge}
      </div>`;
    }).join("");
  }

  function renderNextAppointment(role, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const now = new Date();
    const nowKey = formatDateKey(now) + String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
    const upcoming = state.termine[role]
      .filter(t => t.status !== "declined" && (t.date + t.time.replace(":", "")) >= nowKey)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];

    if (!upcoming) {
      container.innerHTML = `<div class="upcoming-empty">Keine anstehenden Termine geplant.</div>`;
      return;
    }

    const [y, m, d] = upcoming.date.split("-").map(Number);
    container.innerHTML = `<div class="upcoming-item">
      <div class="appointment-date"><div class="day">${d}</div><div class="month">${monthShort[m - 1]}</div></div>
      <div class="appointment-info">
        <div class="appointment-title">${escapeHtml(upcoming.title)}</div>
        <div class="appointment-time">${escapeHtml(upcoming.time)} Uhr</div>
      </div>
    </div>`;
  }

  function refreshCalendar(role) {
    if (role === "auftragnehmer") {
      renderCalendar("auftragnehmer", "an-calendar");
      renderAppointments("auftragnehmer", "an-appointments");
    } else {
      renderCalendar("auftraggeber", "ag-calendar");
      renderAppointments("auftraggeber", "ag-appointments");
      renderNextAppointment("auftraggeber", "ag-next-appointment");
    }
  }

  // ---------- Mitarbeiterliste ----------
  function renderEmployeeList() {
    const container = document.getElementById("ag-employee-list");
    if (!container) return;

    if (state.employees.length === 0) {
      container.innerHTML = `<div class="appointment-empty">Noch keine Mitarbeiter verbunden. Teile deinen Einladungscode, um Auftragnehmer hinzuzufügen.</div>`;
      return;
    }

    container.innerHTML = state.employees.map(emp => `
      <div class="employee-row">
        <div class="employee-avatar">${escapeHtml(emp.initials || emp.name.slice(0, 2).toUpperCase())}</div>
        <div class="employee-info">
          <div class="employee-name">${escapeHtml(emp.name)}</div>
          <div class="employee-meta">${emp.hours.toLocaleString("de-DE")} Std. diesen Monat</div>
        </div>
        <span class="employee-status ${emp.active ? "status-active" : "status-offline"}">${emp.active ? "Aktiv" : "Offline"}</span>
        <button type="button" class="employee-remove" data-connection-id="${escapeHtml(emp.connectionId)}" data-label="${escapeHtml(emp.name)}" aria-label="${escapeHtml(emp.name)} entfernen">✕</button>
      </div>
    `).join("");
  }

  // ---------- Verbundene Auftraggeber (Auftragnehmer) ----------
  function renderConnectedEmployers() {
    const container = document.getElementById("an-employer-list");
    if (!container) return;

    if (state.connectedEmployers.length === 0) {
      container.innerHTML = `<div class="appointment-empty">Noch keine Auftraggeber verbunden. Gib unter Account den Code deines Auftraggebers ein.</div>`;
      return;
    }

    container.innerHTML = state.connectedEmployers.map(emp => `
      <div class="employee-row">
        <div class="employee-avatar">${escapeHtml(emp.code.slice(0, 2))}</div>
        <div class="employee-info">
          <div class="employee-name">Auftraggeber ${escapeHtml(emp.code)}</div>
          <div class="employee-meta">Verbunden</div>
        </div>
        <span class="employee-status status-active">Aktiv</span>
        <button type="button" class="employee-remove" data-connection-id="${escapeHtml(emp.connectionId)}" data-label="Auftraggeber ${escapeHtml(emp.code)}" aria-label="Auftraggeber ${escapeHtml(emp.code)} entfernen">✕</button>
      </div>
    `).join("");
  }

  // ---------- Verbindung entfernen ----------
  const confirmRemoveOverlay = document.getElementById("confirm-remove-overlay");
  const confirmRemoveText = document.getElementById("confirm-remove-text");
  let pendingRemovalId = null;

  function closeConfirmRemove() {
    confirmRemoveOverlay.classList.remove("active");
    pendingRemovalId = null;
  }

  function setupRemoveButtons(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".employee-remove");
      if (!btn) return;
      pendingRemovalId = btn.dataset.connectionId;
      confirmRemoveText.textContent =
        `Soll die Verbindung zu ${btn.dataset.label} wirklich entfernt werden? Bereits erfasste Arbeitszeiten bleiben erhalten.`;
      confirmRemoveOverlay.classList.add("active");
    });
  }

  setupRemoveButtons("ag-employee-list");
  setupRemoveButtons("an-employer-list");

  document.getElementById("confirm-remove-cancel").addEventListener("click", closeConfirmRemove);
  confirmRemoveOverlay.addEventListener("click", (e) => {
    if (e.target === confirmRemoveOverlay) closeConfirmRemove();
  });
  document.getElementById("confirm-remove-ok").addEventListener("click", () => {
    if (pendingRemovalId) removeConnectionFromFirebase(pendingRemovalId);
    closeConfirmRemove();
  });

  const connectForm = document.getElementById("form-connect-employer");
  const connectCodeInput = document.getElementById("connect-code");
  const connectErrorEl = document.getElementById("connect-error");
  connectForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = connectCodeInput.value.trim().toUpperCase();

    if (!code) {
      connectErrorEl.textContent = "Bitte gib einen Code ein.";
      return;
    }
    if (state.connectedEmployers.some(emp => emp.code === code)) {
      connectErrorEl.textContent = "Mit diesem Code bist du bereits verbunden.";
      return;
    }

    connectErrorEl.textContent = "";
    connectForm.reset();

    const workerDisplayName = (document.getElementById("an-welcome-name").textContent || "").trim() || "Auftragnehmer";
    connectEmployeeToFirebase(code, workerDisplayName);
  });

  // ---------- Auftragnehmer Home-Statistik ----------
  function renderAnStats() {
    const employerEl = document.getElementById("an-stat-employers");
    const hoursEl = document.getElementById("an-stat-hours");
    if (!employerEl || !hoursEl) return;

    employerEl.textContent = state.connectedEmployers.length;

    const now = new Date();
    const monthHours = state.workHistory
      .filter(s => {
        const d = new Date(s.startTime);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((sum, s) => sum + s.hours, 0);
    hoursEl.textContent = monthHours.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  }

  // ---------- Arbeitszeit Start/Stop ----------
  const btnWorkStart = document.getElementById("btn-work-start");
  const btnWorkStop = document.getElementById("btn-work-stop");
  const workStartOverlay = document.getElementById("work-start-overlay");
  const workEmployerSelect = document.getElementById("work-employer");
  const workRateInput = document.getElementById("work-rate");
  const workPersonsInput = document.getElementById("work-persons");
  const workStartError = document.getElementById("work-start-error");
  const formWorkStart = document.getElementById("form-work-start");
  const workResultOverlay = document.getElementById("work-result-overlay");
  let workTickInterval = null;

  function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(totalSeconds % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  function updateWorkButtons() {
    const active = !!state.workSession;
    btnWorkStart.classList.toggle("hidden", active);
    btnWorkStop.classList.toggle("hidden", !active);

    if (active && !workTickInterval) {
      const tick = () => {
        btnWorkStop.textContent = `■ Stop (${formatDuration(Date.now() - state.workSession.startTime)})`;
      };
      tick();
      workTickInterval = setInterval(tick, 1000);
    } else if (!active && workTickInterval) {
      clearInterval(workTickInterval);
      workTickInterval = null;
      btnWorkStop.textContent = "■ Stop";
    }
  }

  btnWorkStart.addEventListener("click", () => {
    if (state.connectedEmployers.length === 0) {
      workStartError.textContent = "Bitte verbinde dich unter Account zuerst mit einem Auftraggeber.";
      workEmployerSelect.innerHTML = "";
    } else {
      workStartError.textContent = "";
      workEmployerSelect.innerHTML = state.connectedEmployers
        .map(emp => `<option value="${escapeHtml(emp.code)}">Auftraggeber ${escapeHtml(emp.code)}</option>`)
        .join("");
    }
    formWorkStart.reset();
    workStartOverlay.classList.add("active");
  });

  document.getElementById("work-start-cancel").addEventListener("click", () => {
    workStartOverlay.classList.remove("active");
  });
  workStartOverlay.addEventListener("click", (e) => {
    if (e.target === workStartOverlay) workStartOverlay.classList.remove("active");
  });

  function workerName() {
    const el = document.getElementById("an-welcome-name");
    return (el && el.textContent.trim()) || "Ein Auftragnehmer";
  }

  function sendWorkNotification(employerCode, text) {
    sendWorkNotificationToFirebase(employerCode, workerName(), text);
  }

  formWorkStart.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.connectedEmployers.length === 0) return;

    const employerCode = workEmployerSelect.value;
    const rate = parseFloat(workRateInput.value);
    const persons = parseInt(workPersonsInput.value, 10);

    if (!employerCode || !(rate > 0) || !(persons > 0)) {
      workStartError.textContent = "Bitte fülle alle Felder korrekt aus.";
      return;
    }
    workStartError.textContent = "";

    state.workSession = { employerCode, rate, persons, startTime: Date.now() };
    saveWorkSession();
    updateWorkButtons();
    workStartOverlay.classList.remove("active");

    sendWorkNotification(employerCode, `${workerName()} hat die Arbeitszeit gestartet (Auftraggeber ${escapeHtml(employerCode)}).`);
  });

  btnWorkStop.addEventListener("click", () => {
    if (!state.workSession) return;
    const session = state.workSession;
    const endTime = Date.now();
    const hours = (endTime - session.startTime) / 3600000;
    const earnings = hours * session.rate * session.persons;

    state.workHistory.push({
      employerCode: session.employerCode,
      rate: session.rate,
      persons: session.persons,
      startTime: session.startTime,
      endTime,
      hours,
      earnings,
    });
    saveWorkHistory();

    state.workSession = null;
    saveWorkSession();
    updateWorkButtons();
    renderAnStats();

    const durationLabel = formatDuration(endTime - session.startTime);
    const earningsLabel = earnings.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

    document.getElementById("work-result-time").textContent = durationLabel;
    document.getElementById("work-result-money").textContent = earningsLabel;
    workResultOverlay.classList.add("active");

    sendWorkNotification(session.employerCode, `${workerName()} hat die Arbeitszeit beendet: ${durationLabel} gearbeitet, ${earningsLabel} verdient.`);
  });

  document.getElementById("work-result-close").addEventListener("click", () => {
    workResultOverlay.classList.remove("active");
  });
  workResultOverlay.addEventListener("click", (e) => {
    if (e.target === workResultOverlay) workResultOverlay.classList.remove("active");
  });

  // ---------- Postfach ----------
  const postfachContainerId = { auftragnehmer: "an-postfach", auftraggeber: "ag-postfach" };

  function otherRole(role) {
    return role === "auftragnehmer" ? "auftraggeber" : "auftragnehmer";
  }

  function renderPostfach(role) {
    const container = document.getElementById(postfachContainerId[role]);
    if (!container) return;

    const requestMessages = state.termine[role]
      .filter(t => t.requestedByRole === otherRole(role))
      .map(t => {
        const [y, m, d] = t.date.split("-").map(Number);
        const dateLabel = `${d}.${m}.${String(y).slice(-2)}`;
        const [hh, mm] = t.time.split(":");
        const timeLabel = mm === "00" ? `${Number(hh)} Uhr` : `${t.time} Uhr`;
        return {
          id: t.id,
          sender: t.requestedByName || (otherRole(role) === "auftragnehmer" ? "Ein Auftragnehmer" : "Ein Auftraggeber"),
          text: `${t.title} am ${dateLabel} um ${timeLabel}`,
          unread: t.status === "pending",
          type: "termin-request",
          status: t.status,
          sortKey: (t.createdAt && t.createdAt.toMillis) ? t.createdAt.toMillis() : Date.now(),
        };
      });

    const notifications = state.postfach[role];
    const messages = [...requestMessages, ...notifications].sort((a, b) => (b.sortKey || 0) - (a.sortKey || 0));

    if (messages.length === 0) {
      container.innerHTML = `<div class="appointment-empty">Keine Nachrichten vorhanden.</div>`;
      return;
    }

    container.innerHTML = messages.map(msg => {
      let actions = "";
      if (msg.type === "termin-request" && msg.status === "pending") {
        actions = `
          <div class="message-actions">
            <button type="button" class="message-icon-btn decline message-decline" data-id="${msg.id}" aria-label="Ablehnen">✗</button>
            <button type="button" class="message-icon-btn accept message-accept" data-id="${msg.id}" aria-label="Annehmen">✓</button>
          </div>`;
      } else if (msg.type === "termin-request") {
        const accepted = msg.status === "confirmed";
        actions = `<span class="employee-status ${accepted ? "status-active" : "status-offline"} message-status-badge">${accepted ? "Angenommen ✓" : "Abgelehnt ✗"}</span>`;
      }

      return `
      <div class="message-row ${msg.unread ? "unread" : ""}">
        <span class="message-dot"></span>
        <div class="message-info">
          <div class="message-sender">${escapeHtml(msg.sender)}</div>
          <div class="message-text">${escapeHtml(msg.text)}</div>
        </div>
        ${actions}
      </div>`;
    }).join("");
  }

  function sendTerminRequest(fromRole, payload) {
    const senderNameEl = document.getElementById(fromRole === "auftragnehmer" ? "an-welcome-name" : "ag-welcome-name");
    const senderName = (senderNameEl && senderNameEl.textContent.trim())
      || (fromRole === "auftragnehmer" ? "Ein Auftragnehmer" : "Ein Auftraggeber");

    createAppointmentInFirebase({
      employerCode: payload.employerCode,
      deviceId: payload.deviceId,
      title: payload.title,
      date: payload.date,
      time: payload.time,
      requestedByRole: fromRole,
      requestedByName: senderName,
    });
  }

  function acceptTerminMessage(role, msg) {
    updateAppointmentStatusInFirebase(msg.id, "confirmed");
  }

  function declineTerminMessage(role, msg) {
    updateAppointmentStatusInFirebase(msg.id, "declined");
  }

  function setupPostfachActions(role) {
    const container = document.getElementById(postfachContainerId[role]);
    if (!container) return;

    container.addEventListener("click", (e) => {
      const acceptBtn = e.target.closest(".message-accept");
      const declineBtn = e.target.closest(".message-decline");
      if (!acceptBtn && !declineBtn) return;

      const id = (acceptBtn || declineBtn).dataset.id;
      const msg = state.termine[role].find(t => t.id === id);
      if (!msg) return;

      if (acceptBtn) {
        acceptTerminMessage(role, msg);
      } else {
        declineTerminMessage(role, msg);
      }
    });
  }

  // ---------- Monatsübersicht (Popup am Monatsende) ----------
  const monthlyOverlay = document.getElementById("monthly-overlay");
  const monthlySubtitle = document.getElementById("monthly-subtitle");
  const monthlyList = document.getElementById("monthly-employee-list");

  function openMonthlySummary() {
    const now = new Date();
    monthlySubtitle.textContent = `Arbeitsstunden deiner Mitarbeiter im ${monthNames[now.getMonth()]} ${now.getFullYear()}.`;

    if (state.employees.length === 0) {
      monthlyList.innerHTML = `<div class="appointment-empty">Für diesen Monat liegen noch keine Mitarbeiterdaten vor.</div>`;
    } else {
      const sorted = [...state.employees].sort((a, b) => b.hours - a.hours);
      monthlyList.innerHTML = sorted.map(emp => `
        <div class="employee-row">
          <div class="employee-avatar">${escapeHtml(emp.initials || emp.name.slice(0, 2).toUpperCase())}</div>
          <div class="employee-info">
            <div class="employee-name">${escapeHtml(emp.name)}</div>
          </div>
          <span class="employee-status status-active">${emp.hours.toLocaleString("de-DE")} Std.</span>
        </div>
      `).join("");
    }

    monthlyOverlay.classList.add("active");
  }

  function closeMonthlySummary() {
    monthlyOverlay.classList.remove("active");
  }

  document.getElementById("btn-monthly-summary").addEventListener("click", openMonthlySummary);
  document.getElementById("monthly-close").addEventListener("click", closeMonthlySummary);
  monthlyOverlay.addEventListener("click", (e) => {
    if (e.target === monthlyOverlay) closeMonthlySummary();
  });

  function isLastDayOfMonth(date) {
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return date.getDate() === lastDay;
  }

  function maybeAutoShowMonthlySummary() {
    const now = new Date();
    if (!isLastDayOfMonth(now)) return;

    const key = `easycheck-monthly-popup-${now.getFullYear()}-${now.getMonth() + 1}`;
    if (localStorage.getItem(key)) return;

    localStorage.setItem(key, "1");
    setTimeout(openMonthlySummary, 600);
  }

  // ---------- Termin-Modal ----------
  const terminOverlay = document.getElementById("termin-overlay");
  const terminForm = document.getElementById("form-termin");
  const terminTargetSelect = document.getElementById("termin-target");
  const terminTitleInput = document.getElementById("termin-title");
  const terminDateInput = document.getElementById("termin-date");
  const terminTimeInput = document.getElementById("termin-time");
  let terminRole = null;

  function closeTerminModal() {
    terminOverlay.classList.remove("active");
    terminRole = null;
  }

  function populateTerminTargets(role) {
    if (role === "auftragnehmer") {
      terminTargetSelect.innerHTML = state.connectedEmployers
        .map(e => `<option value="${escapeHtml(e.code)}">Auftraggeber ${escapeHtml(e.code)}</option>`)
        .join("");
    } else {
      terminTargetSelect.innerHTML = state.employees
        .map(e => `<option value="${escapeHtml(e.deviceId)}">${escapeHtml(e.name)}</option>`)
        .join("");
    }
  }

  document.querySelectorAll(".fab-add[data-role]").forEach(btn => {
    btn.addEventListener("click", () => {
      terminRole = btn.dataset.role;
      terminForm.reset();
      populateTerminTargets(terminRole);
      terminOverlay.classList.add("active");

      const hasTargets = terminTargetSelect.options.length > 0;
      terminTargetSelect.disabled = !hasTargets;
      const emptyMsg = terminRole === "auftragnehmer"
        ? "Du musst dich zuerst unter Account mit einem Auftraggeber verbinden."
        : "Du hast noch keine Mitarbeiter. Teile deinen Einladungscode.";
      terminTargetSelect.innerHTML = hasTargets ? terminTargetSelect.innerHTML : `<option value="">${emptyMsg}</option>`;

      if (hasTargets) terminTitleInput.focus();
    });
  });

  document.getElementById("termin-cancel").addEventListener("click", closeTerminModal);
  terminOverlay.addEventListener("click", (e) => {
    if (e.target === terminOverlay) closeTerminModal();
  });

  terminForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!terminRole) return;

    const target = terminTargetSelect.value;
    const title = terminTitleInput.value.trim();
    const date = terminDateInput.value;
    const time = terminTimeInput.value;
    if (!target || !title || !date || !time) return;

    const employerCode = terminRole === "auftragnehmer" ? target : getOrCreateInviteCode();
    const deviceId = terminRole === "auftragnehmer" ? getOrCreateDeviceId() : target;
    sendTerminRequest(terminRole, { title, date, time, employerCode, deviceId });
    closeTerminModal();
  });

  setupCalendarNav("auftragnehmer", "an-calendar");
  setupCalendarNav("auftraggeber", "ag-calendar");
  setupCalendarDayClick("auftragnehmer", "an-calendar", "an-appointments");
  setupCalendarDayClick("auftraggeber", "ag-calendar", "ag-appointments");
  refreshCalendar("auftragnehmer");
  refreshCalendar("auftraggeber");
  renderEmployeeList();
  renderConnectedEmployers();
  renderAnStats();
  updateWorkButtons();
  renderPostfach("auftragnehmer");
  renderPostfach("auftraggeber");
  setupPostfachActions("auftragnehmer");
  setupPostfachActions("auftraggeber");

  function setupAutoAcceptToggle(role, toggleId) {
    const toggle = document.getElementById(toggleId);
    if (!toggle) return;
    toggle.checked = !!state.autoAccept[role];
    toggle.addEventListener("change", () => {
      state.autoAccept[role] = toggle.checked;
      saveAutoAccept();
    });
  }
  setupAutoAcceptToggle("auftragnehmer", "an-auto-accept-toggle");
  setupAutoAcceptToggle("auftraggeber", "ag-auto-accept-toggle");

  // ---------- Name bearbeiten ----------
  const editNameOverlay = document.getElementById("edit-name-overlay");
  const editNameForm = document.getElementById("form-edit-name");
  const editNameInput = document.getElementById("edit-name-input");
  let editingNameRole = null;

  function closeEditNameModal() {
    editNameOverlay.classList.remove("active");
    editingNameRole = null;
  }

  document.body.addEventListener("click", (e) => {
    const trigger = e.target.closest(".editable-name");
    if (!trigger) return;
    editingNameRole = trigger.id === "an-name-edit-trigger" ? "auftragnehmer" : "auftraggeber";
    const valueEl = document.getElementById(editingNameRole === "auftragnehmer" ? "an-name-value" : "ag-name-value");
    editNameInput.value = valueEl ? valueEl.textContent : "";
    editNameOverlay.classList.add("active");
    editNameInput.focus();
  });

  document.getElementById("edit-name-cancel").addEventListener("click", closeEditNameModal);
  editNameOverlay.addEventListener("click", (e) => {
    if (e.target === editNameOverlay) closeEditNameModal();
  });

  editNameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!editingNameRole) return;
    const newName = editNameInput.value.trim();
    if (!newName) return;

    saveName(editingNameRole, newName);

    if (editingNameRole === "auftragnehmer") {
      document.getElementById("an-welcome-name").textContent = newName;
      const valueEl = document.getElementById("an-name-value");
      if (valueEl) valueEl.textContent = newName;
    } else {
      document.getElementById("ag-welcome-name").textContent = newName;
      const valueEl = document.getElementById("ag-name-value");
      if (valueEl) valueEl.textContent = newName;
    }

    closeEditNameModal();
  });

  let pendingRegisterRole = null;

  document.getElementById("btn-register").addEventListener("click", () => showView("view-role"));
  document.getElementById("btn-login").addEventListener("click", () => {
    document.getElementById("login-error").textContent = "";
    document.getElementById("form-login").reset();
    showView("view-login");
  });

  document.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.back));
  });

  document.getElementById("btn-role-auftragnehmer").addEventListener("click", () => {
    pendingRegisterRole = "auftragnehmer";
    document.getElementById("reg-error").textContent = "";
    document.getElementById("form-register").reset();
    showView("view-register");
  });

  document.getElementById("btn-role-auftraggeber").addEventListener("click", () => {
    pendingRegisterRole = "auftraggeber";
    document.getElementById("reg-error").textContent = "";
    document.getElementById("form-register").reset();
    showView("view-register");
  });

  document.getElementById("form-register").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!pendingRegisterRole) return;

    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const errorEl = document.getElementById("reg-error");

    if (!email || !password) {
      errorEl.textContent = "Bitte fülle alle Felder aus.";
      return;
    }
    errorEl.textContent = "";
    document.getElementById("form-register").reset();

    if (pendingRegisterRole === "auftragnehmer") {
      goToAuftragnehmerDashboard(nameFromEmail(email), email);
    } else {
      goToAuftraggeberDashboard(nameFromEmail(email), email);
    }
    pendingRegisterRole = null;
  });

  document.getElementById("form-login").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");

    if (!email || !password) {
      errorEl.textContent = "Bitte fülle alle Felder aus.";
      return;
    }

    const role = getLastRole();
    const storedName = role ? loadName(role) : null;
    if (!role || !storedName) {
      errorEl.textContent = "Kein Konto gefunden. Bitte registriere dich zuerst.";
      return;
    }
    errorEl.textContent = "";
    document.getElementById("form-login").reset();

    saveEmail(role, email);
    if (role === "auftragnehmer") {
      goToAuftragnehmerDashboard(storedName, email);
    } else {
      goToAuftraggeberDashboard(storedName, email, loadAddress());
    }
  });

  document.getElementById("btn-logout-an").addEventListener("click", () => showView("view-start"));
  document.getElementById("btn-logout-ag").addEventListener("click", () => {
    if (unsubscribeEmployees) { unsubscribeEmployees(); unsubscribeEmployees = null; }
    showView("view-start");
  });

  // Bottom navigation, scoped per dashboard (Auftragnehmer / Auftraggeber)
  function setupBottomNav(navId, viewId) {
    const nav = document.getElementById(navId);
    const view = document.getElementById(viewId);
    const navButtons = nav.querySelectorAll(".nav-btn");
    const panels = view.querySelectorAll(".app-panel");

    navButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        navButtons.forEach(b => b.classList.toggle("active", b === btn));
        panels.forEach(p => p.classList.toggle("active", p.id === btn.dataset.panel));
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    return function reset() {
      const firstBtn = navButtons[0];
      navButtons.forEach(b => b.classList.toggle("active", b === firstBtn));
      panels.forEach(p => p.classList.toggle("active", p.id === firstBtn.dataset.panel));
    };
  }

  const resetNavAn = setupBottomNav("bottom-nav-an", "view-app-an");
  const resetNavAg = setupBottomNav("bottom-nav-ag", "view-app-ag");

  function goToAuftragnehmerDashboard(name, email) {
    saveLastRole("auftragnehmer");
    const storedName = loadName("auftragnehmer");
    const finalName = storedName || name;
    if (!storedName) saveName("auftragnehmer", finalName);

    const storedEmail = loadEmail("auftragnehmer");
    const finalEmail = storedEmail || email;
    if (!storedEmail) saveEmail("auftragnehmer", finalEmail);

    const extra = `<div><b>E-Mail:</b> ${escapeHtml(finalEmail)}</div>`;

    document.getElementById("an-welcome-name").textContent = finalName;
    document.getElementById("an-welcome-text").textContent =
      "Dein Profil wurde erstellt. Du kannst deine Arbeitszeit jetzt ganz einfach erfassen und im Überblick behalten.";

    document.getElementById("an-welcome-summary").innerHTML = extra;
    document.getElementById("an-account-summary").innerHTML =
      `<div class="editable-name" id="an-name-edit-trigger"><b>Name:</b> <span id="an-name-value">${escapeHtml(finalName)}</span> <span class="edit-pencil">✏️</span></div>` + extra;

    renderAnStats();
    subscribeAppointmentsForAN(getOrCreateDeviceId());
    subscribeEmployersForAN(getOrCreateDeviceId());
    resetNavAn();
    showView("view-app-an");
  }

  function goToAuftraggeberDashboard(name, email, address) {
    saveLastRole("auftraggeber");
    const storedName = loadName("auftraggeber");
    const finalName = storedName || name;
    if (!storedName) saveName("auftraggeber", finalName);

    const storedEmail = loadEmail("auftraggeber");
    const finalEmail = storedEmail || email;
    if (!storedEmail) saveEmail("auftraggeber", finalEmail);

    const storedAddress = loadAddress();
    const finalAddress = storedAddress || address || "";
    if (!storedAddress && address) saveAddress(address);

    const extra = `<div><b>E-Mail:</b> ${escapeHtml(finalEmail)}</div>` +
      (finalAddress ? `<div><b>Adresse:</b> ${escapeHtml(finalAddress)}</div>` : "");

    document.getElementById("ag-welcome-name").textContent = finalName;
    document.getElementById("ag-welcome-text").textContent =
      "Dein Profil wurde erstellt. Hier ist der Überblick über deine Mitarbeiter.";

    document.getElementById("ag-welcome-summary").innerHTML = extra;
    document.getElementById("ag-account-summary").innerHTML =
      `<div class="editable-name" id="ag-name-edit-trigger"><b>Name:</b> <span id="ag-name-value">${escapeHtml(finalName)}</span> <span class="edit-pencil">✏️</span></div>` + extra;

    const inviteCode = getOrCreateInviteCode();
    inviteCodeEl.textContent = inviteCode;

    document.getElementById("ag-stat-mitarbeiter").textContent = state.employees.length;
    renderEmployeeList();
    subscribeEmployeesForCode(inviteCode);
    subscribeAppointmentsForAG(inviteCode);
    subscribeNotificationsForAG(inviteCode);

    resetNavAg();
    showView("view-app-ag");
    maybeAutoShowMonthlySummary();
  }

  // Auftragnehmer form
  document.getElementById("form-auftragnehmer").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("an-name").value.trim();
    const email = document.getElementById("an-email").value.trim();
    const password = document.getElementById("an-password").value;
    const errorEl = document.getElementById("an-error");

    if (!name || !email || !password) {
      errorEl.textContent = "Bitte fülle alle Felder aus.";
      return;
    }
    errorEl.textContent = "";

    if (document.getElementById("an-push").checked && "Notification" in window) {
      Notification.requestPermission().catch(() => {});
    }

    goToAuftragnehmerDashboard(name, email);
  });

  // Auftraggeber form
  document.getElementById("form-auftraggeber").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("ag-name").value.trim();
    const email = document.getElementById("ag-email").value.trim();
    const password = document.getElementById("ag-password").value;
    const address = document.getElementById("ag-address").value.trim();
    const zip = document.getElementById("ag-zip").value.trim();
    const errorEl = document.getElementById("ag-error");

    if (!name || !email || !password || !address || !zip) {
      errorEl.textContent = "Bitte fülle alle Felder aus.";
      return;
    }
    errorEl.textContent = "";

    if (document.getElementById("ag-push").checked && "Notification" in window) {
      Notification.requestPermission().catch(() => {});
    }

    goToAuftraggeberDashboard(name, email, `${address}, ${zip}`);
  });
})();
