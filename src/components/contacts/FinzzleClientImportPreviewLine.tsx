import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  dateInputToIso,
  FINZZLE_CLIENT_CATEGORIE_OPTIONS,
  FINZZLE_CLIENT_CIVILITE_OPTIONS,
  isoToDateInput,
  type FinzzleClientPreviewLine,
  type FinzzleEnrichFieldHighlights,
  type FinzzleEnrichHighlightField,
} from "@/lib/contacts/finzzle-clients-import";
import {
  ImportPreviewField,
  ImportPreviewLineCard,
  IMPORT_PREVIEW_FIELD_GRID_CLASS,
} from "@/components/contacts/import-preview-ui";

const STATUS_LABEL: Record<FinzzleClientPreviewLine["status"], string> = {
  ready: "À importer",
  enrich: "Enrichir",
  duplicate_homonym: "Homonyme",
  invalid: "Invalide",
  duplicate_csv: "Doublon fichier",
  imported: "Importé",
};

const STATUS_VARIANT: Record<
  FinzzleClientPreviewLine["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  enrich: "default",
  duplicate_homonym: "destructive",
  invalid: "destructive",
  duplicate_csv: "destructive",
  imported: "secondary",
};

type FinzzleClientImportPreviewLineProps = {
  line: FinzzleClientPreviewLine;
  editable: boolean;
  selectable: boolean;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: (patch: Partial<FinzzleClientPreviewLine>) => void;
  enrichHighlights?: FinzzleEnrichFieldHighlights;
};

function enrichHighlight(
  highlights: FinzzleEnrichFieldHighlights | undefined,
  field: FinzzleEnrichHighlightField
) {
  return highlights?.[field];
}

export function FinzzleClientImportPreviewLine({
  line,
  editable,
  selectable,
  checked,
  onToggle,
  onEdit,
  enrichHighlights,
}: FinzzleClientImportPreviewLineProps) {
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
        <ImportPreviewField
          label="Statut CRM"
          highlight={enrichHighlight(enrichHighlights, "categorie")}
        >
          {editable ? (
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={line.categorie}
              onChange={(e) =>
                onEdit({
                  categorie: e.target.value as FinzzleClientPreviewLine["categorie"],
                })
              }
            >
              {FINZZLE_CLIENT_CATEGORIE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm truncate">{line.categorie.replace(/_/g, " ")}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Civilité"
          highlight={enrichHighlight(enrichHighlights, "civilite")}
        >
          {editable ? (
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={line.civilite}
              onChange={(e) => onEdit({ civilite: e.target.value })}
            >
              {FINZZLE_CLIENT_CIVILITE_OPTIONS.map((opt) => (
                <option key={opt.value || "none"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm truncate">{line.civilite || "—"}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField label="Nom" highlight={enrichHighlight(enrichHighlights, "nom")}>
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.nom}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v || v === line.nom) return;
                onEdit({ nom: v });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.nom}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField label="Prénom" highlight={enrichHighlight(enrichHighlights, "prenom")}>
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.prenom}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v || v === line.prenom) return;
                onEdit({ prenom: v });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.prenom}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Email"
          wide
          highlight={enrichHighlight(enrichHighlights, "email")}
        >
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.email}
              onBlur={(e) => {
                const v = e.target.value.trim().toLowerCase();
                if (v === line.email) return;
                onEdit({ email: v });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.email}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Téléphone"
          highlight={enrichHighlight(enrichHighlights, "telephone")}
        >
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.telephone}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === line.telephone) return;
                onEdit({ telephone: v });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.telephone}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Adresse"
          wide
          highlight={enrichHighlight(enrichHighlights, "adresse")}
        >
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.adresse}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === line.adresse) return;
                onEdit({ adresse: v });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.adresse}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField label="CP" highlight={enrichHighlight(enrichHighlights, "codePostal")}>
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.codePostal}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === line.codePostal) return;
                onEdit({ codePostal: v });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.codePostal}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField label="Ville" highlight={enrichHighlight(enrichHighlights, "ville")}>
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.ville}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === line.ville) return;
                onEdit({ ville: v });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.ville}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField label="Pays" highlight={enrichHighlight(enrichHighlights, "pays")}>
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.pays}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === line.pays) return;
                onEdit({ pays: v });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.pays}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Naissance"
          highlight={enrichHighlight(enrichHighlights, "dateNaissanceIso")}
        >
          {editable ? (
            <Input
              type="date"
              className="h-8"
              defaultValue={isoToDateInput(line.dateNaissanceIso)}
              onBlur={(e) => {
                const iso = dateInputToIso(e.target.value);
                if (iso === line.dateNaissanceIso) return;
                onEdit({ dateNaissanceIso: iso });
              }}
            />
          ) : (
            <p className="text-sm truncate">{isoToDateInput(line.dateNaissanceIso)}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField
          label="Origine"
          highlight={enrichHighlight(enrichHighlights, "sourceLead")}
        >
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.sourceLead}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === line.sourceLead) return;
                onEdit({ sourceLead: v });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.sourceLead}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField label="TMI" highlight={enrichHighlight(enrichHighlights, "tmi")}>
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.tmi}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === line.tmi) return;
                onEdit({ tmi: v });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.tmi || "—"}</p>
          )}
        </ImportPreviewField>
      </div>
    </ImportPreviewLineCard>
  );
}
