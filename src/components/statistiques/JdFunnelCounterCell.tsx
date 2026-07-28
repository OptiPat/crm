import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { computeJdFunnelProgressPercent } from "@/lib/statistiques/organisation-jd-funnel-tracker";
import { cn } from "@/lib/utils";
import { formatCount, progressColorClasses } from "./objectif-table-shared";

const HOLD_REPEAT_DELAY_MS = 400;
const HOLD_REPEAT_INTERVAL_MS = 90;

/** Incrémente/décrémente en continu tant que le bouton est maintenu appuyé (pas juste au clic). */
function useHoldRepeat(onTick: () => void) {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
    if (intervalRef.current != null) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }, []);

  const start = useCallback(() => {
    clear();
    onTickRef.current();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => onTickRef.current(), HOLD_REPEAT_INTERVAL_MS);
    }, HOLD_REPEAT_DELAY_MS);
  }, [clear]);

  useEffect(() => clear, [clear]);

  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
  };
}

/**
 * Cellule de tableau combinant l'objectif calculé et le compteur manuel de progression réelle —
 * pour garder cible et action au même endroit (au lieu d'un encart séparé à remonter mentalement).
 * Couleur de la barre + petit rebond au clic + mise en avant à 100 % pour donner envie d'avancer.
 */
export function JdFunnelCounterCell({
  target,
  current,
  onChange,
}: {
  target: number | null;
  current: number;
  onChange: (value: number) => void;
}) {
  const progressPercent = computeJdFunnelProgressPercent(current, target);
  const isComplete = progressPercent != null && progressPercent >= 100;
  const colors = progressColorClasses(progressPercent);

  // Ref toujours à jour : l'appui maintenu déclenche des ticks en continu, chacun doit repartir de
  // la dernière valeur connue (pas de la valeur capturée au moment du pointerDown).
  const currentRef = useRef(current);
  currentRef.current = current;
  const decrementHold = useHoldRepeat(() => onChange(Math.max(0, currentRef.current - 1)));
  const incrementHold = useHoldRepeat(() => onChange(currentRef.current + 1));

  // Petit rebond sur le libellé à chaque changement (feedback tactile même sans son/vibration).
  const [bump, setBump] = useState(false);
  useEffect(() => {
    setBump(true);
    const timeout = setTimeout(() => setBump(false), 220);
    return () => clearTimeout(timeout);
  }, [current]);

  // Flash de célébration au moment précis où l'objectif bascule à 100 % (pas juste un état statique).
  const wasComplete = useRef(isComplete);
  const [justCompleted, setJustCompleted] = useState(false);
  useEffect(() => {
    if (isComplete && !wasComplete.current) {
      setJustCompleted(true);
      const timeout = setTimeout(() => setJustCompleted(false), 900);
      wasComplete.current = true;
      return () => clearTimeout(timeout);
    }
    wasComplete.current = isComplete;
  }, [isComplete]);

  return (
    <div
      className={cn(
        "flex flex-col items-end gap-1 rounded-md -mx-1.5 -my-1 px-1.5 py-1 transition-colors duration-300",
        isComplete && "bg-emerald-500/10 ring-1 ring-emerald-400/50",
        justCompleted && "animate-pulse ring-2 ring-emerald-400"
      )}
    >
      <div className="tabular-nums font-medium">{formatCount(target)}</div>
      <div className="flex items-center gap-1.5 w-full max-w-[7.5rem]">
        <button
          type="button"
          {...decrementHold}
          className="flex size-5 shrink-0 items-center justify-center rounded-md border border-border/70 text-muted-foreground transition-transform hover:text-foreground hover:bg-muted/50 hover:scale-110 active:scale-90"
          aria-label="Retirer un (maintenir pour enchaîner)"
        >
          <Minus className="size-3" />
        </button>
        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500 ease-out", colors.bar)}
            style={{ width: `${Math.min(100, progressPercent ?? 0)}%` }}
          />
        </div>
        <button
          type="button"
          {...incrementHold}
          className="flex size-5 shrink-0 items-center justify-center rounded-md border border-border/70 text-muted-foreground transition-transform hover:text-foreground hover:bg-muted/50 hover:scale-110 active:scale-90"
          aria-label="Ajouter un (maintenir pour enchaîner)"
        >
          <Plus className="size-3" />
        </button>
      </div>
      <div
        className={cn(
          "text-[10px] font-medium transition-transform duration-200",
          colors.text,
          bump && "scale-125"
        )}
      >
        {`${isComplete ? "🎉 " : ""}${formatCount(current)} obtenus${progressPercent != null ? ` · ${progressPercent}%` : ""}`}
      </div>
    </div>
  );
}
