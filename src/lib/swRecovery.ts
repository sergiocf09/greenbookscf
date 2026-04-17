/**
 * Detecta errores de red causados por un Service Worker cacheado/obsoleto
 * (típicamente "Failed to fetch" cuando el backend está sano) y, en ese caso,
 * desregistra todos los SW, limpia los Cache Storage y recarga la página.
 *
 * Esto evita que los jugadores con la PWA instalada queden bloqueados tras
 * un deploy nuevo cuando su SW viejo intercepta y rompe las llamadas a
 * Supabase.
 */
export function isLikelyStaleSWError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('load failed') ||
    msg.includes('fetch failed')
  );
}

let recoveryInFlight = false;

export async function recoverFromStaleServiceWorker(reason?: string): Promise<void> {
  if (recoveryInFlight) return;

  // Skip recovery in preview/iframe contexts: there the "Failed to fetch"
  // is caused by the Lovable preview proxy, not by a stale Service Worker,
  // and recargar provoca un loop sin resolver nada.
  const inIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const host = window.location.hostname;
  const isProductionHost = host === 'golfgreenbookscf.com' || host === 'www.golfgreenbookscf.com';
  if (inIframe || !isProductionHost) {
    return;
  }

  recoveryInFlight = true;
  try {
    // Marcador para evitar bucles infinitos de recarga
    const KEY = 'sw_recovery_attempted_at';
    const last = Number(sessionStorage.getItem(KEY) || '0');
    const now = Date.now();
    if (last && now - last < 60_000) {
      // Ya intentamos hace menos de 1 minuto, no volver a recargar
      return;
    }
    sessionStorage.setItem(KEY, String(now));

    // 1) Desregistrar todos los service workers
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      } catch {
        // ignore
      }
    }

    // 2) Limpiar todas las caches
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
      } catch {
        // ignore
      }
    }

    // 3) Hard reload con bust de query
    const url = new URL(window.location.href);
    url.searchParams.set('_swfix', String(now));
    window.location.replace(url.toString());
  } finally {
    // No reseteamos recoveryInFlight; vamos a recargar la página de todos modos
  }
}
