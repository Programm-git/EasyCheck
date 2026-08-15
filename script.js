(() => {
  const views = document.querySelectorAll(".view");
  const appViewNavMap = {
    "view-app-an": "bottom-nav-an",
    "view-app-ag": "bottom-nav-ag",
  };
  const state = {
    location: { auftragnehmer: null, auftraggeber: null },
  };

  function showView(id) {
    views.forEach(v => v.classList.toggle("active", v.id === id));

    const navId = appViewNavMap[id];
    document.body.classList.toggle("show-nav", !!navId);
    document.querySelectorAll(".bottom-nav").forEach(nav => {
      nav.classList.toggle("active", nav.id === navId);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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
      `<div><b>E-Mail:</b> ${email}</div><div><b>Rolle:</b> Auftraggeber</div><div><b>Adresse:</b> ${address}, ${zip}</div><div><b>Standort:</b> geteilt ✓</div>`
    );
  });
})();
