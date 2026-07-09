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
  /** Occupe la hauteur du parent (vue split) au lieu d'une max-height viewport. */
  fillParent?: boolean;
  /** Scroll porté par la page (`main`) — une seule barre de scroll. */
  pageScroll?: boolean;
};

/**
 * Virtualisation pour la vue « par foyer » (en-têtes + lignes contact).
 */
export function VirtualizedFoyerContactList({
  rows,
  renderRow,
  className = "",
  fillParent = false,
  pageScroll = false,
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

    if (pageScroll) {
      const findScrollParent = (node: HTMLElement): HTMLElement => {
        let parent = node.parentElement;
        while (parent) {
          const { overflowY } = getComputedStyle(parent);
          if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
            return parent;
          }
          parent = parent.parentElement;
        }
        return document.documentElement;
      };

      const scrollParent = findScrollParent(el);

      const update = () => {
        const rect = el.getBoundingClientRect();
        const parentTop =
          scrollParent === document.documentElement
            ? 0
            : scrollParent.getBoundingClientRect().top;
        setScrollTop(Math.max(0, parentTop - rect.top));
        setViewportHeight(
          scrollParent === document.documentElement
            ? window.innerHeight
            : scrollParent.clientHeight
        );
      };

      update();
      scrollParent.addEventListener("scroll", update, { passive: true });
      window.addEventListener("resize", update);
      const ro = new ResizeObserver(update);
      ro.observe(el);
      if (scrollParent !== document.documentElement) {
        ro.observe(scrollParent);
      }

      return () => {
        scrollParent.removeEventListener("scroll", update);
        window.removeEventListener("resize", update);
        ro.disconnect();
      };
    }

    const update = () => setViewportHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageScroll, rows.length]);

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
      className={`${pageScroll ? "" : "overflow-y-auto overscroll-contain"} ${fillParent ? "h-full min-h-0" : ""} ${className}`}
      style={
        fillParent || pageScroll
          ? undefined
          : { maxHeight: "min(70vh, calc(100vh - 280px))" }
      }
      onScroll={
        pageScroll ? undefined : (e) => setScrollTop(e.currentTarget.scrollTop)
      }
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
