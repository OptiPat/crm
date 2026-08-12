import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  getEspaceConnexionLog,
  type EspaceConnexionLogEntry,
} from "@/lib/api/tauri-espace-client";
import { ESPACE_CLIENT_CHANGED_EVENT } from "@/lib/espace-client/espace-client-events";
import {
  formatEspaceConnexionEvent,
  formatEspaceTimestamp,
} from "@/lib/espace-client/espace-client-format";
import { Button } from "@/components/ui/button";

/** Entrées visibles tant qu'on ne déplie pas. */
const JOURNAL_APERCU = 3;

export interface ContactEspaceConnexionLogProps {
  contactId: number;
}

export function ContactEspaceConnexionLog({
  contactId,
}: ContactEspaceConnexionLogProps) {
  const [entries, setEntries] = useState<EspaceConnexionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  /** Le journal grossit sans fin : replié, il ne mange plus le panneau. */
  const [deplie, setDeplie] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await getEspaceConnexionLog(contactId));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Une synchronisation ajoute une ligne : le journal se remet à jour seul.
  useEffect(() => {
    const handler = () => void charger();
    window.addEventListener(ESPACE_CLIENT_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ESPACE_CLIENT_CHANGED_EVENT, handler);
  }, [charger]);

  const visibles = deplie ? entries : entries.slice(0, JOURNAL_APERCU);

  return (
    <div className="mt-6 space-y-2 border-t border-border/60 pt-5">
      <div className="flex items-center justify-between gap-2">
        {/* Un <p> et non un titre : la feuille de style applique Playfair
            aux h1-h6, qui jurerait avec les autres blocs du panneau. */}
        <p className="text-sm font-medium text-foreground">
          Journal des connexions
          {entries.length > 0 ? (
            <span className="ml-1 font-normal text-muted-foreground">
              — {entries.length} entrée{entries.length > 1 ? "s" : ""}
            </span>
          ) : null}
        </p>
        <div className="flex items-center gap-1">
          {entries.length > JOURNAL_APERCU ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setDeplie((ouvert) => !ouvert)}
            >
              {deplie ? "Réduire" : "Tout afficher"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={loading}
            onClick={() => void charger()}
          >
            {loading ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            Actualiser
          </Button>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucune connexion enregistrée pour l'instant.
        </p>
      ) : (
        <ul className="space-y-1 text-xs">
          {visibles.map((entry) => (
            <li
              key={`${entry.id}-${entry.created_at}`}
              className="flex flex-wrap items-baseline gap-x-2 text-muted-foreground"
            >
              <span className="text-foreground">
                {formatEspaceConnexionEvent(entry.event)}
              </span>
              <span>{formatEspaceTimestamp(entry.created_at)}</span>
              {entry.ip ? (
                <span className="font-mono text-[10px]">{entry.ip}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
