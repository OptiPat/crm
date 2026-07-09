import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  dateInputToIso,
  isoToDateInput,
  type MonOrganisationPreviewLine,
} from "@/lib/contacts/mon-organisation-import";
import {
  ImportPreviewField,
  ImportPreviewLineCard,
  IMPORT_PREVIEW_FIELD_GRID_CLASS,
} from "@/components/contacts/import-preview-ui";

const STATUS_LABEL: Record<MonOrganisationPreviewLine["status"], string> = {
  ready: "À importer",
  invalid: "Invalide",
  duplicate_crm: "Déjà en base",
  duplicate_csv: "Doublon fichier",
  imported: "Importé",
};

const STATUS_VARIANT: Record<
  MonOrganisationPreviewLine["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  ready: "default",
  invalid: "destructive",
  duplicate_crm: "secondary",
  duplicate_csv: "destructive",
  imported: "secondary",
};

type MonOrganisationImportPreviewLineProps = {
  line: MonOrganisationPreviewLine;
  editable: boolean;
  selectable: boolean;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: (patch: Partial<MonOrganisationPreviewLine>) => void;
};

export function MonOrganisationImportPreviewLine({
  line,
  editable,
  selectable,
  checked,
  onToggle,
  onEdit,
}: MonOrganisationImportPreviewLineProps) {
  return (
    <ImportPreviewLineCard
      selectable={selectable}
      checked={checked}
      onCheckedChange={onToggle}
      header={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Ligne {line.rowIndex}</span>
            {line.niveau ? (
              <span className="text-xs text-muted-foreground">Niv. {line.niveau}</span>
            ) : null}
            <Badge variant={STATUS_VARIANT[line.status]}>{STATUS_LABEL[line.status]}</Badge>
          </div>
          {line.statusMessage ? (
            <p className="text-xs text-muted-foreground">{line.statusMessage}</p>
          ) : null}
        </>
      }
    >
      <div className={IMPORT_PREVIEW_FIELD_GRID_CLASS}>
        <ImportPreviewField label="Nom">
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

        <ImportPreviewField label="Prénom">
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

        <ImportPreviewField label="Email" wide>
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

        <ImportPreviewField label="Téléphone">
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

        <ImportPreviewField label="Adresse" wide>
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

        <ImportPreviewField label="CP">
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

        <ImportPreviewField label="Ville">
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

        <ImportPreviewField label="Pays">
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

        <ImportPreviewField label="Inscription">
          {editable ? (
            <Input
              type="date"
              className="h-8"
              defaultValue={isoToDateInput(line.dateInscriptionIso)}
              onBlur={(e) => {
                const iso = dateInputToIso(e.target.value);
                if (iso === line.dateInscriptionIso) return;
                onEdit({ dateInscriptionIso: iso });
              }}
            />
          ) : (
            <p className="text-sm truncate">{isoToDateInput(line.dateInscriptionIso)}</p>
          )}
        </ImportPreviewField>

        <ImportPreviewField label="Dernier contact">
          {editable ? (
            <Input
              type="date"
              className="h-8"
              defaultValue={isoToDateInput(line.dateDernierContactFilleulIso)}
              onBlur={(e) => {
                const iso = dateInputToIso(e.target.value);
                if (iso === line.dateDernierContactFilleulIso) return;
                onEdit({ dateDernierContactFilleulIso: iso });
              }}
            />
          ) : (
            <p className="text-sm truncate">
              {isoToDateInput(line.dateDernierContactFilleulIso) || "—"}
            </p>
          )}
        </ImportPreviewField>

        <ImportPreviewField label="Parrain" wide>
          {editable ? (
            <Input
              className="h-8"
              defaultValue={line.parrainLabel}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v || v === line.parrainLabel) return;
                onEdit({ parrainLabel: v });
              }}
            />
          ) : (
            <p className="text-sm truncate">{line.parrainLabel || "—"}</p>
          )}
        </ImportPreviewField>
      </div>
    </ImportPreviewLineCard>
  );
}
