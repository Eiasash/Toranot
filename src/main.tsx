import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { requestNotificationPermission } from "./components/TaskCountdown";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

console.info("[Toranot] build", __GIT_SHA__, __BUILD_TIME__);

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Request notification permission for task timers
requestNotificationPermission();

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
