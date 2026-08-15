(() => {
  const views = document.querySelectorAll(".view");
  const appViewNavMap = {
    "view-app-an": "bottom-nav-an",
    "view-app-ag": "bottom-nav-ag",
  };
  const state = {
    location: { auftragnehmer: null, auftraggeber: null },
    termine: { auftragnehmer: [], auftraggeber: [] },
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

  function refreshCalendar(role) {
    if (role === "auftragnehmer") {
      renderCalendar("auftragnehmer", "an-calendar");
      renderAppointments("auftragnehmer", "an-appointments");
    } else {
      renderCalendar("auftraggeber", "ag-calendar");
      renderAppointments("auftraggeber", "ag-appointments");
    }
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

  document.querySelectorAll(".fab-add").forEach(btn => {
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

    state.termine[terminRole].push({ title, date, time });
    refreshCalendar(terminRole);
    closeTerminModal();
  });

  refreshCalendar("auftragnehmer");
  refreshCalendar("auftraggeber");

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

  function setupLocationShare(role, buttonId, boxId, statusId, submitId) {
    const btn = document.getElementById(buttonId);
    const status = document.getElementById(statusId);
    const submit = document.getElementById(submitId);

    btn.addEventListener("click", () => {
      if (!navigator.geolocation) {
        status.textContent = "Geolocation wird von deinem Browser nicht unterstützt.";
        status.className = "location-status err";
        return;
      }
      status.textContent = "Standort wird angefragt …";
      status.className = "location-status";
      btn.disabled = true;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          state.location[role] = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          status.textContent = "Standort erfolgreich geteilt.";
          status.className = "location-status ok";
          btn.textContent = "Standort geteilt ✓";
          btn.classList.add("granted");
          btn.disabled = true;
          updateSubmitState(role);
        },
        (err) => {
          state.location[role] = null;
          status.textContent = "Standort konnte nicht ermittelt werden. Bitte erlaube den Zugriff.";
          status.className = "location-status err";
          btn.disabled = false;
          updateSubmitState(role);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  function updateSubmitState(role) {
    const submitId = role === "auftragnehmer" ? "an-submit" : "ag-submit";
    document.getElementById(submitId).disabled = !state.location[role];
  }

  setupLocationShare("auftragnehmer", "an-share-location", "an-location-box", "an-location-status", "an-submit");
  setupLocationShare("auftraggeber", "ag-share-location", "ag-location-box", "ag-location-status", "ag-submit");

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
    if (!state.location.auftragnehmer) {
      errorEl.textContent = "Bitte teile deinen Standort, um fortzufahren.";
      return;
    }
    errorEl.textContent = "";

    if (document.getElementById("an-push").checked && "Notification" in window) {
      Notification.requestPermission().catch(() => {});
    }

    goToAuftragnehmerDashboard(name,
      `<div><b>E-Mail:</b> ${email}</div><div><b>Rolle:</b> Auftragnehmer</div><div><b>Standort:</b> geteilt ✓</div>`
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
    if (!state.location.auftraggeber) {
      errorEl.textContent = "Bitte teile deinen Standort, um fortzufahren.";
      return;
    }
    errorEl.textContent = "";

    if (document.getElementById("ag-push").checked && "Notification" in window) {
      Notification.requestPermission().catch(() => {});
    }

    goToAuftraggeberDashboard(name,
      `<div><b>E-Mail:</b> ${email}</div><div><b>Adresse:</b> ${address}, ${zip}</div><div><b>Standort:</b> geteilt ✓</div>`
    );
  });
})();
