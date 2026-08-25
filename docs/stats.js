(() => {
  "use strict";

  const TIMEZONE = "America/Santiago";
  const chart = document.getElementById("chart");
  const fromInput = document.getElementById("date-from");
  const toInput = document.getElementById("date-to");

  async function request(url) {
    const response = await fetch(url);
    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("No autenticado");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No fue posible cargar las estadísticas.");
    return data;
  }

  function formatDate(value, options) {
    return new Intl.DateTimeFormat("es-CL", { timeZone: TIMEZONE, ...options }).format(new Date(`${value}T12:00:00`));
  }

  function renderChart(items) {
    const width = 900;
    const height = 360;
    const left = 56;
    const right = 24;
    const top = 24;
    const bottom = 58;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const max = Math.max(...items.map((item) => item.ml), 1);
    const step = items.length > 1 ? plotWidth / (items.length - 1) : plotWidth / 2;
    const points = items.map((item, index) => {
      const x = items.length > 1 ? left + step * index : left + plotWidth / 2;
      const y = top + plotHeight - (item.ml / max) * plotHeight;
      return { ...item, x, y };
    });
    const line = points.map((point) => `${point.x},${point.y}`).join(" ");
    const area = `${left},${top + plotHeight} ${line} ${points.at(-1).x},${top + plotHeight}`;
    const labels = points.map((point, index) => index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 5) === 0
      ? `<text x="${point.x}" y="${height - 18}" text-anchor="middle">${formatDate(point.date, { day: "numeric", month: "short" })}</text>` : "").join("");
    const dots = points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5"><title>${formatDate(point.date, { dateStyle: "long" })}: ${point.ml} ml</title></circle>`).join("");
    chart.innerHTML = `<g class="chart-grid"><line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}"/><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}"/></g><text class="chart-max" x="${left - 10}" y="${top + 5}" text-anchor="end">${max} ml</text><polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${line}"/>${dots}<g class="chart-labels">${labels}</g>`;
    document.getElementById("chart-description").textContent = items.map((item) => `${formatDate(item.date, { dateStyle: "long" })}: ${item.ml} ml`).join(". ");
  }

  async function loadStats() {
    const params = new URLSearchParams();
    if (fromInput.value) params.set("from", fromInput.value);
    if (toInput.value) params.set("to", toInput.value);
    const result = await request(`/api/extractions-summary?${params}`);
    const items = result.data;
    const total = items.reduce((sum, item) => sum + item.ml, 0);
    document.getElementById("total-ml").textContent = `${total} ml`;
    document.getElementById("days-count").textContent = `${items.length} ${items.length === 1 ? "día" : "días"} con datos`;
    document.getElementById("chart-status").textContent = items.length ? "" : "No hay extracciones registradas en este rango.";
    if (items.length) renderChart(items);
    else chart.innerHTML = "";
  }

  function setupTheme() {
    const button = document.getElementById("theme-toggle");
    const dark = localStorage.getItem("dark-mode") === "true";
    document.body.classList.toggle("dark-mode", dark);
    button.textContent = dark ? "☀" : "☾";
    button.addEventListener("click", () => {
      const enabled = document.body.classList.toggle("dark-mode");
      localStorage.setItem("dark-mode", String(enabled));
      button.textContent = enabled ? "☀" : "☾";
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    setupTheme();
    try {
      await request("/api/auth/me");
      await loadStats();
    } catch (error) {
      document.getElementById("chart-status").textContent = error.message;
    }
    [fromInput, toInput].forEach((input) => input.addEventListener("change", () => {
      loadStats().catch((error) => {
        document.getElementById("chart-status").textContent = error.message;
      });
    }));
    document.getElementById("clear-filter").addEventListener("click", () => {
      fromInput.value = "";
      toInput.value = "";
      loadStats().catch((error) => {
        document.getElementById("chart-status").textContent = error.message;
      });
    });
  });
})();