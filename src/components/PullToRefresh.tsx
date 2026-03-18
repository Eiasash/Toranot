import { useState, useRef, useCallback, useEffect } from "react";

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
  const pullYRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  // Keep refreshing state accessible in stable listeners without re-registering
  const refreshingRef = useRef(false);
  refreshingRef.current = refreshing;

  const getScrollTop = useCallback(() => {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
  }, []);

  // Stable onRefresh ref so listeners don't re-register when parent re-renders
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (getScrollTop() > 2) return;
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (getScrollTop() > 2 || refreshingRef.current) return;

      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy <= 0) return;

      if (!isPulling.current && dy > 10) isPulling.current = true;

      if (isPulling.current) {
        e.preventDefault();
        pullYRef.current = Math.min(dy * 0.5, 100);
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(() => {
            setPullY(pullYRef.current);
            rafRef.current = null;
          });
        }
      }
    };

    const handleTouchEnd = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (pullYRef.current >= PULL_THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        onRefreshRef.current();
        setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          setPullY(0);
          pullYRef.current = 0;
        }, 600);
      } else {
        setPullY(0);
        pullYRef.current = 0;
      }
      isPulling.current = false;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  // Stable: only runs once on mount — all state accessed via refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getScrollTop]);

  const progress = Math.min(pullY / PULL_THRESHOLD, 1);

  return (
    <div ref={containerRef} className="relative">
      {(pullY > 0 || refreshing) && (
        <div
          className="flex items-center justify-center text-gray-400 dark:text-gray-500 overflow-hidden"
          style={{ height: `${pullY}px`, transition: pullY === 0 ? "height 0.2s" : undefined }}
        >
          <div
            className={`text-xl ${refreshing ? "animate-spin" : ""}`}
            style={{ opacity: progress, transform: `rotate(${progress * 360}deg)` }}
          >
            {refreshing ? "⟳" : progress >= 1 ? "↓" : "↻"}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
