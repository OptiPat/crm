import { useLayoutEffect, useRef, useState } from "react";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { PerimetrePatrimoine } from "@/lib/patrimoine/perimetre";
import { ClientPreviewProportionBar } from "./ClientPreviewProportionBar";
import { distributeIntegerPercents } from "@/lib/patrimoine/chart-percents";
import { cn } from "@/lib/utils";
import type { ClientPreviewViewport } from "./ClientPreviewAdvisorPanel";
import {
  formatChartCenterTotal,
  formatClientPreviewTotal,
  formatShortEuro,
} from "./client-preview-format";
import { CP, SOURCE_SLICE_COLORS, getGreetingHour } from "./client-preview-theme";

const HERO_TOTAL_MOBILE_MAX_REM = 2;
const HERO_TOTAL_MOBILE_MIN_REM = 1.5;
const HERO_TOTAL_DESKTOP_REM = 3.25;

function HeroTotal({
  centimes,
  viewport,
}: {
  centimes: number;
  viewport: ClientPreviewViewport;
}) {
  const isMobile = viewport === "mobile";
  const text = isMobile
    ? formatChartCenterTotal(centimes)
    : formatClientPreviewTotal(centimes);
  const ref = useRef<HTMLParagraphElement>(null);
  const [fontSizeRem, setFontSizeRem] = useState(
    isMobile ? HERO_TOTAL_MOBILE_MAX_REM : HERO_TOTAL_DESKTOP_REM
  );

  useLayoutEffect(() => {
    if (!isMobile) {
      setFontSizeRem(HERO_TOTAL_DESKTOP_REM);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const maxWidthPx = el.parentElement?.clientWidth ?? 320;
    let sizeRem = HERO_TOTAL_MOBILE_MAX_REM;
    el.style.fontSize = `${sizeRem}rem`;

    while (sizeRem > HERO_TOTAL_MOBILE_MIN_REM && el.scrollWidth > maxWidthPx) {
      sizeRem -= 0.0625;
      el.style.fontSize = `${sizeRem}rem`;
    }

    setFontSizeRem(sizeRem);
  }, [text, isMobile]);

  return (
    <p
      ref={ref}
      className={cn(
        CP.heroTotal,
        isMobile ? "cp-hero-total--mobile" : "cp-hero-total--desktop"
      )}
      style={isMobile ? { fontSize: `${fontSizeRem}rem` } : undefined}
    >
      {text}
    </p>
  );
}

function SourceProportionBar({
  slices,
  total,
}: {
  slices: PerimetrePatrimoine["slices"];
  total: number;
}) {
  return (
    <ClientPreviewProportionBar
      slices={slices.map((slice) => ({
        key: slice.origine,
        value: slice.centimes,
        color: SOURCE_SLICE_COLORS[slice.origine] ?? "#a3a3a3",
        label: slice.label,
      }))}
      total={total}
      ariaLabel="Répartition par origine des montants"
    />
  );
}

function SourceRow({
  label,
  amount,
  color,
  percent,
}: {
  label: string;
  amount: number;
  color: string;
  percent: number;
}) {
  return (
    <div className="cp-source-row flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <span className={`${CP.meta} truncate leading-snug`}>{label}</span>
      </div>
      <div className="flex shrink-0 items-baseline gap-2 tabular-nums">
        <span className={`${CP.caption} text-[var(--cp-ink-muted)]`}>
          {percent} %
        </span>
        <span className={CP.amount}>{formatShortEuro(amount)}</span>
      </div>
    </div>
  );
}

export type ClientPreviewEmptyState = "empty" | "all_hidden" | null;

export interface ClientPreviewHeroProps {
  contact: Contact;
  perimetre: PerimetrePatrimoine;
  valorisationLabel: string | null;
  viewport: ClientPreviewViewport;
  emptyState?: ClientPreviewEmptyState;
}

export function ClientPreviewHero({
  contact,
  perimetre,
  valorisationLabel,
  viewport,
  emptyState = null,
}: ClientPreviewHeroProps) {
  const isMobile = viewport === "mobile";
  const completenessLabel =
    emptyState === "all_hidden"
      ? "Aucun placement visible pour ce contact (règles de confidentialité)"
      : emptyState === "empty"
        ? "Aucun placement enregistré dans le dossier"
        : perimetre.completenessLabel;

  const hasSourceBreakdown =
    perimetre.slices.length > 0 && perimetre.totalCentimes > 0;
  const showCompletenessLabel =
    emptyState != null ||
    !hasSourceBreakdown ||
    perimetre.partDeclaree > 0;

  return (
    <header
      className={cn(CP.padX, "pt-6 pb-2", !isMobile && "md:pt-8")}
    >
      <p className={cn(CP.heroGreeting, isMobile && "cp-hero-greeting--mobile")}>
        {getGreetingHour()}, {contact.prenom}
      </p>

      <div className="mt-3">
        <p className={cn(CP.heroLabel, isMobile && "cp-hero-label--mobile")}>
          Patrimoine total estimé
        </p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <HeroTotal centimes={perimetre.totalCentimes} viewport={viewport} />
          {valorisationLabel && emptyState == null ? (
            <span className="cp-hero-date-badge mb-1 shrink-0 rounded-full border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-2.5 py-0.5 text-xs leading-none text-[var(--cp-ink-muted)]">
              Valorisation au {valorisationLabel}
            </span>
          ) : null}
        </div>
      </div>

      {showCompletenessLabel ? (
        <p className={`${CP.meta} mt-2`}>{completenessLabel}</p>
      ) : null}

      {hasSourceBreakdown ? (
        <div
          className={cn(
            "border-t border-[var(--cp-line)] pt-1",
            showCompletenessLabel ? "mt-4" : "mt-3"
          )}
        >
          <SourceProportionBar
            slices={perimetre.slices}
            total={perimetre.totalCentimes}
          />
          {perimetre.slices.map((slice, index) => (
            <SourceRow
              key={slice.origine}
              label={slice.label}
              amount={slice.centimes}
              color={SOURCE_SLICE_COLORS[slice.origine] ?? "#a3a3a3"}
              percent={
                distributeIntegerPercents(
                  perimetre.slices.map((item) => item.centimes)
                )[index]
              }
            />
          ))}
        </div>
      ) : null}
    </header>
  );
}
