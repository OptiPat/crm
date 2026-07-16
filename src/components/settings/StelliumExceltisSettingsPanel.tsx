import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { Loader2 } from "lucide-react";
import {
  getStelliumExceltisSignals,
  notifyStelliumExceltisChanged,
  resetStelliumExceltisDismissed,
  scanStelliumExceltisEmails,
  STELLIUM_EXCELTIS_CHANGED_EVENT,
  type StelliumExceltisSignal,
} from "@/lib/api/tauri-stellium-exceltis";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { stelliumExceltisHeadline } from "@/lib/etiquettes/stellium-signal-ui";
import { PARAMETRES_PATH } from "@/lib/settings/parametres-labels";
import { toast } from "sonner";

export function StelliumExceltisSettingsPanel() {
  const [scanningStellium, setScanningStellium] = useState(false);
  const [stelliumSignals, setStelliumSignals] = useState<StelliumExceltisSignal[]>([]);

  const loadStelliumSignals = useCallback(async () => {
    try {
      setStelliumSignals(await getStelliumExceltisSignals());
    } catch {
      setStelliumSignals([]);
    }
  }, []);

  useEffect(() => {
    void loadStelliumSignals();
    const onChanged = () => {
      void loadStelliumSignals();
    };
    window.addEventListener(STELLIUM_EXCELTIS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(STELLIUM_EXCELTIS_CHANGED_EVENT, onChanged);
  }, [loadStelliumSignals]);

  const runScan = async () => {
    setScanningStellium(true);
    try {
      const status = await getEmailConnectionStatus();
      const mailReady =
        status.connected &&
        (status.provider === "google" || status.provider === "microsoft");
      if (!mailReady) {
        toast.error(`Connectez Gmail ou Outlook dans ${PARAMETRES_PATH.emailConnexion}.`);
        return;
      }
      const result = await scanStelliumExceltisEmails();
      notifyStelliumExceltisChanged();
      if (result.new_signals > 0) {
        toast.success(`${result.new_signals} nouveau(x) millésime(s) Exceltis détecté(s).`);
      } else if (result.signals.length > 0) {
        toast.success(
          `${result.scanned} mail(s) analysé(s) — ${result.signals.length} millésime(s) déjà connu(s).`
        );
      } else if (result.scanned > 0) {
        toast.warning(
          `${result.scanned} mail(s) trouvé(s) mais aucun millésime reconnu. S'ils ont été masqués, cliquez sur « Réafficher les annonces masquées ».`
        );
      } else {
        toast.info("Aucun mail Exceltis Stellium sur les 400 derniers jours.");
      }
    } catch (e) {
      const msg =
        typeof e === "string"
          ? e
          : e instanceof Error
            ? e.message
            : "Scan Stellium impossible";
      toast.error(msg);
    } finally {
      setScanningStellium(false);
    }
  };

  const handleResetDismissed = async () => {
    setScanningStellium(true);
    try {
      await resetStelliumExceltisDismissed();
      const status = await getEmailConnectionStatus();
      const mailReady =
        status.connected &&
        (status.provider === "google" || status.provider === "microsoft");
      if (mailReady) {
        await scanStelliumExceltisEmails();
      }
      notifyStelliumExceltisChanged();
      toast.success("Annonces masquées réaffichées.");
    } catch (e) {
      const msg =
        typeof e === "string"
          ? e
          : e instanceof Error
            ? e.message
            : "Réinitialisation impossible";
      toast.error(msg);
    } finally {
      setScanningStellium(false);
    }
  };

  return (
    <SettingsPanel
      title="Exceltis — mails Stellium"
      description="Détection automatique des emails Stellium (remboursements effectués ou annoncés à venir). Fréquence configurable dans Arrière-plan & automatisations."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={scanningStellium}
          onClick={() => void runScan()}
        >
          {scanningStellium ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Vérification…
            </>
          ) : (
            "Vérifier les mails Stellium (Exceltis)"
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={scanningStellium}
          title="Annule les annonces que vous avez masquées (croix) et relance une détection complète."
          onClick={() => void handleResetDismissed()}
        >
          Réafficher les annonces masquées
        </Button>
      </div>
      {stelliumSignals.length > 0 ? (
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 px-3 py-2.5 space-y-1.5 text-sm mt-4">
          <p className="font-medium text-amber-950">
            {stelliumSignals.length} millésime{stelliumSignals.length > 1 ? "s" : ""} connu
            {stelliumSignals.length > 1 ? "s" : ""}
          </p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {stelliumSignals.map((sig) => (
              <li key={sig.gmail_message_id} className="line-clamp-2">
                {stelliumExceltisHeadline(sig.subject, sig.millesime_label, sig.etiquette_nom)}
                {sig.contact_count > 0
                  ? ` — ${sig.contact_count} client(s) tagué(s)`
                  : " — aucun client tagué avec cette étiquette"}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mt-4">
          Aucun millésime Exceltis enregistré. Lancez un scan : les annonces apparaissent ici et
          dans les bandeaux sur Suivi → Étiquettes.
        </p>
      )}
    </SettingsPanel>
  );
}
