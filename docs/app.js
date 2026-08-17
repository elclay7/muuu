(() => {
  "use strict";

  const TIMEZONE = "America/Santiago";

  /** Configuración de cada lista de horarios */
  const SCHEDULES = {
    tomas: {
      storageKey: "lactancia_tomas",
      defaults: ["02:30", "05:30", "08:30", "11:30", "14:30", "17:30", "20:30", "23:30"],
      intervalMinutes: 180,
      label: "Toma",
      listElId: "lista-tomas"
    },
    extracciones: {
      storageKey: "lactancia_extracciones",
      defaults: ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"],
      intervalMinutes: 120,
      label: "Extracción",
      listElId: "lista-extracciones"
    }
  };

  // Índice de la tarjeta actualmente en edición (evita mezclar dos ediciones a la vez)
  let editing = null; // { group, index } | null

  /* ---------------------------------------------------------
   * Persistencia
   * --------------------------------------------------------- */

  function loadSchedule(group) {
    const cfg = SCHEDULES[group];
    try {
      const raw = localStorage.getItem(cfg.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === cfg.defaults.length) {
          return parsed;
        }
      }
    } catch (e) {
      // localStorage corrupto o inaccesible: se usa el valor por defecto
    }
    return [...cfg.defaults];
  }

  function saveSchedule(group, arr) {
    localStorage.setItem(SCHEDULES[group].storageKey, JSON.stringify(arr));
  }

  function resetAll() {
    Object.values(SCHEDULES).forEach((cfg) => localStorage.removeItem(cfg.storageKey));
    location.reload();
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

  /** Devuelve el índice del "siguiente" evento según el algoritmo de la especificación */
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
    const cfg = SCHEDULES[group];
    const arr = loadSchedule(group);
    const anchorMinutes = timeToMinutes(newTimeStr);
    const result = arr.map((_, i) => {
      const offset = (i - anchorIndex) * cfg.intervalMinutes;
      return minutesToTime(anchorMinutes + offset);
    });
    saveSchedule(group, result);
  }

  function applyIndividual(group, index, newTimeStr) {
    const arr = loadSchedule(group);
    arr[index] = newTimeStr;
    saveSchedule(group, arr);
  }

  /* ---------------------------------------------------------
   * Renderizado
   * --------------------------------------------------------- */

  const template = document.getElementById("tpl-card");

  function renderGroup(group) {
    const cfg = SCHEDULES[group];
    const container = document.getElementById(cfg.listElId);
    const arr = loadSchedule(group);
    const nowMinutes = nowInSantiagoMinutes();
    const nextIndex = findNextIndex(arr, nowMinutes);

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

      node.querySelector(".card-label").textContent = `${cfg.label} ${index + 1}`;
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
        renderAll();
      });

      // Guardar individual
      node.querySelector(".edit-single").addEventListener("click", () => {
        const val = input.value || timeStr;
        applyIndividual(group, index, val);
        editing = null;
        renderAll();
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
    document.getElementById("btn-reset").addEventListener("click", () => {
      const confirmed = window.confirm(
        "¿Restablecer todos los horarios a los valores por defecto?"
      );
      if (confirmed) resetAll();
    });

    updateClock();
    renderAll();

    setInterval(updateClock, 1000);
    // Recalcula "siguiente/pasado" cada minuto para no recargar tarjetas en edición cada segundo
    setInterval(() => {
      if (!editing) renderAll();
    }, 30000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
