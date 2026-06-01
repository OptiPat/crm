import { Label } from "@/components/ui/label";
import {
  getExceltisMillesimeProposals,
  type ExceltisMillesimeOption,
} from "@/lib/etiquettes/exceltis";

export type ExceltisFormChoice =
  | { hasExceltis: false }
  | { hasExceltis: true; millesimeKey: string };

interface ContactFormExceltisSectionProps {
  value: ExceltisFormChoice;
  onChange: (value: ExceltisFormChoice) => void;
  proposals?: ExceltisMillesimeOption[];
}

export function ContactFormExceltisSection({
  value,
  onChange,
  proposals = getExceltisMillesimeProposals(),
}: ContactFormExceltisSectionProps) {
  const selectedKey =
    value.hasExceltis && value.millesimeKey ? value.millesimeKey : proposals[2]?.key ?? "";

  return (
    <div className="space-y-3 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-3">
      <div>
        <p className="text-sm font-medium">Exceltis (UC structurée)</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Sur assurance-vie ou PER uniquement. Les anciens clients : étiquette à la main.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            !value.hasExceltis
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background hover:bg-muted"
          }`}
          onClick={() => onChange({ hasExceltis: false })}
        >
          Non
        </button>
        <button
          type="button"
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            value.hasExceltis
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background hover:bg-muted"
          }`}
          onClick={() =>
            onChange({
              hasExceltis: true,
              millesimeKey: selectedKey,
            })
          }
        >
          Oui
        </button>
      </div>

      {value.hasExceltis && (
        <div className="space-y-2 pl-0.5">
          <Label className="text-xs text-muted-foreground">
            Millésime (M+1, M+2, M+3 par rapport au mois en cours)
          </Label>
          <div className="flex flex-col gap-2">
            {proposals.map((opt) => (
              <label
                key={opt.key}
                className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-transparent hover:border-amber-300/60 px-2 py-1"
              >
                <input
                  type="radio"
                  name="exceltis-millesime"
                  className="h-4 w-4"
                  checked={value.millesimeKey === opt.key}
                  onChange={() =>
                    onChange({ hasExceltis: true, millesimeKey: opt.key })
                  }
                />
                <span>
                  {opt.label}
                  <span className="text-muted-foreground text-xs ml-1">(M+{opt.offset})</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
