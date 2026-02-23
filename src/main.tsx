import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { requestNotificationPermission } from "./components/TaskCountdown";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Request notification permission for task timers
requestNotificationPermission();

// Service Worker registration with auto-update
if ("serviceWorker" in navigator) {
  const baseUrl = import.meta.env.BASE_URL || "/";
  navigator.serviceWorker
    .register(baseUrl + "sw.js", { scope: baseUrl })
    .then((reg) => {
      // Check for updates every 5 minutes (26h shifts — can't rely on navigation)
      setInterval(() => reg.update(), 5 * 60 * 1000);

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // New SW ready while old one is still controlling — activate it now
            console.log("[Toranot] New service worker installed, activating...");
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
          if (
            newWorker.state === "activated" &&
            !navigator.serviceWorker.controller
          ) {
            // First install — reload so COI headers apply
            window.location.reload();
          }
        });
      });
    })
    .catch((error) => {
      console.warn("Service worker registration failed:", error);
    });

  // When the new SW takes control, reload to pick up new hashed assets.
  // State lives in localStorage — reload is safe and instant.
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    console.log("[Toranot] New service worker active — reloading for fresh assets");
    window.location.reload();
  });
}
