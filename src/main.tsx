import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { RouteErrorBoundary } from "./components/ErrorBoundary";

// Bump this constant to force ALL production clients to drop their SW + caches
// on next load. Acts as a global "kill switch" for stuck PWAs.
const APP_VERSION = "1.0.2";

const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const host = window.location.hostname;
const isProductionHost = host === "golfgreenbookscf.com" || host === "www.golfgreenbookscf.com";
const isDevOrPreviewHost = !isProductionHost;

const registerProductionServiceWorker = () => {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/pwa-sw.js").catch(() => {});
  });
};

if (isInIframe || isDevOrPreviewHost) {
  // Preview/dev/iframe: always nuke SW + caches so latest code is shown.
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  }).catch(() => {});
  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => caches.delete(k));
    }).catch(() => {});
  }
} else {
  registerProductionServiceWorker();

  // Production: kill-switch by version. If the stored version doesn't match
  // the bundled APP_VERSION, fully reset SW + caches and reload once.
  try {
    const stored = localStorage.getItem("app_version");
    if (stored !== APP_VERSION) {
      localStorage.setItem("app_version", APP_VERSION);
      if (stored !== null) {
        Promise.allSettled([
          navigator.serviceWorker?.getRegistrations().then((regs) =>
            Promise.all(regs.map((r) => r.unregister()))
          ) ?? Promise.resolve(),
          "caches" in window
            ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
            : Promise.resolve(),
        ]).finally(() => {
          window.location.reload();
        });
      }
    }
  } catch {
    // localStorage unavailable — skip kill switch.
  }

  // Do not auto-reload on Service Worker controller changes. The PWA update
  // flow can emit repeated controllerchange events on some mobile browsers,
  // which looks like a permanent refresh loop. Version-based cleanup above is
  // the only intentional automatic reload path.
}

initSentry();

createRoot(document.getElementById("root")!).render(
  <RouteErrorBoundary>
    <App />
  </RouteErrorBoundary>
);
