import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { isoToDateInput } from "@/lib/contacts/parse-import-date";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import {
  formatImmoEuroField,
  IMMO_IMPORT_TYPE_PRODUIT_OPTIONS,
  parseImmoEuroFieldCentimes,
  type ImmoCrmDiffFieldHighlights,
  type ImmoCrmDiffHighlightField,
  type ImmoImportPreviewLine as ImmoLine,
} from "@/lib/investissements/immo-commandes-import";
import {
  ImportPreviewField,
  ImportPreviewLineCard,
  IMPORT_PREVIEW_FIELD_GRID_CLASS,
} from "@/components/contacts/import-preview-ui";
import { commitImportDateFieldChange } from "@/components/investissements/import-dialog-fullscreen";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { ImmoPreviewEditablePatch } from "@/lib/investissements/immo-commandes-import";

const STATUS_LABEL: Record<ImmoLine["status"], string> = {
  ready: "À importer",
  invalid: "Invalide",
  contact_not_found: "Investisseur introuvable",
  co_contact_not_found: "Co-investisseur introuvable",
  duplicate_crm: "Déjà en base",
  duplicate_csv: "Doublon fichier",
  imported: "Importé",
};

const STATUS_VARIANT: Record<
  ImmoLine["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  invalid: "destructive",
  contact_not_found: "destructive",
  co_contact_not_found: "destructive",
  duplicate_crm: "secondary",
  duplicate_csv: "destructive",
  imported: "secondary",
};

type Props = {
  line: ImmoLine;
  contacts: Contact[];
  editable: boolean;
  selectable: boolean;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  onPatch: (patch: ImmoPreviewEditablePatch) => void;
  crmDiffHighlights?: ImmoCrmDiffFieldHighlights;
};

function crmDiffHighlight(
  highlights: ImmoCrmDiffFieldHighlights | undefined,
  field: ImmoCrmDiffHighlightField
) {
  return highlights?.[field];
}

export function ImmoImportPreviewLine({
  line,
  contacts,
  editable,
  selectable,
  checked,
  onToggle,
  onPatch,
  crmDiffHighlights,
}: Props) {
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
          {editable ? (
            <div className="space-y-2">
              <ContactPersonSearch
                placeholder="Rattacher au CRM…"
                contacts={contacts}
                value={line.contactId}
                onChange={(id) => onPatch({ contactId: id })}
              />
              {line.investorNom ? (
                <p className="text-xs text-muted-foreground truncate">
                  Fichier : {line.investorPrenom} {line.investorNom}
                </p>
              ) : null}
              {line.coInvestorNom && line.coInvestorPrenom ? (
                <ContactPersonSearch
                  label="Co-investisseur"
                  placeholder="Co-investisseur CRM…"
                  contacts={contacts}
                  excludeId={line.contactId}
                  value={line.coContactId}
                  onChange={(id) => onPatch({ coContactId: id })}
                />
              ) : null}
            </div>
          ) : (
            <p className="text-sm truncate">
              {line.contactLabel}
              {line.coContactLabel ? (
                <span className="text-muted-foreground"> + {line.coContactLabel}</span>
              ) : null}
            </p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Type"
          highlight={crmDiffHighlight(crmDiffHighlights, "typeProduit")}
        >
          {editable ? (
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={line.typeProduit}
              onChange={(e) => onPatch({ typeProduit: e.target.value })}
            >
              {!IMMO_IMPORT_TYPE_PRODUIT_OPTIONS.some((o) => o.value === line.typeProduit) && (
                <option value={line.typeProduit}>{line.typeProduit}</option>
              )}
              {IMMO_IMPORT_TYPE_PRODUIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm truncate">{line.typeProduit}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Produit"
          wide
          highlight={crmDiffHighlight(crmDiffHighlights, "nomProduit")}
        >
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.nomProduit}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (!value || value === line.nomProduit) return;
                onPatch({ nomProduit: value });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.nomProduit}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Montant"
          highlight={crmDiffHighlight(crmDiffHighlights, "montantCentimes")}
        >
          {editable ? (
            <Input
              className="h-8 text-right"
              defaultValue={formatImmoEuroField(line.montantCentimes)}
              onBlur={(e) => {
                const cents = parseImmoEuroFieldCentimes(e.target.value);
                if (cents == null) return;
                onPatch({ montantCentimes: cents });
              }}
            />
          ) : (
            <p className="text-sm">{formatEuroCentimes(line.montantCentimes)}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Date acte"
          highlight={crmDiffHighlight(crmDiffHighlights, "dateActeIso")}
        >
          {editable ? (
            <Input
              type="date"
              className="h-8"
              defaultValue={isoToDateInput(line.dateActeIso)}
              onBlur={(e) => {
                const next = commitImportDateFieldChange(e.target.value, line.dateActeIso);
                if (next === null) return;
                onPatch({ dateActeIso: next });
              }}
            />
          ) : (
            <p className="text-sm truncate">{isoToDateInput(line.dateActeIso) || "—"}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField label="Partenaire">
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.partenaireNom}
              placeholder="Promoteur…"
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value === line.partenaireNom) return;
                onPatch({ partenaireNom: value });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.partenaireNom || "—"}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Notes"
          wide
          highlight={crmDiffHighlight(crmDiffHighlights, "notes")}
        >
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.notes ?? ""}
              placeholder="Lot, état…"
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value === (line.notes ?? "")) return;
                onPatch({ notes: value || undefined });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.notes ?? "—"}</p>
          )}
        </ImportPreviewField>
      </div>
    </ImportPreviewLineCard>
  );
}
