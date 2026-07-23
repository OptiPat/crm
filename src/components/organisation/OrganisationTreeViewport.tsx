import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_SCALE = 0.08;
const MAX_SCALE = 1.5;
const FIT_PADDING = 24;
const WHEEL_ZOOM_FACTOR = 1.08;

export type OrganisationTreeViewportHandle = {
  fitAll: () => void;
  resetZoom100: () => void;
  focusNode: (contactId: number) => void;
};

type OrganisationTreeViewportProps = {
  children: ReactNode;
  layoutKey?: string | number;
  className?: string;
  containerClassName?: string;
};

export const OrganisationTreeViewport = forwardRef<
  OrganisationTreeViewportHandle,
  OrganisationTreeViewportProps
>(function OrganisationTreeViewport({ children, layoutKey, className, containerClassName }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const computeFitScale = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return 1;

    const availableW = container.clientWidth - FIT_PADDING * 2;
    const availableH = container.clientHeight - FIT_PADDING * 2;
    const contentW = content.offsetWidth;
    const contentH = content.offsetHeight;

    if (contentW <= 0 || contentH <= 0 || availableW <= 0 || availableH <= 0) return 1;

    return Math.max(MIN_SCALE, Math.min(availableW / contentW, availableH / contentH, 1));
  }, []);

  /** Pan pour centrer horizontalement et aligner en bas (origine transform 0,0). */
  const computePanForScale = useCallback((targetScale: number) => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return { panX: 0, panY: 0 };

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const contentW = content.offsetWidth;
    const contentH = content.offsetHeight;

    return {
      panX: (cw - contentW * targetScale) / 2,
      panY: ch - FIT_PADDING - contentH * targetScale,
    };
  }, []);

  const applyFitAll = useCallback(() => {
    const nextScale = computeFitScale();
    const { panX: nextPanX, panY: nextPanY } = computePanForScale(nextScale);
    setScale(nextScale);
    setPanX(nextPanX);
    setPanY(nextPanY);
  }, [computeFitScale, computePanForScale]);

  const applyZoom100 = useCallback(() => {
    const { panX: nextPanX, panY: nextPanY } = computePanForScale(1);
    setScale(1);
    setPanX(nextPanX);
    setPanY(nextPanY);
  }, [computePanForScale]);

  const focusNode = useCallback(
    (contactId: number) => {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const node = content.querySelector<HTMLElement>(`[data-org-node-id="${contactId}"]`);
      if (!node) return;

      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(0.5, scale < 0.9 ? scale * 1.5 : Math.min(1, scale * 1.2))
      );

      const cr = container.getBoundingClientRect();
      const nr = node.getBoundingClientRect();
      const viewCenterX = cr.left + cr.width / 2;
      const viewCenterY = cr.top + cr.height * 0.55;
      const nodeCenterX = nr.left + nr.width / 2;
      const nodeCenterY = nr.top + nr.height / 2;

      setPanX((p) => p + (viewCenterX - nodeCenterX));
      setPanY((p) => p + (viewCenterY - nodeCenterY));
      setScale(nextScale);
    },
    [scale]
  );

  useImperativeHandle(
    ref,
    () => ({
      fitAll: applyFitAll,
      resetZoom100: applyZoom100,
      focusNode,
    }),
    [applyFitAll, applyZoom100, focusNode]
  );

  useLayoutEffect(() => {
    applyFitAll();
    const id = requestAnimationFrame(() => applyFitAll());
    return () => cancelAnimationFrame(id);
  }, [applyFitAll, layoutKey]);

  const viewportCenter = useCallback(() => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  const zoomAtPoint = useCallback((clientX: number, clientY: number, factor: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    setScale((prevScale) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prevScale * factor));
      if (nextScale === prevScale) return prevScale;
      const ratio = nextScale / prevScale;
      setPanX((prevPanX) => px - (px - prevPanX) * ratio);
      setPanY((prevPanY) => py - (py - prevPanY) * ratio);
      return nextScale;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
      if (delta === 0) return;
      const factor = delta < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
      zoomAtPoint(event.clientX, event.clientY, factor);
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [zoomAtPoint]);

  const zoomPercent = Math.round(scale * 100);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-org-node]") || target.closest("button")) return;

      setDragging(true);
      panStart.current = {
        x: event.clientX,
        y: event.clientY,
        panX,
        panY,
      };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    [panX, panY]
  );

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (!panStart.current) return;
    setPanX(panStart.current.panX + (event.clientX - panStart.current.x));
    setPanY(panStart.current.panY + (event.clientY - panStart.current.y));
  }, []);

  const endDrag = useCallback((event: React.PointerEvent) => {
    setDragging(false);
    panStart.current = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className={cn("relative", className)}>
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-lg border border-border/60 bg-background/95 p-1 shadow-sm backdrop-blur-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Dézoomer"
          aria-label="Dézoomer"
          onClick={() => {
            const c = viewportCenter();
            zoomAtPoint(c.x, c.y, 0.85);
          }}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 text-[10px] tabular-nums text-muted-foreground min-w-[2.25rem]"
          title="Taille réelle (100 %)"
          onClick={applyZoom100}
        >
          {zoomPercent}%
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Zoomer"
          aria-label="Zoomer"
          onClick={() => {
            const c = viewportCenter();
            zoomAtPoint(c.x, c.y, 1.18);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Tout voir"
          aria-label="Tout voir"
          onClick={applyFitAll}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div
        ref={containerRef}
        className={cn(
          "w-full h-[min(88vh,calc(100vh-5rem))] min-h-[420px] overflow-hidden overscroll-none touch-none rounded-none",
          dragging ? "cursor-grabbing" : "cursor-grab",
          containerClassName
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <div
          className="absolute left-0 top-0 will-change-transform"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <div ref={contentRef} className="inline-block">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
});

