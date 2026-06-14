import { cn } from "@/lib/utils";

const RISK_LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;

type ScpiAmfRiskScaleTableProps = {
  /** Case mise en évidence (niveau produit sur l'échelle AMF). */
  highlightedLevel?: number;
  /** Ligne « Horizon de placement » sous l'échelle. */
  investmentHorizon?: string;
  className?: string;
};

/** Échelle AMF 1–7 (indicateur de risque produit). */
export function ScpiAmfRiskScaleTable({
  highlightedLevel,
  investmentHorizon,
  className,
}: ScpiAmfRiskScaleTableProps) {
  return (
    <div className={cn("mt-[3mm]", className)}>
      <p className="mb-[1.15em] font-semibold underline text-left [text-align-last:left]">
        Indicateur de risque :
      </p>

      <div className="flex justify-center">
        <table className="w-full max-w-[120mm] border-collapse text-[8pt] leading-none text-neutral-900">
          <tbody>
            <tr>
              {RISK_LEVELS.map((level) => (
                <td
                  key={level}
                  className={cn(
                    "border border-neutral-400 px-2 py-1.5 text-center align-middle font-medium tabular-nums [text-align-last:center]",
                    highlightedLevel === level && "bg-amber-300 font-semibold"
                  )}
                >
                  {level}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mx-auto mt-0.5 flex max-w-[120mm] justify-between text-[7pt] text-neutral-700">
        <span>Risque le plus faible</span>
        <span>Risque le plus élevé</span>
      </div>

      {investmentHorizon && (
        <p className="mt-[1.15em] text-left [text-align-last:left]">
          Horizon de placement : {investmentHorizon}
        </p>
      )}
    </div>
  );
}
