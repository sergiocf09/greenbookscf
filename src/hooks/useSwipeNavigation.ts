import { useRef, useCallback } from 'react';

const SWIPE_THRESHOLD = 120;       // Requiere gesto más largo e intencional
const SWIPE_MAX_Y = 40;            // Cancela antes si hay movimiento vertical (scroll)
const SWIPE_MIN_RATIO = 2.5;       // El movimiento horizontal debe ser 2.5x mayor que el vertical

export function useSwipeNavigation<T extends string>(
  views: T[],
  currentView: T,
  setView: (v: T) => void,
) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = Math.abs(t.clientY - touchStart.current.y);
    touchStart.current = null;

    const absDx = Math.abs(dx);
    if (dy > SWIPE_MAX_Y) return;                        // Cancela si hay mucho scroll vertical
    if (absDx < SWIPE_THRESHOLD) return;                 // Requiere gesto largo
    if (dy > 0 && absDx / dy < SWIPE_MIN_RATIO) return;  // Cancela si no es claramente horizontal

    const idx = views.indexOf(currentView);
    if (idx === -1) return;

    if (dx < -SWIPE_THRESHOLD && idx < views.length - 1) {
      setView(views[idx + 1]);
    } else if (dx > SWIPE_THRESHOLD && idx > 0) {
      setView(views[idx - 1]);
    }
  }, [views, currentView, setView]);

  return { onTouchStart, onTouchEnd };
}
