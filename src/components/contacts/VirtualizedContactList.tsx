import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CONTACT_LIST_ROW_GAP_PX,
  CONTACT_ROW_FALLBACK_PX,
} from "@/lib/contacts/contact-list-row-height";

/** @deprecated Utiliser `getItemHeight` — conservé pour compat tests / imports. */
export const CONTACT_ROW_ESTIMATE_PX = CONTACT_ROW_FALLBACK_PX;

const OVERSCAN = 6;

type VirtualizedContactListProps<T> = {
  items: T[];
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  /** Hauteur initiale avant mesure DOM (scroll fluide). */
  getItemHeight?: (item: T, index: number) => number;
  className?: string;
  emptyMessage?: ReactNode;
  /** Occupe la hauteur du parent (vue split) au lieu d'une max-height viewport. */
  fillParent?: boolean;
  /** Scroll porté par la page (`main`) — une seule barre de scroll (portefeuilles). */
  pageScroll?: boolean;
};

function buildOffsets(
  heights: number[],
  gap: number
): { offsets: number[]; totalHeight: number } {
  const offsets: number[] = [];
  let y = 0;
  for (let i = 0; i < heights.length; i++) {
    offsets.push(y);
    y += heights[i] + gap;
  }
  const totalHeight = heights.length > 0 ? y - gap : 0;
  return { offsets, totalHeight };
}

type MeasuredRowProps = {
  rowKey: string | number;
  top: number;
  onHeight: (key: string | number, height: number) => void;
  children: ReactNode;
};

function MeasuredRow({ rowKey, top, onHeight, children }: MeasuredRowProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const report = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) onHeight(rowKey, h);
    };

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowKey, onHeight]);

  return (
    <div
      ref={ref}
      className="absolute left-0 right-0"
      style={{ top }}
    >
      {children}
    </div>
  );
}

/**
 * Liste virtualisée — hauteurs mesurées au rendu (espacement uniforme, pas de chevauchement).
 */
export function VirtualizedContactList<T>({
  items,
  getKey,
  renderItem,
  getItemHeight,
  className = "",
  emptyMessage,
  fillParent = false,
  pageScroll = false,
}: VirtualizedContactListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);
  const [measuredHeights, setMeasuredHeights] = useState<Map<string | number, number>>(
    () => new Map()
  );

  const handleHeight = useCallback((key: string | number, height: number) => {
    setMeasuredHeights((prev) => {
      const existing = prev.get(key);
      if (existing != null && Math.abs(existing - height) < 1) return prev;
      const next = new Map(prev);
      next.set(key, height);
      return next;
    });
  }, []);

  useEffect(() => {
    const validKeys = new Set(items.map((item, i) => getKey(item, i)));
    setMeasuredHeights((prev) => {
      let changed = false;
      const next = new Map<string | number, number>();
      for (const [k, v] of prev) {
        if (validKeys.has(k)) next.set(k, v);
        else changed = true;
      }
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [items, getKey]);

  const rowHeights = useMemo(
    () =>
      items.map((item, i) => {
        const key = getKey(item, i);
        return (
          measuredHeights.get(key) ??
          getItemHeight?.(item, i) ??
          CONTACT_ROW_FALLBACK_PX
        );
      }),
    [items, getKey, getItemHeight, measuredHeights]
  );

  const { offsets, totalHeight } = useMemo(
    () => buildOffsets(rowHeights, CONTACT_LIST_ROW_GAP_PX),
    [rowHeights]
  );

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
  }, [pageScroll, items.length]);

  if (items.length === 0 && emptyMessage) {
    return <>{emptyMessage}</>;
  }

  let startIndex = 0;
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (offsets[i] <= scrollTop) {
      startIndex = Math.max(0, i - OVERSCAN);
      break;
    }
  }

  const endY = scrollTop + viewportHeight;
  let endIndex = items.length;
  for (let i = startIndex; i < items.length; i++) {
    const bottom = offsets[i] + rowHeights[i];
    if (bottom >= endY) {
      endIndex = Math.min(items.length, i + OVERSCAN + 2);
      break;
    }
  }

  const slice = items.slice(startIndex, endIndex);

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
        {slice.map((item, i) => {
          const index = startIndex + i;
          const key = getKey(item, index);
          return (
            <MeasuredRow
              key={key}
              rowKey={key}
              top={offsets[index]}
              onHeight={handleHeight}
            >
              {renderItem(item, index)}
            </MeasuredRow>
          );
        })}
      </div>
    </div>
  );
}
