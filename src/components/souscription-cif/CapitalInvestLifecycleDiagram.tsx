import { cn } from "@/lib/utils";

type CapitalInvestLifecycleDiagramProps = {
  className?: string;
};

const NAVY = "hsl(221 83% 24%)";
const ACCENT = "#8b2635";
const YEARS = ["N", "N+1", "N+2", "N+3", "N+4", "N+5", "N+6", "N+7", "N+8", "N+9", "N+10"] as const;

type PhaseChevronProps = {
  label: string;
  sublabel?: string;
  variant: "navy" | "accent";
  className?: string;
  /** Empêche le retour à la ligne sur le libellé principal. */
  nowrap?: boolean;
};

function PhaseChevron({ label, sublabel, variant, className, nowrap }: PhaseChevronProps) {
  const bg = variant === "accent" ? ACCENT : NAVY;
  return (
    <div
      className={cn(
        "ci-phase-chevron relative flex min-h-[13mm] shrink-0 items-center justify-center px-[2mm] py-[1.5mm] text-center text-[7pt] font-semibold leading-tight text-white",
        className
      )}
      style={{ backgroundColor: bg }}
    >
      <span className={cn(nowrap && "whitespace-nowrap")}>
        {label}
        {sublabel && (
          <>
            <br />
            {sublabel}
          </>
        )}
      </span>
    </div>
  );
}

/** Schéma de vie FCPI / FIP — mise en page document CIF (Comfortaa, primary navy). */
export function CapitalInvestLifecycleDiagram({ className }: CapitalInvestLifecycleDiagramProps) {
  return (
    <figure
      className={cn(
        "cif-capital-invest-lifecycle cif-document-comfortaa mt-[6mm] w-full font-comfortaa text-neutral-800",
        className
      )}
      aria-label="Schéma du cycle de vie d'un investissement en capital investissement"
    >
      {/* Phases + annotations calées sur les mêmes proportions */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 flex text-[6pt] leading-none">
          <div className="w-[13%]" aria-hidden />
          <div className="flex w-[38%] items-center justify-center gap-[1mm] whitespace-nowrap text-[#8b2635]">
            <span aria-hidden>◀</span>
            <span>5 ans de détention minimum des titres (condition fiscale)</span>
            <span aria-hidden>▶</span>
          </div>
          <div className="flex w-[49%] items-center justify-center gap-[1mm] whitespace-nowrap text-neutral-600">
            <span>+ les années pour rendre la liquidité (société de gestion)</span>
            <span className="text-neutral-500" aria-hidden>
              →
            </span>
          </div>
        </div>

        <div className="flex w-full items-stretch -space-x-[2mm] pt-[5.5mm]">
          <PhaseChevron
            variant="navy"
            label="Constitution"
            nowrap
            className="z-[4] w-[13%]"
          />
          <PhaseChevron
            variant="accent"
            label="Investissements"
            sublabel="dans des entreprises"
            className="z-[3] w-[38%]"
          />
          <PhaseChevron
            variant="navy"
            label="Cessions des"
            sublabel="participations"
            className="z-[2] w-[26%]"
          />
          <PhaseChevron variant="navy" label="Distribution" className="z-[1] w-[23%]" />
        </div>
      </div>

      {/* Échelle temporelle + symboles € sous la phase Distribution */}
      <div className="mt-[1mm] border-t border-neutral-300 pt-[1mm]">
        <div className="grid grid-cols-11 text-center text-[6pt] tabular-nums text-neutral-600">
          {YEARS.map((year) => (
            <span key={year} className="relative">
              <span
                className="absolute -top-[2.5mm] left-1/2 h-[1.5mm] w-px -translate-x-1/2 bg-neutral-400"
                aria-hidden
              />
              {year}
            </span>
          ))}
        </div>
        <div className="mt-[1.5mm] grid grid-cols-11" aria-hidden>
          {YEARS.map((year, index) => (
            <div key={year} className="flex justify-center">
              {index >= 7 && (
                <span className="inline-flex h-[4mm] w-[4mm] items-center justify-center rounded-full border border-neutral-300 bg-neutral-50 text-[6pt] font-semibold text-neutral-600">
                  €
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Blocs inférieurs */}
      <div className="mt-[4mm] grid grid-cols-2 gap-[6mm] text-[6.5pt] leading-snug">
        {/* Sorties anticipées */}
        <div className="rounded border border-neutral-200 bg-neutral-50/80 px-[3mm] py-[2.5mm]">
          <p className="mb-[2mm] font-semibold text-neutral-900">Des cas de sorties anticipées :</p>
          <div className="flex items-start gap-[3mm]">
            <svg
              viewBox="0 0 20 22"
              className="mt-0.5 h-[5mm] w-[5mm] shrink-0 text-neutral-500"
              aria-hidden
            >
              <path
                d="M6 10V7a4 4 0 1 1 8 0v3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <rect
                x="4"
                y="10"
                width="12"
                height="9"
                rx="1"
                fill="currentColor"
                opacity="0.15"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
            <div className="flex min-w-0 flex-1 items-stretch gap-[2mm]">
              <div className="border-l-2 border-neutral-400 pl-[2mm]">
                <ul className="space-y-[0.5mm] text-neutral-700">
                  <li>Licenciement</li>
                  <li>Invalidité</li>
                  <li>Décès</li>
                </ul>
              </div>
              <p className="self-center text-[6pt] text-neutral-500">
                Souscripteur
                <br />
                ou conjoint
              </p>
            </div>
          </div>
        </div>

        {/* Mécanismes de sortie */}
        <div className="rounded-full border border-neutral-300 bg-white px-[3mm] py-[2.5mm]">
          <div className="grid grid-cols-3 gap-[2mm] text-center text-[6pt] text-neutral-700">
            <div className="flex flex-col items-center gap-[1mm]">
              <svg viewBox="0 0 24 20" className="h-[4mm] w-[5mm] text-neutral-500" aria-hidden>
                <rect
                  x="2"
                  y="6"
                  width="20"
                  height="12"
                  rx="1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path d="M2 10h20" stroke="currentColor" strokeWidth="1" />
              </svg>
              <span>
                Reprise par
                <br />
                un acteur du secteur
              </span>
            </div>
            <div className="flex flex-col items-center gap-[1mm]">
              <svg viewBox="0 0 24 20" className="h-[4mm] w-[5mm] text-neutral-500" aria-hidden>
                <path
                  d="M4 16V8l8-4 8 4v8H4z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path d="M12 4v12" stroke="currentColor" strokeWidth="1" />
              </svg>
              <span>
                Rachat par
                <br />
                les dirigeants
              </span>
            </div>
            <div className="flex flex-col items-center gap-[1mm]">
              <svg viewBox="0 0 24 20" className="h-[4mm] w-[5mm] text-neutral-500" aria-hidden>
                <polyline
                  points="3,16 8,10 13,13 18,6 21,8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
              <span>
                Introduction
                <br />
                en bourse
              </span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
