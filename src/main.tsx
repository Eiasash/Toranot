import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { installDebugInterceptors } from "./utils/debugLog";

// Install debug log interceptors before anything else
installDebugInterceptors();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

console.info("[Toranot] build", __GIT_SHA__, __BUILD_TIME__);

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);


// ── Service Worker: register, auto-update every 5 min, auto-reload on update ──
const SW_URL = `${import.meta.env.BASE_URL}sw.js`;
const UPDATE_EVERY_MS = 5 * 60 * 1000;

export function registerAndAutoUpdateSW() {
  if (!("serviceWorker" in navigator)) return;

  let refreshing = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register(SW_URL)
    .then((reg) => {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;

        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });

      window.setInterval(() => {
        reg.update().catch(() => {});
      }, UPDATE_EVERY_MS);
    })
    .catch(() => {});
}

registerAndAutoUpdateSW();

// ── Handle messages from the Service Worker ───────────────────────────────────
// SW sends these when the user interacts with task notifications (done/snooze).
// We dispatch directly to the reducer via the global store pattern.

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    const { type, taskId, patientId, newDueAt } = event.data ?? {};

    // Validate string types — SW messages are untyped, malformed data must not propagate
    const validId = (v: unknown): v is string => typeof v === "string" && v.length > 0;

    if (type === "TASK_DONE_FROM_NOTIFICATION" && validId(taskId) && validId(patientId)) {
      // Mark the task done — same as tapping the checkbox in the UI
      // We need access to the dispatch function. Since this is outside React,
      // we use a window-level event that PatientsContext listens for.
      window.dispatchEvent(new CustomEvent("toranot:task-done", { detail: { taskId, patientId } }));
    }

    if (type === "SNOOZE_TASK" && validId(taskId) && validId(patientId) && typeof newDueAt === "string") {
      window.dispatchEvent(new CustomEvent("toranot:task-snooze", { detail: { taskId, patientId, newDueAt } }));
      // Reset reminder state so the rescheduled task fires again after snooze
      import("./reminders/reminderScheduler").then(({ resetTaskReminder }) => resetTaskReminder(taskId));
    }

    if (type === "FOCUS_PATIENT" && validId(patientId)) {
      window.dispatchEvent(new CustomEvent("toranot:focus-patient", { detail: { patientId } }));
    }

    // SYNC_REMINDERS: SW relays this after push/background-sync events.
    // Force an immediate re-check of due tasks.
    if (type === "SYNC_REMINDERS") {
      import("./reminders/reminderScheduler").then(({ resyncReminders: _r }) => {
        // resync is already called by the patients subscription — just trigger it
        window.dispatchEvent(new CustomEvent("toranot:sync-reminders"));
      });
    }
  });
}

