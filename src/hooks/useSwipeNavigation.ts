import { useRef, useCallback } from 'react';

const SWIPE_THRESHOLD = 50;
const SWIPE_MAX_Y = 80; // ignore if vertical movement is too large

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

    if (dy > SWIPE_MAX_Y || Math.abs(dx) < SWIPE_THRESHOLD) return;

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
