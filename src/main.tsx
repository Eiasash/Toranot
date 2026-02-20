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

// Service Worker registration with update handling
if ("serviceWorker" in navigator) {
  const baseUrl = import.meta.env.BASE_URL || "/";
  navigator.serviceWorker
    .register(baseUrl + "sw.js", { scope: baseUrl })
    .then((reg) => {
      // Check for updates every 5 minutes
      setInterval(() => reg.update(), 5 * 60 * 1000);

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
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

  // Listen for SW update messages
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "SW_UPDATED") {
      // Show a non-intrusive update banner
      const banner = document.createElement("div");
      banner.className =
        "fixed top-0 inset-x-0 z-[100] bg-blue-600 text-white text-center py-2 text-sm cursor-pointer";
      banner.textContent = "גרסה חדשה זמינה — לחץ לרענון";
      banner.onclick = () => window.location.reload();
      document.body.appendChild(banner);
      // Auto-remove after 10s
      setTimeout(() => banner.remove(), 10000);
    }
  });
}
