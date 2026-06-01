import { getContrastColor, type ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";

const MAX_ETIQUETTES_ON_ROW = 4;

export function ContactRowEtiquettes({
  contactId,
  etiquettesParContact,
}: {
  contactId: number;
  etiquettesParContact: Record<number, ContactEtiquetteDetails[]>;
}) {
  const etiqs = etiquettesParContact[contactId];
  if (!etiqs?.length) return null;

  const shown = etiqs.slice(0, MAX_ETIQUETTES_ON_ROW);
  const extra = etiqs.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 gap-y-2 mt-2 mb-0.5 max-w-full">
      {shown.map((etiq) => (
        <span
          key={etiq.etiquette_id}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium max-w-[11rem] truncate"
          style={{
            backgroundColor: etiq.etiquette_couleur,
            color: getContrastColor(etiq.etiquette_couleur),
          }}
          title={etiq.etiquette_nom}
        >
          <span className="truncate">{etiq.etiquette_nom}</span>
        </span>
      ))}
      {extra > 0 && (
        <span className="text-xs text-muted-foreground shrink-0">+{extra}</span>
      )}
    </div>
  );
}
