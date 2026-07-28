import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { FileImage, FileSignature, Loader2, Sparkles } from "lucide-react";
import { fetchGmailSignatureForCgp, getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  pickAndImportOutlookSignatureFile,
  pickAndImportSignatureImage,
} from "@/lib/emails/email-signature-import";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import { PARAMETRES_PATH } from "@/lib/settings/parametres-labels";
import { toast } from "sonner";

type ParametresEmailSignatureSectionProps = {
  cgpConfig: CgpConfig;
  onConfigChange: (patch: Partial<CgpConfig>) => void;
};

export function ParametresEmailSignatureSection({
  cgpConfig,
  onConfigChange,
}: ParametresEmailSignatureSectionProps) {
  const [importingSignature, setImportingSignature] = useState(false);

  const applyImportedSignature = (sig: { plain: string; html: string }) => {
    onConfigChange({
      email_signature: sig.plain,
      email_signature_html: sig.html,
    });
    toast.success("Signature importée — enregistrez vos modifications.");
  };

  const handleImportGmailSignature = async () => {
    setImportingSignature(true);
    try {
      const status = await getEmailConnectionStatus();
      if (status.provider !== "google" || !status.connected) {
        toast.error(`Connectez Google dans ${PARAMETRES_PATH.emailConnexion}.`);
        return;
      }
      const sig = await fetchGmailSignatureForCgp();
      applyImportedSignature(sig);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import signature impossible");
    } finally {
      setImportingSignature(false);
    }
  };

  const handleImportSignatureImage = async () => {
    setImportingSignature(true);
    try {
      const sig = await pickAndImportSignatureImage();
      if (!sig) return;
      applyImportedSignature(sig);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import image impossible");
    } finally {
      setImportingSignature(false);
    }
  };

  const handleImportOutlookFile = async () => {
    setImportingSignature(true);
    try {
      const sig = await pickAndImportOutlookSignatureFile();
      if (!sig) return;
      applyImportedSignature(sig);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import Outlook impossible");
    } finally {
      setImportingSignature(false);
    }
  };

  const hasHtmlPreview = Boolean(cgpConfig.email_signature_html?.trim());

  return (
    <SettingsPanel
      title="Signature des emails"
      description="Ajoutée en fin de chaque envoi depuis Suivi. Outlook : importez l'image ou le fichier .htm."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={importingSignature}
            onClick={() => void handleImportSignatureImage()}
          >
            {importingSignature ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <FileImage className="h-4 w-4 mr-1.5" />
                Importer image
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={importingSignature}
            onClick={() => void handleImportOutlookFile()}
          >
            {importingSignature ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <FileSignature className="h-4 w-4 mr-1.5" />
                Fichier Outlook
              </>
            )}
          </Button>
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
        </div>
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
            Signature image : « Importer image » (enregistrez l&apos;image depuis Outlook) ou « Fichier
            Outlook » (.htm). Modifier le texte après import efface le logo — réimportez si besoin.
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
  );
}
