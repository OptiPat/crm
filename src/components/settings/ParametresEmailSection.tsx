import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { FileSignature, Loader2, Sparkles } from "lucide-react";
import { fetchGmailSignatureForCgp, getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { EmailOAuthConnect } from "@/components/emails/EmailOAuthConnect";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import { toast } from "sonner";

type ParametresEmailSectionProps = {
  cgpConfig: CgpConfig;
  onConfigChange: (patch: Partial<CgpConfig>) => void;
};

export function ParametresEmailSection({ cgpConfig, onConfigChange }: ParametresEmailSectionProps) {
  const [importingSignature, setImportingSignature] = useState(false);

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

  return (
    <div className="space-y-6">
      <EmailOAuthConnect variant="embedded" />

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
