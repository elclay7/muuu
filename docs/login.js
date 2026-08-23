(() => {
  const form = document.getElementById("login-form");
  const error = document.getElementById("login-error");
  const setupLink = document.getElementById("setup-link");

  async function status() {
    const response = await fetch("/api/auth/status");
    return response.json();
  }

  status().then((data) => {
    if (!data.configured) {
      setupLink.hidden = false;
      form.hidden = true;
      error.textContent = "Primero crea el usuario familiar en Administración.";
    }
    if (data.authenticated) window.location.href = "/";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const values = Object.fromEntries(new FormData(form));
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });
    const data = await response.json();
    if (!response.ok) {
      error.textContent = data.error || "No fue posible ingresar.";
      return;
    }
    window.location.href = "/";
  });
})();
