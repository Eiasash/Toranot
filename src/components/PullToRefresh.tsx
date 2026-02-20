import { useState, useRef, useCallback } from "react";

const PULL_THRESHOLD = 70; // px to trigger refresh

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => void;
  children: React.ReactNode;
}) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Only start pull if we're scrolled to the top
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0 || refreshing) return;

    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy < 0) return; // scrolling up

    if (!isPulling.current && dy > 10) {
      isPulling.current = true;
    }

    if (isPulling.current) {
      // Diminishing returns as you pull further
      setPullY(Math.min(dy * 0.5, 100));
      if (dy > 20) e.preventDefault();
    }
  }, [refreshing]);

  const onTouchEnd = useCallback(() => {
    if (pullY >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      onRefresh();
      // Reset after a brief visual delay
      setTimeout(() => {
        setRefreshing(false);
        setPullY(0);
      }, 600);
    } else {
      setPullY(0);
    }
    isPulling.current = false;
  }, [pullY, refreshing, onRefresh]);

  const progress = Math.min(pullY / PULL_THRESHOLD, 1);

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative"
    >
      {/* Pull indicator */}
      {(pullY > 0 || refreshing) && (
        <div
          className="flex items-center justify-center text-gray-400 dark:text-gray-500 overflow-hidden"
          style={{ height: `${pullY}px`, transition: pullY === 0 ? 'height 0.2s' : undefined }}
        >
          <div
            className={`text-xl ${refreshing ? 'animate-spin' : ''}`}
            style={{ opacity: progress, transform: `rotate(${progress * 360}deg)` }}
          >
            {refreshing ? '⟳' : progress >= 1 ? '↓' : '↻'}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
