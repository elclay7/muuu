(() => {
  const setupSection = document.getElementById("setup-section");
  const settingsSection = document.getElementById("settings-section");
  const adminLoginSection = document.getElementById("admin-login-section");
  const setupForm = document.getElementById("setup-form");
  const adminLoginForm = document.getElementById("admin-login-form");
  const userForm = document.getElementById("user-form");
  const setupError = document.getElementById("setup-error");
  const adminLoginError = document.getElementById("admin-login-error");
  const userMessage = document.getElementById("user-message");
  const usersList = document.getElementById("users-list");

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
      adminLoginSection.hidden = true;
      settingsSection.hidden = true;
      return;
    }
    if (!status.authenticated || status.role !== "admin") {
      setupSection.hidden = true;
      adminLoginSection.hidden = false;
      settingsSection.hidden = true;
      if (status.authenticated) {
        adminLoginError.textContent = "Esta cuenta no tiene permisos de administrador.";
        adminLoginForm.hidden = true;
      }
      return;
    }
    setupSection.hidden = true;
    adminLoginSection.hidden = true;
    settingsSection.hidden = false;
    renderUsers((await request("/api/users")).users);
  }

  function renderUsers(users) {
    usersList.innerHTML = "";
    users.forEach((user) => {
      const row = document.createElement("div");
      row.className = "user-row";
      const identity = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = user.username;
      const role = document.createElement("span");
      role.textContent = user.role === "admin" ? "Administrador" : "Familia";
      identity.append(name, role);
      row.appendChild(identity);
      const form = document.createElement("form");
      form.className = "password-form";
      form.innerHTML = '<input type="password" minlength="8" placeholder="Nueva contraseña" aria-label="Nueva contraseña"><button type="submit">Guardar</button>';
      const message = document.createElement("small");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        message.textContent = "";
        const password = form.querySelector("input").value;
        try {
          await request(`/api/users/${user.id}/password`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
          form.reset();
          message.textContent = "Actualizada";
        } catch (error) {
          message.textContent = error.message;
        }
      });
      row.append(form, message);
      usersList.appendChild(row);
    });
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

  adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    adminLoginError.textContent = "";
    const values = Object.fromEntries(new FormData(adminLoginForm));
    try {
      await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      window.location.reload();
    } catch (error) {
      adminLoginError.textContent = error.message;
    }
  });

  userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    userMessage.textContent = "";
    const values = Object.fromEntries(new FormData(userForm));
    try {
      await request("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, role: "family" })
      });
      userForm.reset();
      userMessage.textContent = "Usuario familiar creado.";
      renderUsers((await request("/api/users")).users);
    } catch (error) {
      userMessage.textContent = error.message;
    }
  });

  document.getElementById("logout-button").addEventListener("click", async () => {
    await request("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  });

  load().catch((error) => { setupError.textContent = error.message; });
})();
