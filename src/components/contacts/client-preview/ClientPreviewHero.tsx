import { useLayoutEffect, useRef, useState } from "react";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { PerimetrePatrimoine } from "@/lib/patrimoine/perimetre";
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

function formatSourceDate(unix?: number): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

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

function SourceRow({
  label,
  amount,
  color,
  dateLabel,
}: {
  label: string;
  amount: number;
  color: string;
  dateLabel?: string | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mt-2 h-px w-3 shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          <span className={`${CP.meta} leading-snug`}>{label}</span>
        </div>
        {dateLabel ? (
          <p className={`${CP.caption} mt-0.5 pl-[1.375rem]`}>Au {dateLabel}</p>
        ) : null}
      </div>
      <span className={`${CP.amount} shrink-0`}>{formatShortEuro(amount)}</span>
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

  return (
    <header
      className={cn(CP.padX, "pt-6 pb-2", !isMobile && "md:pt-8")}
    >
      <p className={cn(CP.heroGreeting, isMobile && "cp-hero-greeting--mobile")}>
        {getGreetingHour()}, {contact.prenom}
      </p>

      <div className="mt-6">
        <p className={cn(CP.heroLabel, isMobile && "cp-hero-label--mobile")}>
          Votre patrimoine
        </p>
        <div className="mt-2">
          <HeroTotal centimes={perimetre.totalCentimes} viewport={viewport} />
        </div>
        {valorisationLabel && emptyState == null ? (
          <p className={`${CP.caption} mt-2`}>Au {valorisationLabel}</p>
        ) : null}
      </div>

      <p className={`${CP.meta} mt-4`}>{completenessLabel}</p>

      {perimetre.slices.length > 0 && perimetre.totalCentimes > 0 ? (
        <div className="mt-6 border-t border-[var(--cp-line)]">
          {perimetre.slices.map((slice) => (
            <SourceRow
              key={slice.origine}
              label={slice.label}
              amount={slice.centimes}
              color={SOURCE_SLICE_COLORS[slice.origine] ?? "#a3a3a3"}
              dateLabel={formatSourceDate(slice.referenceDate)}
            />
          ))}
        </div>
      ) : null}
    </header>
  );
}
