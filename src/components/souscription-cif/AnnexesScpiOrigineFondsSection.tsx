import {
  formatOrigineFondsCheck,
  getOrigineFondsLabel,
  isOrigineFondsSelected,
  ORIGINE_FONDS_ROW_PAIRS,
  PROVENANCE_FONDS_OPTIONS,
  type AnnexesScpiOrigineFondsView,
  type OrigineFondsKey,
} from "@/lib/souscription-cif/annexes-scpi-origine-fonds";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type AnnexesScpiOrigineFondsSectionProps = {
  view: AnnexesScpiOrigineFondsView;
  className?: string;
  onMissingVariableClick?: (key: string) => void;
};

function MissingFieldButton({
  fieldKey,
  label,
  onMissingVariableClick,
  children,
}: {
  fieldKey: string;
  label: string;
  onMissingVariableClick?: (key: string) => void;
  children: ReactNode;
}) {
  if (!onMissingVariableClick) return <>{children}</>;

  return (
    <button
      type="button"
      className="w-full cursor-pointer rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      title={`Cliquer pour compléter : ${label}`}
      onClick={() => onMissingVariableClick(fieldKey)}
    >
      <span className="rounded bg-amber-200/90 px-0.5 text-amber-950">{children}</span>
    </button>
  );
}

function OrigineCell({
  fondsKey,
  view,
}: {
  fondsKey: OrigineFondsKey;
  view: AnnexesScpiOrigineFondsView;
}) {
  const checked = isOrigineFondsSelected(view.origineFondsSelected, fondsKey);
  let label = getOrigineFondsLabel(fondsKey);
  if (fondsKey === "autre" && view.origineFondsAutrePrecision) {
    label = `${label} : ${view.origineFondsAutrePrecision}`;
  }

  return (
    <td className="border border-neutral-400 px-1.5 py-1.5 align-top whitespace-pre-wrap text-left leading-[1.25] [text-align-last:auto]">
      {formatOrigineFondsCheck(checked)} {label}
    </td>
  );
}

export function AnnexesScpiOrigineFondsSection({
  view,
  className,
  onMissingVariableClick,
}: AnnexesScpiOrigineFondsSectionProps) {
  const provenanceMissing = !view.provenanceFonds;
  const origineMissing = view.origineFondsSelected.length === 0;

  return (
    <div className={cn("mt-[3mm]", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium underline">Provenance des fonds :</span>
        {provenanceMissing ? (
          <MissingFieldButton
            fieldKey="provenance_fonds"
            label="Provenance des fonds"
            onMissingVariableClick={onMissingVariableClick}
          >
            ⬜ Métropole ⬜ DOM-TOM ⬜ Étranger
          </MissingFieldButton>
        ) : (
          PROVENANCE_FONDS_OPTIONS.map((option) => (
            <span key={option.key}>
              {formatOrigineFondsCheck(view.provenanceFonds === option.key)} {option.label}
            </span>
          ))
        )}
      </div>

      <p className="mt-[3mm] font-medium underline">
        {origineMissing ? (
          <MissingFieldButton
            fieldKey="origine_fonds"
            label="Origine des fonds"
            onMissingVariableClick={onMissingVariableClick}
          >
            <span className="underline">Origine des fonds :</span>
          </MissingFieldButton>
        ) : (
          "Origine des fonds :"
        )}
      </p>

      <table className="mt-[1.5mm] w-full table-fixed border-collapse text-left text-[8pt] leading-[1.25] text-neutral-900">
        <colgroup>
          <col className="w-1/2" />
          <col className="w-1/2" />
        </colgroup>
        <tbody>
          {ORIGINE_FONDS_ROW_PAIRS.map(([left, right]) => (
            <tr key={`${left}-${right}`}>
              <OrigineCell fondsKey={left} view={view} />
              <OrigineCell fondsKey={right} view={view} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
