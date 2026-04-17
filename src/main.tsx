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

// Auto-recovery: si una llamada a Supabase falla con TypeError "Failed to fetch"
// (típico de un Service Worker viejo interceptando tras un deploy), desregistra
// SW + limpia caches + recarga. Esto desbloquea jugadores con la PWA cacheada.
const SUPABASE_HOST = "fudkywbthxspmvgcmhrn.supabase.co";
const origFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    return await origFetch(input as any, init);
  } catch (err) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    const isSupabase = typeof url === "string" && url.includes(SUPABASE_HOST);
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    const looksStale =
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("load failed");
    if (isSupabase && looksStale) {
      const { recoverFromStaleServiceWorker } = await import("./lib/swRecovery");
      void recoverFromStaleServiceWorker("global-fetch");
    }
    throw err;
  }
};

initSentry();

createRoot(document.getElementById("root")!).render(
  <RouteErrorBoundary>
    <App />
  </RouteErrorBoundary>
);
