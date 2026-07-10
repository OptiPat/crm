import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { isoToDateInput } from "@/lib/contacts/parse-import-date";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import {
  formatPlacementEuroField,
  formatPlacementProduitLabel,
  isPlacementPreviewScpiReinvestEditable,
  isPlacementPreviewViVpEditable,
  parsePlacementEuroFieldCentimes,
  PLACEMENT_VP_FREQUENCE_OPTIONS,
  type PlacementCrmDiffFieldHighlights,
  type PlacementCrmDiffHighlightField,
  type PlacementImportPreviewLine as PlacementLine,
} from "@/lib/investissements/placement-commandes-import";
import {
  ImportPreviewField,
  ImportPreviewLineCard,
  IMPORT_PREVIEW_FIELD_GRID_CLASS,
} from "@/components/contacts/import-preview-ui";
import { commitImportDateFieldChange } from "@/components/investissements/import-dialog-fullscreen";

const STATUS_LABEL: Record<PlacementLine["status"], string> = {
  ready: "À importer",
  review: "À vérifier",
  invalid: "Invalide",
  contact_not_found: "Investisseur introuvable",
  co_contact_not_found: "Co-investisseur introuvable",
  duplicate_crm: "Déjà en base",
  duplicate_csv: "Doublon fichier",
  imported: "Importé",
};

const STATUS_VARIANT: Record<
  PlacementLine["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  review: "outline",
  invalid: "destructive",
  contact_not_found: "destructive",
  co_contact_not_found: "destructive",
  duplicate_crm: "secondary",
  duplicate_csv: "destructive",
  imported: "secondary",
};

type Props = {
  line: PlacementLine;
  editable: boolean;
  selectable: boolean;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  onPatch: (patch: Partial<PlacementLine>) => void;
  crmDiffHighlights?: PlacementCrmDiffFieldHighlights;
};

function crmDiffHighlight(
  highlights: PlacementCrmDiffFieldHighlights | undefined,
  field: PlacementCrmDiffHighlightField
) {
  return highlights?.[field];
}

export function PlacementImportPreviewLine({
  line,
  editable,
  selectable,
  checked,
  onToggle,
  onPatch,
  crmDiffHighlights,
}: Props) {
  const editableViVp = isPlacementPreviewViVpEditable(line.typeProduit);
  const editableReinv = isPlacementPreviewScpiReinvestEditable(line.typeProduit);

  return (
    <ImportPreviewLineCard
      selectable={selectable}
      checked={checked}
      onCheckedChange={onToggle}
      header={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Ligne {line.rowIndex}</span>
            <Badge variant={STATUS_VARIANT[line.status]}>{STATUS_LABEL[line.status]}</Badge>
          </div>
          {line.statusMessage ? (
            <p className="text-xs text-muted-foreground">{line.statusMessage}</p>
          ) : null}
        </>
      }
    >
      <div className={IMPORT_PREVIEW_FIELD_GRID_CLASS}>
        <ImportPreviewField label="Contact" wide>
          <p className="text-sm truncate">
            {line.contactLabel}
            {line.coContactLabel ? (
              <span className="text-muted-foreground"> + {line.coContactLabel}</span>
            ) : null}
          </p>
        </ImportPreviewField>

        <ImportPreviewField
          label="Produit"
          wide
          highlight={crmDiffHighlight(crmDiffHighlights, "nomProduit")}
        >
          <p className="text-sm truncate">{formatPlacementProduitLabel(line)}</p>
        </ImportPreviewField>

        <ImportPreviewField
          label="Contrat"
          highlight={crmDiffHighlight(crmDiffHighlights, "numeroContrat")}
        >
          <p className="text-sm font-mono text-xs truncate">{line.numeroContrat ?? "—"}</p>
        </ImportPreviewField>

        <ImportPreviewField
          label="Partenaire"
          highlight={crmDiffHighlight(crmDiffHighlights, "partenaireNom")}
        >
          <p className="text-sm truncate">{line.partenaireNom || "—"}</p>
        </ImportPreviewField>

        <ImportPreviewField
          label="VI"
          highlight={crmDiffHighlight(crmDiffHighlights, "montantCentimes")}
        >
          {editable && editableViVp ? (
            <Input
              key={`${line.lineKey}-vi-${line.montantCentimes}`}
              className="h-8 text-right"
              defaultValue={formatPlacementEuroField(line.montantCentimes)}
              onBlur={(e) => {
                const cents = parsePlacementEuroFieldCentimes(e.target.value);
                if (cents == null) return;
                onPatch({ montantCentimes: cents });
              }}
            />
          ) : (
            <p className="text-sm">{formatEuroCentimes(line.montantCentimes)}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="VP"
          highlight={crmDiffHighlight(crmDiffHighlights, "montantVpCentimes")}
        >
          {editable && editableViVp ? (
            <div className="space-y-1">
              <Input
                key={`${line.lineKey}-vp-${line.montantVpCentimes ?? "x"}`}
                className="h-8 text-right"
                defaultValue={
                  line.montantVpCentimes != null
                    ? formatPlacementEuroField(line.montantVpCentimes)
                    : ""
                }
                placeholder="—"
                onBlur={(e) => {
                  const cents = parsePlacementEuroFieldCentimes(e.target.value);
                  onPatch({
                    montantVpCentimes: cents ?? undefined,
                    frequenceVp: line.frequenceVp,
                  });
                }}
              />
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={line.frequenceVp ?? ""}
                onChange={(e) => {
                  onPatch({
                    frequenceVp: e.target.value || undefined,
                    montantVpCentimes: line.montantVpCentimes,
                  });
                }}
              >
                {PLACEMENT_VP_FREQUENCE_OPTIONS.map((opt) => (
                  <option key={opt.value || "none"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : line.versementProgramme && line.montantVpCentimes != null ? (
            <p className="text-sm">{formatEuroCentimes(line.montantVpCentimes)}</p>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Réinv. div."
          highlight={
            crmDiffHighlight(crmDiffHighlights, "reinvestissementDividendes") ??
            crmDiffHighlight(crmDiffHighlights, "pourcentageReinvestissement")
          }
        >
          {editable && editableReinv ? (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={line.reinvestissementDividendes ?? false}
                onCheckedChange={(c) => {
                  onPatch({
                    reinvestissementDividendes: c === true,
                    pourcentageReinvestissement: line.pourcentageReinvestissement ?? 100,
                  });
                }}
              />
              <Input
                key={`${line.lineKey}-reinv-${line.pourcentageReinvestissement ?? "x"}`}
                className="h-8 w-14 text-right"
                defaultValue={
                  line.reinvestissementDividendes
                    ? String(line.pourcentageReinvestissement ?? 100)
                    : ""
                }
                placeholder="—"
                disabled={!line.reinvestissementDividendes}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  if (!raw) return;
                  const pct = Number.parseInt(raw, 10);
                  if (!Number.isFinite(pct)) return;
                  onPatch({
                    reinvestissementDividendes: true,
                    pourcentageReinvestissement: pct,
                  });
                }}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          ) : line.reinvestissementDividendes ? (
            <p className="text-sm">{line.pourcentageReinvestissement ?? 100} %</p>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Date souscription"
          highlight={crmDiffHighlight(crmDiffHighlights, "dateEffetIso")}
        >
          {editable && editableViVp ? (
            <Input
              key={`${line.lineKey}-date`}
              type="date"
              className="h-8"
              value={isoToDateInput(line.dateEffetIso)}
              onChange={(e) => {
                const next = commitImportDateFieldChange(e.target.value, line.dateEffetIso);
                if (next === null) return;
                onPatch({ dateEffetIso: next });
              }}
            />
          ) : (
            <p className="text-sm truncate">
              {line.dateEffetIso ? isoToDateInput(line.dateEffetIso) : "—"}
            </p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Clôture"
          highlight={crmDiffHighlight(crmDiffHighlights, "dateSortieIso")}
        >
          {line.etatCommande === "CLOSE" ? (
            editable ? (
              <div className="space-y-1">
                <Badge variant="secondary" className="w-fit">
                  Close
                </Badge>
                <Input
                  key={`${line.lineKey}-sortie`}
                  type="date"
                  className="h-8"
                  value={isoToDateInput(line.dateSortieIso)}
                  onChange={(e) => {
                    const next = commitImportDateFieldChange(e.target.value, line.dateSortieIso);
                    if (next === null) return;
                    onPatch({ dateSortieIso: next });
                  }}
                />
              </div>
            ) : (
              <p className="text-sm truncate">{isoToDateInput(line.dateSortieIso) || "—"}</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </ImportPreviewField>
      </div>
    </ImportPreviewLineCard>
  );
}
