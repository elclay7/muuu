(() => {
  "use strict";

  const TIMEZONE = "America/Santiago";

  const schedules = {};

  // Índice de la tarjeta actualmente en edición (evita mezclar dos ediciones a la vez)
  let editing = null; // { group, index } | null

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
    await request("/api/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedules)
    });
  }

  function setupIntervalEditor(group) {
    const pill = document.getElementById(`interval-${group}`);
    const editor = document.getElementById(`interval-edit-${group}`);
    const input = editor.querySelector(".interval-input");
    const close = () => {
      editor.hidden = true;
      pill.hidden = false;
    };

    pill.addEventListener("click", () => {
      input.value = schedules[group].interval;
      pill.hidden = true;
      editor.hidden = false;
      input.focus();
      input.select();
    });
    editor.querySelector(".interval-cancel").addEventListener("click", close);
    editor.querySelector(".interval-save").addEventListener("click", async () => {
      const interval = Number(input.value);
      if (!Number.isInteger(interval) || interval < 1 || interval > 24) return;
      schedules[group].interval = interval;
      await saveSchedules();
      close();
      renderAll();
    });
  }

  /* ---------------------------------------------------------
   * Utilidades de tiempo
   * --------------------------------------------------------- */

  function timeToMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  function minutesToTime(mins) {
    const wrapped = ((mins % 1440) + 1440) % 1440;
    const h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function nowInSantiagoMinutes() {
    const parts = new Intl.DateTimeFormat("es-CL", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour").value);
    const m = Number(parts.find((p) => p.type === "minute").value);
    return h * 60 + m;
  }

  function findNextIndex(arr, nowMinutes) {
    for (let i = 0; i < arr.length; i++) {
      if (timeToMinutes(arr[i]) > nowMinutes) {
        return i;
      }
    }
    return 0; // la hora actual superó el último evento: el siguiente es el primero del día
  }

  /* ---------------------------------------------------------
   * Edición: cascada e individual
   * --------------------------------------------------------- */

  function applyCascade(group, anchorIndex, newTimeStr) {
    const cfg = schedules[group];
    const anchorMinutes = timeToMinutes(newTimeStr);
    const result = cfg.times.map((_, i) => {
      const offset = (i - anchorIndex) * cfg.interval * 60;
      return minutesToTime(anchorMinutes + offset);
    });
    cfg.times = result;
  }

  function applyIndividual(group, index, newTimeStr) {
    schedules[group].times[index] = newTimeStr;
  }

  /* ---------------------------------------------------------
   * Renderizado
   * --------------------------------------------------------- */

  const template = document.getElementById("tpl-card");

  function renderGroup(group) {
    const cfg = schedules[group];
    const container = document.getElementById(`lista-${group}`);
    const arr = cfg.times;
    const nowMinutes = nowInSantiagoMinutes();
    const nextIndex = findNextIndex(arr, nowMinutes);
    document.getElementById(`interval-${group}`).textContent = `cada ${cfg.interval} h`;

    container.innerHTML = "";

    arr.forEach((timeStr, index) => {
      const node = template.content.firstElementChild.cloneNode(true);
      const isNext = index === nextIndex;
      // Un evento se considera "pasado" si ya ocurrió hoy y no es el próximo
      // (si el siguiente es el índice 0, todos los demás ya pasaron hoy).
      const pastEvent = !isNext && (nextIndex === 0 || timeToMinutes(timeStr) < nowMinutes);

      node.classList.toggle("next-event", isNext);
      node.classList.toggle("past-event", pastEvent);

      node.dataset.group = group;
      node.dataset.index = String(index);

      node.querySelector(".card-label").textContent = `${group === "tomas" ? "Toma" : "Extracción"} ${index + 1}`;
      node.querySelector(".card-time").textContent = timeStr;

      const isEditingThis = editing && editing.group === group && editing.index === index;
      node.classList.toggle("editing", !!isEditingThis);

      const input = node.querySelector(".time-input");
      input.value = timeStr;

      // Abrir edición
      node.querySelector(".card-time").addEventListener("click", () => {
        editing = { group, index };
        renderAll();
        const el = document.querySelector(
          `.event-card[data-group="${group}"][data-index="${index}"] .time-input`
        );
        if (el) el.focus();
      });

      // Cancelar edición
      node.querySelector(".edit-cancel").addEventListener("click", () => {
        editing = null;
        renderAll();
      });

      // Guardar en cascada
      node.querySelector(".edit-cascade").addEventListener("click", () => {
        const val = input.value || timeStr;
        applyCascade(group, index, val);
        editing = null;
        saveSchedules().then(renderAll);
      });

      // Guardar individual
      node.querySelector(".edit-single").addEventListener("click", () => {
        const val = input.value || timeStr;
        applyIndividual(group, index, val);
        editing = null;
        saveSchedules().then(renderAll);
      });

      container.appendChild(node);
    });
  }

  function renderAll() {
    renderGroup("tomas");
    renderGroup("extracciones");
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
    setupIntervalEditor("tomas");
    setupIntervalEditor("extracciones");

    document.getElementById("btn-reset").addEventListener("click", async () => {
      const confirmed = window.confirm(
        "¿Restablecer todos los horarios a los valores por defecto?"
      );
      if (confirmed) {
        await request("/api/schedules/reset", { method: "POST" });
        Object.assign(schedules, await request("/api/schedules"));
        renderAll();
      }
    });

    document.getElementById("btn-logout").addEventListener("click", async () => {
      await request("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    });

    updateClock();
    renderAll();

    setInterval(updateClock, 1000);
    // Recalcula "siguiente/pasado" cada minuto para no recargar tarjetas en edición cada segundo
    setInterval(() => {
      if (!editing) renderAll();
    }, 30000);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const status = await request("/api/auth/status");
    if (!status.authenticated) {
      window.location.href = status.configured ? "/login" : "/admin";
      return;
    }
    Object.assign(schedules, await request("/api/schedules"));
    const account = await request("/api/auth/me");
    document.getElementById("logged-user").textContent = account.username;
    init();
  });
})();
