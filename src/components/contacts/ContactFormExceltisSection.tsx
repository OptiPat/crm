import { Label } from "@/components/ui/label";
import {
  EXCELITIS_GAMME_OPTIONS,
  catalogueHasExceltisEtiquette,
  contactHasGammeForProposal,
  findCatalogueMatchForGamme,
  formatExceltisEtiquetteNom,
  getExceltisMillesimeProposals,
  type ExceltisGamme,
  type ExceltisMillesimeProposalView,
} from "@/lib/etiquettes/exceltis";

export type ExceltisFormChoice =
  | { hasExceltis: false }
  | { hasExceltis: true; gamme: ExceltisGamme; millesimeKey: string };

interface ContactFormExceltisSectionProps {
  value: ExceltisFormChoice;
  onChange: (value: ExceltisFormChoice) => void;
  proposals?: ExceltisMillesimeProposalView[];
}

function defaultProposals(): ExceltisMillesimeProposalView[] {
  return getExceltisMillesimeProposals().map((option) => ({
    ...option,
    catalogueMatches: [],
    contactGammes: {},
  }));
}

export function ContactFormExceltisSection({
  value,
  onChange,
  proposals = defaultProposals(),
}: ContactFormExceltisSectionProps) {
  const defaultGamme: ExceltisGamme = "Rendement";
  const selectedKey =
    value.hasExceltis && value.millesimeKey ? value.millesimeKey : proposals[2]?.key ?? "";
  const selectedGamme = value.hasExceltis ? value.gamme : defaultGamme;
  const selectedProposal = proposals.find((p) => p.key === selectedKey);

  const catalogueExists =
    value.hasExceltis &&
    catalogueHasExceltisEtiquette(proposals, selectedGamme, selectedKey);
  const alreadyOnContact =
    value.hasExceltis &&
    selectedProposal != null &&
    contactHasGammeForProposal(selectedProposal, selectedGamme);

  return (
    <div className="space-y-3 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-3">
      <div>
        <p className="text-sm font-medium">Exceltis (UC structurée)</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Sur assurance-vie ou PER uniquement. Chaque gamme a sa propre étiquette
          (ex. « Exceltis Sérénité — Août 2026 ») : réutilisée si déjà créée, sinon
          création automatique à l&apos;enregistrement.
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
              gamme: selectedGamme,
              millesimeKey: selectedKey,
            })
          }
        >
          Oui
        </button>
      </div>

      {value.hasExceltis && (
        <div className="space-y-3 pl-0.5">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Gamme Exceltis</Label>
            <div className="flex flex-wrap gap-2">
              {EXCELITIS_GAMME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    value.gamme === opt.value
                      ? "border-amber-500 bg-amber-100 text-amber-950"
                      : "border-input bg-background hover:bg-muted"
                  }`}
                  onClick={() =>
                    onChange({
                      hasExceltis: true,
                      gamme: opt.value,
                      millesimeKey: value.millesimeKey,
                    })
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Millésime {value.gamme} (M+1, M+2, M+3)
            </Label>
            <div className="flex flex-col gap-2">
              {proposals.map((opt) => {
                const catalogueMatch = findCatalogueMatchForGamme(opt, value.gamme);
                const onContactForGamme = contactHasGammeForProposal(opt, value.gamme);
                const plannedNom = formatExceltisEtiquetteNom(
                  value.gamme,
                  opt.month,
                  opt.year
                );

                return (
                  <label
                    key={opt.key}
                    className="flex items-start gap-2 text-sm cursor-pointer rounded-md border border-transparent hover:border-amber-300/60 px-2 py-1"
                  >
                    <input
                      type="radio"
                      name="exceltis-millesime"
                      className="h-4 w-4 mt-0.5"
                      checked={value.millesimeKey === opt.key}
                      onChange={() =>
                        onChange({
                          hasExceltis: true,
                          gamme: value.gamme,
                          millesimeKey: opt.key,
                        })
                      }
                    />
                    <span className="min-w-0">
                      <span>
                        {opt.label}
                        <span className="text-muted-foreground text-xs ml-1">
                          (M+{opt.offset})
                        </span>
                      </span>
                      {catalogueMatch ? (
                        <span className="block text-xs text-amber-800/90 mt-0.5">
                          Étiquette existante : {catalogueMatch.nom}
                        </span>
                      ) : (
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          À créer : {plannedNom}
                        </span>
                      )}
                      {onContactForGamme && (
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          Déjà sur ce client ({value.gamme})
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {alreadyOnContact && (
            <p className="text-xs text-muted-foreground">
              Ce client a déjà « {formatExceltisEtiquetteNom(selectedGamme, selectedProposal!.month, selectedProposal!.year)} » — pas de doublon.
            </p>
          )}
          {!alreadyOnContact && catalogueExists && selectedProposal && (
            <p className="text-xs text-muted-foreground">
              « {findCatalogueMatchForGamme(selectedProposal, selectedGamme)?.nom} » sera réutilisée à l&apos;enregistrement.
            </p>
          )}
          {!alreadyOnContact && !catalogueExists && selectedProposal && (
            <p className="text-xs text-muted-foreground">
              « {formatExceltisEtiquetteNom(selectedGamme, selectedProposal.month, selectedProposal.year)} » sera créée à l&apos;enregistrement.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
