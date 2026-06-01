import { useEffect, useState } from "react";
import { getContactAutoEtiquetteLog } from "@/lib/api/tauri-segments";

export function ContactAutoEtiquetteLog({ contactId }: { contactId: number }) {
  const [entries, setEntries] = useState<
    Awaited<ReturnType<typeof getContactAutoEtiquetteLog>>
  >([]);

  useEffect(() => {
    getContactAutoEtiquetteLog(contactId, 15)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [contactId]);

  if (entries.length === 0) return null;

  return (
    <div className="w-full mt-2 rounded-lg border bg-muted/20 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground mb-1.5">
        Dernières évaluations automatiques
      </p>
      <ul className="space-y-1 text-xs">
        {entries.map((e, i) => (
          <li key={`${e.etiquetteId}-${e.evaluatedAt}-${i}`} className="flex flex-wrap gap-x-2">
            <span className="font-medium">{e.etiquetteNom}</span>
            <span className={e.matched ? "text-green-700" : "text-muted-foreground"}>
              {e.matched ? "appliquée" : "non applicable"}
            </span>
            <span className="text-muted-foreground">
              {new Date(e.evaluatedAt * 1000).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
