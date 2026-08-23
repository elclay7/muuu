(() => {
  const setupSection = document.getElementById("setup-section");
  const settingsSection = document.getElementById("settings-section");
  const setupForm = document.getElementById("setup-form");
  const settingsForm = document.getElementById("settings-form");
  const setupError = document.getElementById("setup-error");
  const settingsMessage = document.getElementById("settings-message");

  async function request(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No fue posible completar la operación.");
    return data;
  }

  async function load() {
    const status = await request("/api/auth/status");
    if (!status.configured) {
      setupSection.hidden = false;
      settingsSection.hidden = true;
      return;
    }
    if (!status.authenticated) {
      window.location.href = "/login";
      return;
    }
    setupSection.hidden = true;
    settingsSection.hidden = false;
    const schedules = await request("/api/schedules");
    settingsForm.elements.tomas.value = schedules.tomas.interval;
    settingsForm.elements.extracciones.value = schedules.extracciones.interval;
  }

  setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setupError.textContent = "";
    const values = Object.fromEntries(new FormData(setupForm));
    if (values.password !== values.confirmation) {
      setupError.textContent = "Las contraseñas no coinciden.";
      return;
    }
    delete values.confirmation;
    try {
      await request("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      window.location.href = "/login";
    } catch (error) {
      setupError.textContent = error.message;
    }
  });

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    settingsMessage.textContent = "";
    const current = await request("/api/schedules");
    const values = Object.fromEntries(new FormData(settingsForm));
    current.tomas.interval = Number(values.tomas);
    current.extracciones.interval = Number(values.extracciones);
    try {
      await request("/api/schedules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current)
      });
      settingsMessage.textContent = "Intervalos guardados.";
    } catch (error) {
      settingsMessage.textContent = error.message;
    }
  });

  document.getElementById("logout-button").addEventListener("click", async () => {
    await request("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  });

  load().catch((error) => { setupError.textContent = error.message; });
})();
