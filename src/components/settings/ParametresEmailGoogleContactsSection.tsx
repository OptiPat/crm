import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Contact, Loader2, UserSearch } from "lucide-react";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  syncAllContactsGoogle,
  googleContactBatchSyncSummary,
  type GoogleContactBatchSyncResult,
} from "@/lib/api/tauri-google-contacts";
import { GoogleContactBatchReportDialog } from "@/components/settings/GoogleContactBatchReportDialog";
import { GoogleContactNameProposalsDialog } from "@/components/settings/GoogleContactNameProposalsDialog";
import { PARAMETRES_PATH } from "@/lib/settings/parametres-labels";
import { toast } from "sonner";

export function ParametresEmailGoogleContactsSection() {
  const [batchGoogleOpen, setBatchGoogleOpen] = useState(false);
  const [batchGoogleRunning, setBatchGoogleRunning] = useState(false);
  const [batchReport, setBatchReport] = useState<GoogleContactBatchSyncResult | null>(null);
  const [batchReportOpen, setBatchReportOpen] = useState(false);
  const [nameProposalsOpen, setNameProposalsOpen] = useState(false);

  const handleBatchGoogleSync = async () => {
    setBatchGoogleRunning(true);
    try {
      const status = await getEmailConnectionStatus();
      if (status.provider !== "google" || !status.connected) {
        toast.error(`Connectez Google dans ${PARAMETRES_PATH.emailConnexion}.`);
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
    <>
      <SettingsPanel
        title="Google Contacts (iPhone)"
        description="Pousse les contacts CRM vers Google Contacts. Complète le CRM si besoin, supprime les doublons Google (même email/tél)."
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
                toast.error(`Connectez Google dans ${PARAMETRES_PATH.emailConnexion}.`);
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
          sont fusionnés automatiquement.
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
    </>
  );
}
