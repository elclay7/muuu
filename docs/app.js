(() => {
  "use strict";

  const TIMEZONE = "America/Santiago";
  const MAX_RECORDS = 50;

  const schedules = {};
  function currentDateInSantiago() {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  let selectedDate = currentDateInSantiago();

  async function request(url, options) {
    const response = await fetch(url, options);
    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("No autenticado");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No fue posible completar la operación.");
    return data;
  }

  async function saveSchedules() {
    await request("/api/day", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...schedules, date: selectedDate, pediatric_ml: Number(document.getElementById("pediatric-ml").value) })
    });
  }

  async function loadDay() {
    Object.assign(schedules, await request(`/api/day?date=${selectedDate}`));
    document.getElementById("pediatric-ml").value = schedules.pediatric_ml;
    const displayDate = new Intl.DateTimeFormat("es-CL", { timeZone: TIMEZONE, day: "numeric", month: "long", year: "numeric" }).format(new Date(`${selectedDate}T12:00:00`));
    document.getElementById("selected-date").textContent = displayDate;
    document.getElementById("previous-day").disabled = selectedDate === "2026-08-10";
    document.getElementById("next-day").disabled = selectedDate === currentDateInSantiago();
    renderAll();
    updateSummary();
  }

  /* ---------------------------------------------------------
   * Utilidades de tiempo y registros
   * --------------------------------------------------------- */

  function timeToMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  function averageIntervalLabel(group) {
    const records = schedules[group]?.records || [];
    const relevant = group === "tomas"
      ? records.filter((r) => r.type !== "relleno")
      : records.slice();
    if (relevant.length < 2) return "cada — h";
    const minutes = relevant.map((r) => timeToMinutes(r.time)).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < minutes.length; i++) {
      gaps.push(minutes[i] - minutes[i - 1]);
    }
    const avgMinutes = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
    const hours = (avgMinutes / 60).toFixed(1).replace(".0", "");
    return `cada ${hours} h`;
  }

  function defaultRecord(group) {
    if (group === "tomas") {
      return { time: "00:00", type: "toma", content: "formula", volume: null };
    }
    return { time: "00:00", type: "extracción", volume: null };
  }

  function addRecord(group) {
    const records = schedules[group].records;
    if (records.length >= MAX_RECORDS) return;
    records.push(defaultRecord(group));
    renderAll();
    updateSummary();
    saveSchedules().catch((error) => {
      window.alert(error.message);
    });
  }

  function deleteRecord(group, index) {
    const records = schedules[group].records;
    if (records.length <= 1) return;
    records.splice(index, 1);
    renderAll();
    updateSummary();
    saveSchedules().catch((error) => {
      window.alert(error.message);
    });
  }

  /* ---------------------------------------------------------
   * Renderizado
   * --------------------------------------------------------- */

  const template = document.getElementById("tpl-card");

  function renderGroup(group) {
    const records = schedules[group].records;
    const container = document.getElementById(`lista-${group}`);
    document.getElementById(`interval-${group}`).textContent = averageIntervalLabel(group);
    container.innerHTML = "";

    records.forEach((record, index) => {
      const node = template.content.firstElementChild.cloneNode(true);

      const timeInput = node.querySelector(".time-input");
      timeInput.value = record.time;
      timeInput.addEventListener("change", () => {
        record.time = timeInput.value || "00:00";
        document.getElementById(`interval-${group}`).textContent = averageIntervalLabel(group);
        saveSchedules().catch((error) => window.alert(error.message));
      });

      const typeSelect = node.querySelector(".type-select");
      if (group === "tomas") {
        typeSelect.innerHTML = '<option value="toma">Toma</option><option value="relleno">Relleno</option>';
        typeSelect.value = record.type;
        typeSelect.addEventListener("change", () => {
          record.type = typeSelect.value;
          document.getElementById(`interval-${group}`).textContent = averageIntervalLabel(group);
          saveSchedules().catch((error) => window.alert(error.message));
        });
      } else {
        typeSelect.hidden = true;
      }

      const contentSelect = node.querySelector(".content-select");
      if (group === "tomas") {
        contentSelect.innerHTML = '<option value="formula">Fórmula</option><option value="leche materna">Leche materna</option>';
        contentSelect.value = record.content;
        contentSelect.addEventListener("change", () => {
          record.content = contentSelect.value;
          saveSchedules().catch((error) => window.alert(error.message));
        });
      } else {
        contentSelect.hidden = true;
      }

      const volumeSelect = node.querySelector(".volume-select");
      volumeSelect.innerHTML = '<option value="">ml</option>';
      for (let milliliters = 10; milliliters <= 240; milliliters += 5) {
        volumeSelect.insertAdjacentHTML("beforeend", `<option value="${milliliters}">${milliliters} ml</option>`);
      }
      volumeSelect.value = record.volume || "";
      volumeSelect.addEventListener("change", () => {
        record.volume = volumeSelect.value ? Number(volumeSelect.value) : null;
        saveSchedules().then(updateSummary).catch((error) => window.alert(error.message));
      });

      const deleteButton = node.querySelector(".delete-record");
      deleteButton.addEventListener("click", () => deleteRecord(group, index));
      if (records.length <= 1) {
        deleteButton.disabled = true;
      }

      container.appendChild(node);
    });
  }

  function renderAll() {
    renderGroup("tomas");
    renderGroup("extracciones");
    document.getElementById("add-toma").disabled = schedules.tomas.records.length >= MAX_RECORDS;
    document.getElementById("add-extraccion").disabled = schedules.extracciones.records.length >= MAX_RECORDS;
  }

  function updateSummary() {
    const pediatric = Number(document.getElementById("pediatric-ml").value) || 0;
    const feedRecords = schedules.tomas?.records || [];
    const tomaCount = feedRecords.filter((r) => r.type === "toma").length;
    const extracted = (schedules.extracciones?.records || []).reduce((total, r) => total + (r.volume || 0), 0);
    const goal = pediatric * tomaCount;
    document.getElementById("daily-goal").textContent = `${goal} ml`;
    document.getElementById("extracted-total").textContent = `${extracted} ml`;
    document.getElementById("remaining-total").textContent = `${Math.max(0, goal - extracted)} ml`;
  }

  function setupDayNavigation() {
    document.getElementById("previous-day").addEventListener("click", async () => {
      const current = new Date(`${selectedDate}T12:00:00`);
      current.setDate(current.getDate() - 1);
      selectedDate = current.toISOString().slice(0, 10);
      await loadDay();
    });
    document.getElementById("next-day").addEventListener("click", async () => {
      const current = new Date(`${selectedDate}T12:00:00`);
      current.setDate(current.getDate() + 1);
      selectedDate = current.toISOString().slice(0, 10);
      await loadDay();
    });
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

  /* ---------------------------------------------------------
   * Reloj y fecha (America/Santiago)
   * --------------------------------------------------------- */

  function updateClock() {
    const now = new Date();
    const clockText = new Intl.DateTimeFormat("es-CL", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(now);

    const dateText = new Intl.DateTimeFormat("es-CL", {
      timeZone: TIMEZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(now);

    document.getElementById("clock").textContent = clockText;
    document.getElementById("today").textContent = dateText;
  }

  /* ---------------------------------------------------------
   * Inicialización
   * --------------------------------------------------------- */

  function init() {
    setupDayNavigation();
    setupTheme();
    document.getElementById("pediatric-ml").addEventListener("change", async () => {
      await saveSchedules();
      updateSummary();
    });

    document.getElementById("add-toma").addEventListener("click", () => addRecord("tomas"));
    document.getElementById("add-extraccion").addEventListener("click", () => addRecord("extracciones"));

    document.getElementById("btn-reset").addEventListener("click", async () => {
      const confirmed = window.confirm("¿Borrar todos los registros del día?");
      if (confirmed) {
        await request(`/api/day/reset?date=${selectedDate}`, { method: "POST" });
        await loadDay();
      }
    });

    document.getElementById("btn-logout").addEventListener("click", async () => {
      await request("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    });

    updateClock();
    renderAll();
    setInterval(updateClock, 1000);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const status = await request("/api/auth/status");
    if (!status.authenticated) {
      window.location.href = status.configured ? "/login" : "/admin";
      return;
    }
    await loadDay();
    const account = await request("/api/auth/me");
    document.getElementById("logged-user").textContent = account.username;
    init();
  });
})();
