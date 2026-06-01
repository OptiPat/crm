import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Mail } from "lucide-react";
import {
  dismissStelliumExceltisSignal,
  getStelliumExceltisSignals,
  notifyStelliumExceltisChanged,
  STELLIUM_EXCELTIS_CHANGED_EVENT,
  type StelliumExceltisSignal,
} from "@/lib/api/tauri-stellium-exceltis";
import { toast } from "sonner";

type StelliumExceltisAlertsProps = {
  onOpenEtiquette?: (etiquetteId: number) => void;
};

export function StelliumExceltisAlerts({ onOpenEtiquette }: StelliumExceltisAlertsProps) {
  const [signals, setSignals] = useState<StelliumExceltisSignal[]>([]);

  const load = useCallback(async () => {
    try {
      setSignals(await getStelliumExceltisSignals());
    } catch {
      setSignals([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener(STELLIUM_EXCELTIS_CHANGED_EVENT, onChange);
    return () =>
      window.removeEventListener(STELLIUM_EXCELTIS_CHANGED_EVENT, onChange);
  }, [load]);

  const handleDismiss = async (messageId: string) => {
    try {
      await dismissStelliumExceltisSignal(messageId);
      notifyStelliumExceltisChanged();
      await load();
      toast.success("Signal masqué");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  if (signals.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {signals.map((sig) => (
        <div
          key={sig.gmail_message_id}
          className="flex flex-wrap items-start gap-3 rounded-lg border border-amber-300/80 bg-amber-50/90 px-4 py-3 text-sm"
        >
          <Mail className="h-5 w-5 text-amber-800 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-[200px] space-y-1">
            <p className="font-medium text-amber-950">
              Remboursement Exceltis — {sig.millesime_label}
            </p>
            {sig.operation_from_label ? (
              <p className="text-xs font-medium text-amber-950">
                À partir du {sig.operation_from_label}, le fond se désinvestit —
                vous pourrez agir dessus (arbitrage, réinvestissement).
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground line-clamp-1">{sig.subject}</p>
            <p className="text-xs text-amber-900/90">
              {sig.contact_count > 0
                ? `${sig.contact_count} client(s) avec l’étiquette « ${sig.etiquette_nom} »`
                : `Aucun client avec « ${sig.etiquette_nom} » — posez l’étiquette à la main si besoin.`}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {sig.etiquette_id != null && onOpenEtiquette && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onOpenEtiquette(sig.etiquette_id!)}
              >
                Voir la liste
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              title="Masquer ce signal (ne supprime pas les étiquettes sur les contacts)"
              onClick={() => void handleDismiss(sig.gmail_message_id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
