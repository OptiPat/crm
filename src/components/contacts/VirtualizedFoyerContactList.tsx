import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  type FoyerFlatRow,
  getFoyerRowHeight,
} from "@/lib/foyers/foyer-list-rows";

const OVERSCAN = 4;

type VirtualizedFoyerContactListProps = {
  rows: FoyerFlatRow[];
  renderRow: (row: FoyerFlatRow) => ReactNode;
  className?: string;
};

/**
 * Virtualisation pour la vue « par foyer » (en-têtes + lignes contact).
 */
export function VirtualizedFoyerContactList({
  rows,
  renderRow,
  className = "",
}: VirtualizedFoyerContactListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);

  const { offsets, totalHeight } = useMemo(() => {
    const offs: number[] = [];
    let y = 0;
    for (const row of rows) {
      offs.push(y);
      y += getFoyerRowHeight(row);
    }
    return { offsets: offs, totalHeight: y };
  }, [rows]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let startIndex = 0;
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (offsets[i] <= scrollTop) {
      startIndex = Math.max(0, i - OVERSCAN);
      break;
    }
  }

  const endY = scrollTop + viewportHeight;
  let endIndex = rows.length;
  for (let i = startIndex; i < rows.length; i++) {
    const bottom = offsets[i] + getFoyerRowHeight(rows[i]);
    if (bottom >= endY) {
      endIndex = Math.min(rows.length, i + OVERSCAN + 2);
      break;
    }
  }

  const slice = rows.slice(startIndex, endIndex);

  return (
    <div
      ref={scrollRef}
      className={`overflow-y-auto ${className}`}
      style={{ maxHeight: "min(70vh, calc(100vh - 280px))" }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div className="relative w-full" style={{ height: totalHeight }}>
        {slice.map((row, i) => {
          const index = startIndex + i;
          return (
            <div
              key={row.key}
              className="absolute left-0 right-0"
              style={{ top: offsets[index] }}
            >
              {renderRow(row)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
