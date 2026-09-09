(() => {
  "use strict";

  const TIMEZONE = "America/Santiago";
  const WIDTH = 900;
  const HEIGHT = 360;
  const LEFT = 56;
  const RIGHT = 24;
  const TOP = 24;
  const BOTTOM = 58;
  const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
  const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;

  const FEED_SERIES = [
    { key: "formula", label: "Fórmula", cssClass: "bar-formula" },
    { key: "materna", label: "Leche materna", cssClass: "bar-materna" },
    { key: "mixto", label: "Mixto", cssClass: "bar-mixto" }
  ];

  const chart = document.getElementById("chart");
  const feedChart = document.getElementById("chart-feed");
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

  function xAxisLabels(items, xOf) {
    const labelStep = Math.ceil(items.length / 5);
    return items.map((item, index) => (index === 0 || index === items.length - 1 || index % labelStep === 0
      ? `<text x="${xOf(item, index)}" y="${HEIGHT - 18}" text-anchor="middle">${formatDate(item.date, { day: "numeric", month: "short" })}</text>` : "")).join("");
  }

  function renderExtractionChart(items) {
    const max = Math.max(...items.map((item) => item.ml), 1);
    const step = items.length > 1 ? PLOT_WIDTH / (items.length - 1) : PLOT_WIDTH / 2;
    const points = items.map((item, index) => {
      const x = items.length > 1 ? LEFT + step * index : LEFT + PLOT_WIDTH / 2;
      const y = TOP + PLOT_HEIGHT - (item.ml / max) * PLOT_HEIGHT;
      return { ...item, x, y };
    });
    const line = points.map((point) => `${point.x},${point.y}`).join(" ");
    const area = `${LEFT},${TOP + PLOT_HEIGHT} ${line} ${points.at(-1).x},${TOP + PLOT_HEIGHT}`;
    const labels = xAxisLabels(points, (point) => point.x);
    const dots = points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5"><title>${formatDate(point.date, { dateStyle: "long" })}: ${point.ml} ml</title></circle>`).join("");
    chart.innerHTML = `<g class="chart-grid"><line x1="${LEFT}" y1="${TOP + PLOT_HEIGHT}" x2="${WIDTH - RIGHT}" y2="${TOP + PLOT_HEIGHT}"/><line x1="${LEFT}" y1="${TOP}" x2="${LEFT}" y2="${TOP + PLOT_HEIGHT}"/></g><text class="chart-max" x="${LEFT - 10}" y="${TOP + 5}" text-anchor="end">${max} ml</text><polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${line}"/>${dots}<g class="chart-labels">${labels}</g>`;
    document.getElementById("chart-description").textContent = items.map((item) => `${formatDate(item.date, { dateStyle: "long" })}: ${item.ml} ml`).join(". ");
  }

  function renderFeedChart(items) {
    const dayTotals = items.map((item) => FEED_SERIES.reduce((sum, series) => sum + (item[series.key] || 0), 0));
    const max = Math.max(...dayTotals, 1);
    const step = PLOT_WIDTH / items.length;
    const groupWidth = Math.min(step * 0.6, 72);
    const baseline = TOP + PLOT_HEIGHT;

    const bars = [];
    items.forEach((item, index) => {
      const groupX = LEFT + step * index + (step - groupWidth) / 2;
      let yCursor = baseline;
      FEED_SERIES.forEach((series) => {
        const value = item[series.key] || 0;
        if (!value) return;
        const barHeight = (value / max) * PLOT_HEIGHT;
        yCursor -= barHeight;
        bars.push(`<rect class="feed-bar ${series.cssClass}" x="${groupX.toFixed(1)}" y="${yCursor.toFixed(1)}" width="${groupWidth.toFixed(1)}" height="${barHeight.toFixed(1)}"/>`);
      });
    });

    const overlays = items.map((item, index) => {
      const groupX = LEFT + step * index + (step - groupWidth) / 2;
      const breakdown = FEED_SERIES.map((series) => `${series.label}: ${item[series.key] || 0} ml`).join("\n");
      return `<rect x="${groupX.toFixed(1)}" y="${TOP}" width="${groupWidth.toFixed(1)}" height="${PLOT_HEIGHT}" fill="transparent"><title>${formatDate(item.date, { dateStyle: "long" })}\n${breakdown}\nTotal: ${dayTotals[index]} ml</title></rect>`;
    }).join("");

    const labels = xAxisLabels(items, (item, index) => LEFT + step * index + step / 2);
    feedChart.innerHTML = `<g class="chart-grid"><line x1="${LEFT}" y1="${baseline}" x2="${WIDTH - RIGHT}" y2="${baseline}"/><line x1="${LEFT}" y1="${TOP}" x2="${LEFT}" y2="${baseline}"/></g><text class="chart-max" x="${LEFT - 10}" y="${TOP + 5}" text-anchor="end">${max} ml</text>${bars.join("")}${overlays}<g class="chart-labels">${labels}</g>`;

    const description = items.map((item, index) => {
      const breakdown = FEED_SERIES.filter((series) => item[series.key]).map((series) => `${series.label} ${item[series.key]} ml`).join(", ") || "sin registros";
      return `${formatDate(item.date, { dateStyle: "long" })}: ${breakdown}, total ${dayTotals[index]} ml`;
    }).join(". ");
    document.getElementById("feed-chart-description").textContent = description;
  }

  function filterByRange(items) {
    const from = fromInput.value;
    const to = toInput.value;
    return items.filter((item) => (!from || item.date >= from) && (!to || item.date <= to));
  }

  async function loadStats() {
    const [extractions, feeds] = await Promise.all([
      request("/api/extractions-summary").then((result) => result.data),
      request("/api/feed-summary").then((result) => result.data)
    ]);
    const total = extractions.reduce((sum, item) => sum + item.ml, 0);
    const average = extractions.length ? Math.round(total / extractions.length) : 0;
    document.getElementById("total-ml").textContent = `${(total / 1000).toFixed(2)} L`;
    document.getElementById("daily-average").textContent = `${average} ml`;
    document.getElementById("days-count").textContent = `${extractions.length}`;

    const extractionItems = filterByRange(extractions);
    document.getElementById("chart-status").textContent = extractionItems.length ? "" : "No hay extracciones registradas en este rango.";
    if (extractionItems.length) renderExtractionChart(extractionItems);
    else chart.innerHTML = "";

    const feedItems = filterByRange(feeds);
    document.getElementById("feed-status").textContent = feedItems.length ? "" : "No hay tomas registradas en este rango.";
    if (feedItems.length) renderFeedChart(feedItems);
    else feedChart.innerHTML = "";
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
      document.getElementById("feed-status").textContent = error.message;
    }
    [fromInput, toInput].forEach((input) => input.addEventListener("change", () => {
      loadStats().catch((error) => {
        document.getElementById("chart-status").textContent = error.message;
        document.getElementById("feed-status").textContent = error.message;
      });
    }));
    document.getElementById("clear-filter").addEventListener("click", () => {
      fromInput.value = "";
      toInput.value = "";
      loadStats().catch((error) => {
        document.getElementById("chart-status").textContent = error.message;
        document.getElementById("feed-status").textContent = error.message;
      });
    });
  });
})();
