import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { Contact, FileSignature, Loader2, Sparkles, UserSearch } from "lucide-react";
import { SETTING_CONTACT_MAIL_AUTO_SYNC } from "@/lib/api/tauri-contact-gmail";
import { fetchGmailSignatureForCgp, getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  syncAllContactsGoogle,
  googleContactBatchSyncSummary,
  type GoogleContactBatchSyncResult,
} from "@/lib/api/tauri-google-contacts";
import { GoogleContactBatchReportDialog } from "@/components/settings/GoogleContactBatchReportDialog";
import { GoogleContactNameProposalsDialog } from "@/components/settings/GoogleContactNameProposalsDialog";
import {
  getStelliumExceltisSignals,
  notifyStelliumExceltisChanged,
  resetStelliumExceltisDismissed,
  scanStelliumExceltisEmails,
  STELLIUM_EXCELTIS_CHANGED_EVENT,
  type StelliumExceltisSignal,
} from "@/lib/api/tauri-stellium-exceltis";
import { stelliumExceltisHeadline } from "@/lib/etiquettes/stellium-signal-ui";
import { EmailOAuthConnect } from "@/components/emails/EmailOAuthConnect";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import { getSetting, setSetting } from "@/lib/api/tauri-settings";
import { toast } from "sonner";

type ParametresEmailSectionProps = {
  cgpConfig: CgpConfig;
  onConfigChange: (patch: Partial<CgpConfig>) => void;
};

export function ParametresEmailSection({ cgpConfig, onConfigChange }: ParametresEmailSectionProps) {
  const [importingSignature, setImportingSignature] = useState(false);
  const [scanningStellium, setScanningStellium] = useState(false);
  const [autoMailSync, setAutoMailSync] = useState(false);
  const [batchGoogleOpen, setBatchGoogleOpen] = useState(false);
  const [batchGoogleRunning, setBatchGoogleRunning] = useState(false);
  const [batchReport, setBatchReport] = useState<GoogleContactBatchSyncResult | null>(null);
  const [batchReportOpen, setBatchReportOpen] = useState(false);
  const [nameProposalsOpen, setNameProposalsOpen] = useState(false);
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

  useEffect(() => {
    getSetting(SETTING_CONTACT_MAIL_AUTO_SYNC)
      .then((v) => setAutoMailSync(v === "1"))
      .catch(() => setAutoMailSync(false));
  }, []);

  const handleImportGmailSignature = async () => {
    setImportingSignature(true);
    try {
      const status = await getEmailConnectionStatus();
      if (status.provider !== "google" || !status.connected) {
        toast.error("Connectez Google dans la section Connexion.");
        return;
      }
      const sig = await fetchGmailSignatureForCgp();
      onConfigChange({
        email_signature: sig.plain,
        email_signature_html: sig.html,
      });
      toast.success("Signature Gmail importée — enregistrez vos modifications.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import signature impossible");
    } finally {
      setImportingSignature(false);
    }
  };

  const hasHtmlPreview = Boolean(cgpConfig.email_signature_html?.trim());

  const handleBatchGoogleSync = async () => {
    setBatchGoogleRunning(true);
    try {
      const status = await getEmailConnectionStatus();
      if (status.provider !== "google" || !status.connected) {
        toast.error("Connectez Google dans Paramètres → Email.");
        return;
      }
      const result = await syncAllContactsGoogle();
      setBatchReport(result);
      setBatchReportOpen(true);
      toast.success(googleContactBatchSyncSummary(result));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Synchronisation Google Contacts impossible.");
    } finally {
      setBatchGoogleRunning(false);
      setBatchGoogleOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <EmailOAuthConnect variant="embedded" />

      <SettingsPanel
        title="Google Contacts (iPhone)"
        description="Pousse les contacts CRM (clients, prospects, filleuls, prescripteurs) vers Google Contacts. Complète le CRM si besoin, ne modifie Google que si nécessaire, supprime les doublons Google (même email/tél)."
      >
        <Button
          type="button"
          variant="outline"
          disabled={batchGoogleRunning}
          onClick={() => setBatchGoogleOpen(true)}
        >
          {batchGoogleRunning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Synchronisation en cours…
            </>
          ) : (
            <>
              <Contact className="h-4 w-4 mr-2" />
              Synchroniser tous les contacts CRM
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={async () => {
            try {
              const status = await getEmailConnectionStatus();
              if (status.provider !== "google" || !status.connected) {
                toast.error("Connectez Google dans Paramètres → Email.");
                return;
              }
              setNameProposalsOpen(true);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Connexion Google indisponible.");
            }
          }}
        >
          <UserSearch className="h-4 w-4 mr-2" />
          Propositions nom / prénom (Google)
        </Button>
        <p className="text-xs text-muted-foreground mt-3">
          Traite tous les contacts avec email ou téléphone. Les doublons Google (même coordonnées)
          sont fusionnés automatiquement — seule la fiche la plus complète est conservée.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Pour les fiches sans correspondance email/tél Google : scan manuel par nom/prénom,
          validation une par une (complète le CRM si Google a des coordonnées). Les propositions
          ignorées ne réapparaissent plus aux scans suivants.
        </p>
      </SettingsPanel>

      <AlertDialog open={batchGoogleOpen} onOpenChange={setBatchGoogleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Synchroniser vers Google Contacts ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le CRM recherche chaque contact dans Google (email / téléphone), complète le CRM si
              des coordonnées manquent, crée la fiche si absente, et supprime les doublons Google
              évidents (même email ou tél). Laissez le CRM ouvert pendant l&apos;opération.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchGoogleRunning}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={batchGoogleRunning}
              onClick={(e) => {
                e.preventDefault();
                void handleBatchGoogleSync();
              }}
            >
              Lancer la synchronisation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GoogleContactBatchReportDialog
        result={batchReport}
        open={batchReportOpen}
        onOpenChange={setBatchReportOpen}
      />

      <GoogleContactNameProposalsDialog
        open={nameProposalsOpen}
        onOpenChange={setNameProposalsOpen}
      />

      <SettingsPanel
        title="Exceltis — mails Stellium"
        description="Détection automatique des emails Stellium (remboursements effectués ou annoncés à venir). Chaque ligne = un millésime repéré. Les « Informations complémentaires » sont ignorées. Gmail connecté requis."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={scanningStellium}
            onClick={async () => {
              setScanningStellium(true);
              try {
                const status = await getEmailConnectionStatus();
                if (status.provider !== "google" || !status.connected) {
                  toast.error("Connectez Google dans la section Connexion.");
                  return;
                }
                const result = await scanStelliumExceltisEmails();
                notifyStelliumExceltisChanged();
                if (result.new_signals > 0) {
                  toast.success(
                    `${result.new_signals} nouveau(x) millésime(s) Exceltis détecté(s).`
                  );
                } else if (result.signals.length > 0) {
                  toast.success(
                    `${result.scanned} mail(s) analysé(s) — ${result.signals.length} millésime(s) déjà connu(s). File Exceltis resynchronisée.`
                  );
                } else if (result.scanned > 0) {
                  toast.warning(
                    `${result.scanned} mail(s) trouvé(s) mais aucun millésime reconnu. S’ils ont été masqués, cliquez sur « Réafficher les annonces masquées ». Formats attendus : « Remboursement Exceltis {Gamme} {Mois} {Année} » ou newsletter « Remboursements Exceltis à venir ».`
                  );
                } else {
                  toast.info(
                    "Aucun mail Exceltis Stellium sur les 400 derniers jours."
                  );
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
            }}
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
            onClick={async () => {
              setScanningStellium(true);
              try {
                await resetStelliumExceltisDismissed();
                const status = await getEmailConnectionStatus();
                if (status.provider === "google" && status.connected) {
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
            }}
          >
            Réafficher les annonces masquées
          </Button>
        </div>
        {stelliumSignals.length > 0 ? (
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 px-3 py-2.5 space-y-1.5 text-sm">
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
                  <span className="block text-[11px] opacity-80">{sig.subject}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              « Déjà connu » = ces millésimes étaient enregistrés. Bandeau détaillé sur Suivi.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Aucun millésime Exceltis enregistré. Lancez un scan : les annonces Stellium apparaissent
            ici et sur la page Suivi.
          </p>
        )}
      </SettingsPanel>

      <SettingsPanel
        title="Historique boîte mail (fiche contact)"
        description="Synchronisation légère et incrémentale — n’impacte pas la détection « en attente de réponse » des campagnes."
      >
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/80 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Sync auto à l’ouverture de Relation client</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Une passe incrémentale à l’ouverture de Relation client. Utilisez « Sync Gmail » sur
              la fiche pour l’import complet (5 ans), repris automatiquement par lots jusqu’à la fin.
            </p>
          </div>
          <Switch
            checked={autoMailSync}
            onCheckedChange={(checked) => {
              setAutoMailSync(checked);
              void setSetting(SETTING_CONTACT_MAIL_AUTO_SYNC, checked ? "1" : "0").catch(() =>
                toast.error("Impossible d’enregistrer le réglage")
              );
            }}
          />
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Signature des emails"
        description="Ajoutée en fin de chaque envoi depuis Suivi. Importez depuis Gmail pour conserver le logo."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={importingSignature}
            onClick={() => void handleImportGmailSignature()}
          >
            {importingSignature ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1.5" />
                Importer Gmail
              </>
            )}
          </Button>
        }
      >
        <div className={hasHtmlPreview ? "grid gap-6 lg:grid-cols-2" : "space-y-4"}>
          <div className="space-y-2">
            <Label htmlFor="email_signature" className="text-sm font-medium">
              Texte brut
            </Label>
            <Textarea
              id="email_signature"
              rows={hasHtmlPreview ? 10 : 6}
              className="font-mono text-sm resize-y min-h-[140px]"
              placeholder={"Cordialement,\nPrénom Nom\nCabinet — 01 23 45 67 89"}
              value={cgpConfig.email_signature ?? ""}
              onChange={(e) =>
                onConfigChange({
                  email_signature: e.target.value,
                  email_signature_html: "",
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Modifier le texte après un import Gmail efface le logo — réimportez si besoin.
            </p>
          </div>

          {hasHtmlPreview && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <FileSignature className="h-4 w-4 text-muted-foreground" />
                Aperçu envoyé
              </Label>
              <div className="rounded-xl border bg-white p-4 min-h-[140px] shadow-inner">
                <div
                  className="prose prose-sm max-w-none text-foreground"
                  dangerouslySetInnerHTML={{ __html: cgpConfig.email_signature_html! }}
                />
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border/60">
          Variable agenda dans les templates :{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">{"{{lien_agenda}}"}</code>
        </p>
      </SettingsPanel>
    </div>
  );
}
