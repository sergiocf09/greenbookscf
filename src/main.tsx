import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { RouteErrorBoundary } from "./components/ErrorBoundary";

// Guard: unregister service workers AND clear caches in any non-production host
// (preview/dev/iframe/lovable.dev/lovable.app). Only the published custom domain
// (golfgreenbookscf.com) keeps the PWA active to avoid stale-cache issues during
// active development.
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const host = window.location.hostname;
const isProductionHost = host === "golfgreenbookscf.com" || host === "www.golfgreenbookscf.com";
const isDevOrPreviewHost = !isProductionHost; // any lovable.dev / lovable.app / id-preview / localhost

if (isInIframe || isDevOrPreviewHost) {
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  }).catch(() => {});
  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => caches.delete(k));
    }).catch(() => {});
  }
}

initSentry();

createRoot(document.getElementById("root")!).render(
  <RouteErrorBoundary>
    <App />
  </RouteErrorBoundary>
);
