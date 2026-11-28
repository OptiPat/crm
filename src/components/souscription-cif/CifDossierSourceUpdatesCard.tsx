import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";
import {
  acceptDossierSourceUpdate,
  dismissDossierSourceUpdate,
  listDossierSourceUpdates,
  type DossierSourceUpdate,
} from "@/lib/souscription-cif/dossier-source-updates";
import { formatDateInputFr } from "@/lib/souscription-cif/format-date-input-fr";
import type {
  SouscriptionCifDocumentId,
  SouscriptionCifProductType,
} from "@/lib/souscription-cif/souscription-cif-storage";

type CifDossierSourceUpdatesCardProps = {
  dossier: SouscriptionDossierFields;
  productType: SouscriptionCifProductType;
  onChange: (patch: Partial<SouscriptionDossierFields>) => void;
  onShowField: (fieldId: string, document: SouscriptionCifDocumentId) => void;
};

function displayValue(update: DossierSourceUpdate, value: string): string {
  return update.isDate ? (formatDateInputFr(value) ?? value) : value;
}

/** Champs retouchés à la main dont la fiche client / le dernier RIO-QPI a changé depuis. */
export function CifDossierSourceUpdatesCard({
  dossier,
  productType,
  onChange,
  onShowField,
}: CifDossierSourceUpdatesCardProps) {
  const updates = listDossierSourceUpdates(dossier, {
    includeNiveauExperience: productType === "scpi" || productType === "capital-investissement",
  });
  if (updates.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/50" role="status">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-amber-950">
          <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
          La fiche client a changé
        </CardTitle>
        <CardDescription className="text-amber-900/80">
          {updates.length === 1
            ? "Ce champ a été modifié à la main, mais la fiche ou le dernier RIO / QPI indique désormais autre chose."
            : "Ces champs ont été modifiés à la main, mais la fiche ou le dernier RIO / QPI indique désormais autre chose."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {updates.map((update) => (
          <div
            key={update.id}
            className="space-y-1.5 rounded-md border border-amber-200 bg-background p-2.5 text-xs"
          >
            <button
              type="button"
              className="text-left text-sm font-medium text-foreground underline-offset-2 hover:underline"
              onClick={() => onShowField(update.fieldId, update.document)}
            >
              {update.label}
            </button>
            <p className="line-clamp-3 whitespace-pre-line text-muted-foreground">
              <span className="font-medium text-foreground/80">Votre saisie : </span>
              {displayValue(update, update.current)}
            </p>
            <p className="line-clamp-3 whitespace-pre-line text-muted-foreground">
              <span className="font-medium text-foreground/80">Nouvelle valeur : </span>
              {displayValue(update, update.fresh)}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => onChange(acceptDossierSourceUpdate(dossier, update))}
              >
                Reprendre
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-xs"
                onClick={() => onChange(dismissDossierSourceUpdate(dossier, update))}
              >
                Garder ma saisie
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
