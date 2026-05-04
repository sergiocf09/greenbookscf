import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BookOpen, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScoringFABProps {
  currentHole: number;
  onClick: () => void;
  isOnScoringView?: boolean;
  isOnBetsView?: boolean;
  isOnBetSetupView?: boolean;
}

const STORAGE_KEY = 'scoringFabPosition_v1';
const FAB_SIZE = 56; // h-14 w-14
const DRAG_THRESHOLD = 6; // px before considered a drag (vs click)

type Pos = { x: number; y: number } | null;

function clampToViewport(x: number, y: number) {
  if (typeof window === 'undefined') return { x, y };
  const margin = 4;
  const maxX = window.innerWidth - FAB_SIZE - margin;
  const maxY = window.innerHeight - FAB_SIZE - margin;
  return {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(y, maxY)),
  };
}

export const ScoringFAB: React.FC<ScoringFABProps> = ({
  currentHole,
  onClick,
  isOnScoringView = false,
  isOnBetsView = false,
  isOnBetSetupView = false,
}) => {
  const [pos, setPos] = useState<Pos>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (typeof p?.x === 'number' && typeof p?.y === 'number') return clampToViewport(p.x, p.y);
    } catch { /* ignore */ }
    return null;
  });
  const [dragging, setDragging] = useState(false);
  const dragInfo = useRef<{ startX: number; startY: number; offX: number; offY: number; moved: boolean } | null>(null);

  // Re-clamp on resize
  useEffect(() => {
    const onResize = () => {
      setPos((p) => (p ? clampToViewport(p.x, p.y) : p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragInfo.current = {
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const info = dragInfo.current;
    if (!info) return;
    const dx = e.clientX - info.startX;
    const dy = e.clientY - info.startY;
    if (!info.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    info.moved = true;
    if (!dragging) setDragging(true);
    const next = clampToViewport(e.clientX - info.offX, e.clientY - info.offY);
    setPos(next);
  }, [dragging]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const info = dragInfo.current;
    dragInfo.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (info?.moved && pos) {
      // Snap horizontally to nearest edge for less obstruction
      const margin = 8;
      const maxX = window.innerWidth - FAB_SIZE - margin;
      const centerX = pos.x + FAB_SIZE / 2;
      const snappedX = centerX < window.innerWidth / 2 ? margin : maxX;
      const snapped = clampToViewport(snappedX, pos.y);
      setPos(snapped);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped)); } catch { /* ignore */ }
      setDragging(false);
    } else {
      setDragging(false);
      onClick();
    }
  }, [onClick, pos]);

  if (isOnScoringView) return null;

  const positioned = pos !== null;
  const style: React.CSSProperties = positioned
    ? { left: pos!.x, top: pos!.y, touchAction: 'none' }
    : {
        bottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px) + 0.75rem)',
        right: isOnBetSetupView
          ? 'max(4rem, env(safe-area-inset-right, 0px) + 3.25rem)'
          : 'max(1.5rem, env(safe-area-inset-right, 0px) + 0.75rem)',
        touchAction: 'none',
      };

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ } dragInfo.current = null; setDragging(false); }}
      className={cn(
        'fixed z-50 flex items-center justify-center rounded-full shadow-lg',
        'bg-primary text-primary-foreground hover:bg-primary/90',
        'h-14 w-14 select-none cursor-grab',
        dragging ? 'cursor-grabbing scale-105 shadow-2xl transition-colors' : 'transition-all duration-200 ease-out',
        isOnBetsView && !dragging && 'opacity-90',
        !positioned && 'safe-bottom',
      )}
      style={style}
      aria-label={`Capturar scores - Hoyo ${currentHole}. Mantén presionado y arrastra para mover.`}
    >
      <div className="relative pointer-events-none">
        <BookOpen className="h-6 w-6" />
        <Pencil className="absolute -bottom-1 -right-1.5 h-3 w-3" />
      </div>

      <div
        className={cn(
          'absolute flex items-center justify-center rounded-full pointer-events-none',
          'bg-accent text-accent-foreground font-bold shadow-md',
          'border-2 border-primary-foreground/30',
          '-top-1 -left-1 h-6 w-6 text-[10px]',
        )}
      >
        {currentHole}
      </div>
    </button>
  );
};
