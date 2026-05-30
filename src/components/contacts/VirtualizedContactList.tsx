import { useEffect, useRef, useState, type ReactNode } from "react";

/** Hauteur estimée d'une ligne contact (badges + méta). */
export const CONTACT_ROW_ESTIMATE_PX = 112;

const OVERSCAN = 6;

type VirtualizedContactListProps<T> = {
  items: T[];
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  emptyMessage?: ReactNode;
};

/**
 * Liste virtualisée simple (fenêtre de scroll) pour 1000+ contacts sans DOM massif.
 */
export function VirtualizedContactList<T>({
  items,
  getKey,
  renderItem,
  className = "",
  emptyMessage,
}: VirtualizedContactListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (items.length === 0 && emptyMessage) {
    return <>{emptyMessage}</>;
  }

  const totalHeight = items.length * CONTACT_ROW_ESTIMATE_PX;
  const startIndex = Math.max(0, Math.floor(scrollTop / CONTACT_ROW_ESTIMATE_PX) - OVERSCAN);
  const visibleCount =
    Math.ceil(viewportHeight / CONTACT_ROW_ESTIMATE_PX) + OVERSCAN * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const slice = items.slice(startIndex, endIndex);

  return (
    <div
      ref={scrollRef}
      className={`overflow-y-auto ${className}`}
      style={{ maxHeight: "min(70vh, calc(100vh - 280px))" }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div className="relative w-full" style={{ height: totalHeight }}>
        {slice.map((item, i) => {
          const index = startIndex + i;
          return (
            <div
              key={getKey(item, index)}
              className="absolute left-0 right-0"
              style={{ top: index * CONTACT_ROW_ESTIMATE_PX }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
