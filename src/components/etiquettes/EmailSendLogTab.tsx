import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getEmailSendLog,
  type EmailSendLogEntry,
} from "@/lib/api/tauri-email-send-log";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";
import { formatEtiquetteSendDatetime } from "@/lib/etiquettes/etiquette-email-preview";
import { subscribeRelationChanged } from "@/lib/etiquettes/etiquette-events";
import { isScpiBulletinLogEntry } from "@/lib/emails/scpi-envois-filters";

export function EmailSendLogTab({
  scpiOnly = false,
  scpiPeriod,
  onScpiOnlyChange,
}: {
  scpiOnly?: boolean;
  scpiPeriod?: string | null;
  onScpiOnlyChange?: (value: boolean) => void;
}) {
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

  const filtered = useMemo(() => {
    let list = entries;
    if (scpiOnly) {
      list = list.filter(isScpiBulletinLogEntry);
    }
    if (scpiPeriod?.trim()) {
      const p = scpiPeriod.trim().toLowerCase();
      list = list.filter(
        (e) =>
          (e.subject ?? "").toLowerCase().includes(p) ||
          (e.template_nom ?? "").toLowerCase().includes(p)
      );
    }
    return list;
  }, [entries, scpiOnly, scpiPeriod]);

  const scpiStats = useMemo(() => {
    const scpi = entries.filter(isScpiBulletinLogEntry);
    const ok = scpi.filter((e) => e.status === "success").length;
    const err = scpi.filter((e) => e.status === "error").length;
    return { total: scpi.length, ok, err };
  }, [entries]);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Chargement…</div>;
  }

  return (
    <div className="space-y-3">
      {(onScpiOnlyChange || scpiPeriod) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {onScpiOnlyChange && (
            <Button
              type="button"
              variant={scpiOnly ? "secondary" : "outline"}
              size="sm"
              onClick={() => onScpiOnlyChange(!scpiOnly)}
            >
              {scpiOnly ? "Voir tout le journal" : "Filtrer : bulletins SCPI"}
            </Button>
          )}
          {scpiPeriod ? (
            <Badge variant="outline" className="text-[10px]">
              Période {scpiPeriod}
            </Badge>
          ) : null}
          {scpiStats.total > 0 && (
            <span className="text-muted-foreground">
              {scpiStats.ok} OK{scpiStats.err > 0 ? ` · ${scpiStats.err} erreur(s)` : ""}
            </span>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {scpiOnly
            ? "Aucun envoi bulletin SCPI dans le journal."
            : "Aucun envoi enregistré pour le moment."}
        </div>
      ) : (
        <LogEntriesList entries={filtered} />
      )}
    </div>
  );
}

function LogEntriesList({ entries }: { entries: EmailSendLogEntry[] }) {
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
          const etiquette = group[0]?.etiquette_nom ?? group[0]?.template_nom ?? "Campagne";
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
