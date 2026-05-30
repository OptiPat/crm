import { Tag } from "lucide-react";
import { getEtiquetteNomForAlerte } from "@/lib/alertes/alerte-etiquette-links";
import { getContrastColor, type EtiquetteWithCount } from "@/lib/api/tauri-etiquettes";

type AlerteEtiquetteHintProps = {
  typeAlerte: string;
  etiquettes: EtiquetteWithCount[];
  onOpenEtiquettesTab?: () => void;
};

export function AlerteEtiquetteHint({
  typeAlerte,
  etiquettes,
  onOpenEtiquettesTab,
}: AlerteEtiquetteHintProps) {
  const nom = getEtiquetteNomForAlerte(typeAlerte);
  if (!nom) return null;

  const etiqu = etiquettes.find((e) => e.nom === nom);
  if (!etiqu) {
    return (
      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
        <Tag className="h-3.5 w-3.5 shrink-0" />
        Étiquette liée : « {nom} » (créez-la ou réactivez-la dans Étiquettes)
      </p>
    );
  }

  return (
    <p className="text-xs text-muted-foreground mt-2 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5">
        <Tag className="h-3.5 w-3.5 shrink-0" />
        Étiquette liée :
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: etiqu.couleur,
            color: getContrastColor(etiqu.couleur),
          }}
        >
          {etiqu.nom}
          {etiqu.actif === false ? " (désactivée)" : ""}
        </span>
        {etiqu.contact_count > 0 && (
          <span>{etiqu.contact_count} contact{etiqu.contact_count > 1 ? "s" : ""}</span>
        )}
      </span>
      {onOpenEtiquettesTab && (
        <button
          type="button"
          className="text-primary hover:underline text-xs"
          onClick={onOpenEtiquettesTab}
        >
          Voir l&apos;onglet Étiquettes
        </button>
      )}
    </p>
  );
}
