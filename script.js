(() => {
  const views = document.querySelectorAll(".view");
  const appViewNavMap = {
    "view-app-an": "bottom-nav-an",
    "view-app-ag": "bottom-nav-ag",
  };
  const state = {
    termine: { auftragnehmer: [], auftraggeber: [] },
    employees: [],
    postfach: { auftragnehmer: [], auftraggeber: [] },
  };

  function showView(id) {
    views.forEach(v => v.classList.toggle("active", v.id === id));

    const navId = appViewNavMap[id];
    document.body.classList.toggle("show-nav", !!navId);
    document.body.classList.toggle("role-ag", id === "view-app-ag");
    document.querySelectorAll(".bottom-nav").forEach(nav => {
      nav.classList.toggle("active", nav.id === navId);
    });

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
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const todayKey = formatDateKey(now);
    const eventDates = new Set(state.termine[role].map(t => t.date));

    let html = `<div class="calendar-header">${monthNames[month]} ${year}</div><div class="calendar-grid">`;
    weekdayLabels.forEach(w => { html += `<div class="calendar-weekday">${w}</div>`; });
    for (let i = 0; i < startWeekday; i++) {
      html += `<div class="calendar-day"></div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = formatDateKey(new Date(year, month, d));
      const classes = ["calendar-day", "in-month"];
      if (dateKey === todayKey) classes.push("today");
      if (eventDates.has(dateKey)) classes.push("has-event");
      html += `<div class="${classes.join(" ")}">${d}</div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
  }

  function renderAppointments(role, containerId) {
    const container = document.getElementById(containerId);
    const list = [...state.termine[role]].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    if (list.length === 0) {
      container.innerHTML = `<div class="appointment-empty">Noch keine Termine eingetragen.</div>`;
      return;
    }

    container.innerHTML = list.map(t => {
      const [y, m, d] = t.date.split("-").map(Number);
      return `<div class="appointment-row">
        <div class="appointment-date"><div class="day">${d}</div><div class="month">${monthShort[m - 1]}</div></div>
        <div class="appointment-info">
          <div class="appointment-title">${escapeHtml(t.title)}</div>
          <div class="appointment-time">${escapeHtml(t.time)} Uhr</div>
        </div>
      </div>`;
    }).join("");
  }

  function renderNextAppointment(role, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const now = new Date();
    const nowKey = formatDateKey(now) + String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
    const upcoming = state.termine[role]
      .filter(t => (t.date + t.time.replace(":", "")) >= nowKey)
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
      </div>
    `).join("");
  }

  // ---------- Postfach ----------
  const postfachContainerId = { auftragnehmer: "an-postfach", auftraggeber: "ag-postfach" };

  function otherRole(role) {
    return role === "auftragnehmer" ? "auftraggeber" : "auftragnehmer";
  }

  function renderPostfach(role) {
    const container = document.getElementById(postfachContainerId[role]);
    if (!container) return;

    const messages = state.postfach[role];
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
        const accepted = msg.status === "accepted";
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
    const toRole = otherRole(fromRole);
    const senderNameEl = document.getElementById(fromRole === "auftragnehmer" ? "an-welcome-name" : "ag-welcome-name");
    const senderName = (senderNameEl && senderNameEl.textContent.trim())
      || (fromRole === "auftragnehmer" ? "Ein Auftragnehmer" : "Ein Auftraggeber");

    const [y, m, d] = payload.date.split("-").map(Number);
    const dateLabel = `${d}.${m}.${String(y).slice(-2)}`;
    const [hh, mm] = payload.time.split(":");
    const timeLabel = mm === "00" ? `${Number(hh)} Uhr` : `${payload.time} Uhr`;

    state.postfach[toRole].unshift({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender: senderName,
      text: `${payload.title} am ${dateLabel} um ${timeLabel}`,
      unread: true,
      type: "termin-request",
      payload,
      fromRole,
      status: "pending",
    });

    renderPostfach(toRole);
  }

  function setupPostfachActions(role) {
    const container = document.getElementById(postfachContainerId[role]);
    if (!container) return;

    container.addEventListener("click", (e) => {
      const acceptBtn = e.target.closest(".message-accept");
      const declineBtn = e.target.closest(".message-decline");
      if (!acceptBtn && !declineBtn) return;

      const id = (acceptBtn || declineBtn).dataset.id;
      const msg = state.postfach[role].find(m => m.id === id);
      if (!msg) return;

      if (acceptBtn) {
        msg.status = "accepted";
        state.termine[role].push(msg.payload);
        state.termine[msg.fromRole].push(msg.payload);
        refreshCalendar(role);
        refreshCalendar(msg.fromRole);
      } else {
        msg.status = "declined";
      }

      msg.unread = false;
      renderPostfach(role);
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
  const terminTitleInput = document.getElementById("termin-title");
  const terminDateInput = document.getElementById("termin-date");
  const terminTimeInput = document.getElementById("termin-time");
  let terminRole = null;

  function closeTerminModal() {
    terminOverlay.classList.remove("active");
    terminRole = null;
  }

  document.querySelectorAll(".fab-add[data-role]").forEach(btn => {
    btn.addEventListener("click", () => {
      terminRole = btn.dataset.role;
      terminForm.reset();
      terminOverlay.classList.add("active");
      terminTitleInput.focus();
    });
  });

  document.getElementById("termin-cancel").addEventListener("click", closeTerminModal);
  terminOverlay.addEventListener("click", (e) => {
    if (e.target === terminOverlay) closeTerminModal();
  });

  terminForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!terminRole) return;

    const title = terminTitleInput.value.trim();
    const date = terminDateInput.value;
    const time = terminTimeInput.value;
    if (!title || !date || !time) return;

    sendTerminRequest(terminRole, { title, date, time });
    closeTerminModal();
  });

  refreshCalendar("auftragnehmer");
  refreshCalendar("auftraggeber");
  renderEmployeeList();
  renderPostfach("auftragnehmer");
  renderPostfach("auftraggeber");
  setupPostfachActions("auftragnehmer");
  setupPostfachActions("auftraggeber");

  document.getElementById("btn-login").addEventListener("click", () => showView("view-role"));
  document.getElementById("btn-register").addEventListener("click", () => showView("view-role"));

  document.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.back));
  });

  document.getElementById("btn-role-auftragnehmer").addEventListener("click", () => showView("view-form-auftragnehmer"));
  document.getElementById("btn-role-auftraggeber").addEventListener("click", () => showView("view-form-auftraggeber"));

  document.getElementById("btn-logout-an").addEventListener("click", () => showView("view-start"));
  document.getElementById("btn-logout-ag").addEventListener("click", () => showView("view-start"));

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

  function goToAuftragnehmerDashboard(name, extra) {
    document.getElementById("an-welcome-name").textContent = name;
    document.getElementById("an-welcome-text").textContent =
      "Dein Profil wurde erstellt. Du kannst deine Arbeitszeit jetzt ganz einfach erfassen und im Überblick behalten.";

    document.getElementById("an-welcome-summary").innerHTML = extra;
    document.getElementById("an-account-summary").innerHTML =
      `<div><b>Name:</b> ${name}</div>` + extra;

    resetNavAn();
    showView("view-app-an");
  }

  function goToAuftraggeberDashboard(name, extra) {
    document.getElementById("ag-welcome-name").textContent = name;
    document.getElementById("ag-welcome-text").textContent =
      "Dein Profil wurde erstellt. Hier ist der Überblick über deine Mitarbeiter.";

    document.getElementById("ag-welcome-summary").innerHTML = extra;
    document.getElementById("ag-account-summary").innerHTML =
      `<div><b>Name:</b> ${name}</div>` + extra;

    inviteCodeEl.textContent = generateInviteCode();

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

    goToAuftragnehmerDashboard(name,
      `<div><b>E-Mail:</b> ${email}</div><div><b>Rolle:</b> Auftragnehmer</div>`
    );
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

    goToAuftraggeberDashboard(name,
      `<div><b>E-Mail:</b> ${email}</div><div><b>Adresse:</b> ${address}, ${zip}</div>`
    );
  });
})();
