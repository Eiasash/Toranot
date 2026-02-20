import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  const baseUrl = import.meta.env.BASE_URL || "/";
  navigator.serviceWorker
    .register(baseUrl + "sw.js", { scope: baseUrl })
    .then((reg) => {
      // If a new SW just activated (COI headers now in effect), reload once
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "activated" && !navigator.serviceWorker.controller) {
            // First install — reload so COI headers apply to this page load
            window.location.reload();
          }
        });
      });
    })
    .catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
}
