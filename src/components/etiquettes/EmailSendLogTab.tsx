import { useCallback, useEffect, useState } from "react";
import {
  getEmailSendLog,
  type EmailSendLogEntry,
} from "@/lib/api/tauri-email-send-log";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import { formatEtiquetteSendDatetime } from "@/lib/etiquettes/etiquette-email-preview";
import { subscribeRelationChanged } from "@/lib/etiquettes/etiquette-events";

export function EmailSendLogTab() {
  const [entries, setEntries] = useState<EmailSendLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setEntries(await getEmailSendLog(200));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeRelationChanged(() => void load());
  }, [load]);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Chargement…</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Aucun envoi enregistré pour le moment.
      </div>
    );
  }

  const batchGroups = new Map<string, EmailSendLogEntry[]>();
  for (const e of entries) {
    if (e.batch_id && e.send_mode === "batch") {
      const list = batchGroups.get(e.batch_id) ?? [];
      list.push(e);
      batchGroups.set(e.batch_id, list);
    }
  }

  const renderedBatches = new Set<string>();

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        if (entry.batch_id && entry.send_mode === "batch") {
          if (renderedBatches.has(entry.batch_id)) return null;
          renderedBatches.add(entry.batch_id);
          const group = batchGroups.get(entry.batch_id) ?? [entry];
          const ok = group.filter((g) => g.status === "success").length;
          const err = group.filter((g) => g.status === "error").length;
          const etiquette = group[0]?.etiquette_nom ?? "Campagne";
          const date = formatEtiquetteSendDatetime(group[0]?.created_at ?? null);
          return (
            <div key={entry.batch_id} className="p-4 border rounded-lg bg-card space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Envoi groupé</Badge>
                <span className="font-medium">{etiquette}</span>
                <span className="text-xs text-muted-foreground">{date}</span>
              </div>
              <p className="text-sm">
                {ok} envoyé{ok > 1 ? "s" : ""}
                {err > 0 ? `, ${err} erreur${err > 1 ? "s" : ""}` : ""}
              </p>
            </div>
          );
        }

        const ok = entry.status === "success";
        return (
          <div key={entry.id} className="p-4 border rounded-lg bg-card flex gap-3 items-start">
            {ok ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {entry.contact_prenom} {entry.contact_nom}
                </span>
                {(entry.etiquette_nom ?? entry.template_nom) && (
                  <Badge variant="outline" className="text-xs">
                    {entry.etiquette_nom ?? entry.template_nom}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatEtiquetteSendDatetime(entry.created_at)}
                </span>
              </div>
              {entry.subject && (
                <p className="text-sm text-muted-foreground truncate">Objet : {entry.subject}</p>
              )}
              {!ok && entry.error_message && (
                <p className="text-sm text-destructive">{entry.error_message}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
