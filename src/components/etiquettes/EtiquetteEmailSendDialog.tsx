import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2 } from "lucide-react";
import { logEmailSendError } from "@/lib/api/tauri-email-send-log";
import {
  markEtiquetteEmailSent,
  type EtiquetteEmailQueueItem,
} from "@/lib/api/tauri-etiquettes";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { sendEmail } from "@/lib/api/tauri-email";
import { EMAIL_PREVIEW_HTML_CLASS } from "@/lib/emails/email-preview-html-styles";
import { setTemplateCorpsHtmlInMeta } from "@/lib/emails/template-email-html";
import { ContactRegistreBadge } from "@/components/contacts/ContactRegistreSwitch";
import { renderEtiquetteEmailPreview } from "@/lib/etiquettes/etiquette-email-preview";
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EtiquetteEmailSendDialogProps {
  item: EtiquetteEmailQueueItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
  cgpConfig?: CgpConfig | null;
}

export function EtiquetteEmailSendDialog({
  item,
  open,
  onOpenChange,
  onSent,
  cgpConfig: cgpConfigProp,
}: EtiquetteEmailSendDialogProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [initialBody, setInitialBody] = useState("");
  const [editPlain, setEditPlain] = useState(false);
  const [sending, setSending] = useState(false);
  const [cgpConfig, setCgpConfig] = useState<CgpConfig | null>(cgpConfigProp ?? null);

  useEffect(() => {
    if (!open || !item) return;
    let cancelled = false;
    void (async () => {
      try {
        const cgp = cgpConfigProp ?? (await getCgpConfig());
        if (cancelled) return;
        setCgpConfig(cgp);
        const preview = renderEtiquetteEmailPreview(item, cgp);
        setSubject(preview.subject);
        setBody(preview.body);
        setInitialBody(preview.body);
        setEditPlain(false);
      } catch (error) {
        console.error(error);
        toast.error("Impossible de préparer l'aperçu");
        onOpenChange(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, item, cgpConfigProp, onOpenChange]);

  const bodyEdited = body.trim() !== initialBody.trim();

  const sendPreview = useMemo(() => {
    if (!item || !cgpConfig) return null;
    return renderEtiquetteEmailPreview(
      {
        ...item,
        template_sujet: subject.trim(),
        template_corps: body,
        template_variables: bodyEdited
          ? setTemplateCorpsHtmlInMeta(item.template_variables, null)
          : item.template_variables,
      },
      cgpConfig
    );
  }, [item, cgpConfig, subject, body, bodyEdited]);

  const handleSend = async () => {
    if (!item?.contact_email || !sendPreview) return;
    setSending(true);
    try {
      const sent = await sendEmail({
        to_email: item.contact_email,
        to_name: `${item.contact_prenom} ${item.contact_nom}`,
        subject: subject.trim(),
        body: sendPreview.body,
        body_html: sendPreview.body_html,
      });
      try {
        await markEtiquetteEmailSent(
          item.contact_etiquette_id,
          sent.gmail_message_id,
          sent.gmail_thread_id,
          subject.trim(),
          sendPreview.body,
          item.queue_row_kind ?? "etiquette"
        );
      } catch (markError) {
        console.error(markError);
        toast.warning(
          "Email envoyé, mais l'enregistrement CRM a échoué — ne renvoyez pas sans vérifier la fiche."
        );
        onOpenChange(false);
        onSent?.();
        return;
      }
      toast.success(`Email envoyé à ${item.contact_prenom} ${item.contact_nom}`);
      notifyRelationChanged(item.contact_id);
      onOpenChange(false);
      onSent?.();
    } catch (error) {
      console.error("Error sending etiquette email:", error);
      const hint = error instanceof Error ? error.message : "Erreur lors de l'envoi";
      if (item) {
        await logEmailSendError({
          contactId: item.contact_id,
          contactEtiquetteId: item.contact_etiquette_id,
          etiquetteNom:
            item.queue_row_kind === "template" ? null : item.etiquette_nom,
          templateNom:
            item.queue_row_kind === "template" ? item.template_sujet : null,
          subject: subject.trim(),
          errorMessage: hint,
          sendMode: "individual",
        }).catch(() => {});
      }
      toast.error(hint.includes("connexion") ? hint : `${hint} (Paramètres → Email)`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmer l&apos;envoi</DialogTitle>
          <DialogDescription>
            {item && (
              <>
                À <strong>{item.contact_email}</strong> —{" "}
                <strong>{item.etiquette_nom}</strong>{" "}
                <ContactRegistreBadge registre={item.contact_registre} className="align-middle" />
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="confirm-subject">Objet</Label>
            <Input
              id="confirm-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {sendPreview?.body_html && !bodyEdited && (
            <div className="space-y-2">
              <Label>Message (aperçu HTML)</Label>
              <p className="text-xs text-primary font-medium">
                La version HTML sera envoyée (gras, listes, liens) — comme dans Gmail.
              </p>
              <div
                className={cn(
                  "rounded-lg border bg-white dark:bg-card p-3 max-h-64 overflow-y-auto",
                  EMAIL_PREVIEW_HTML_CLASS
                )}
                dangerouslySetInnerHTML={{ __html: sendPreview.body_html }}
              />
            </div>
          )}

          {sendPreview?.body_html && bodyEdited && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Vous avez modifié le texte brut : l&apos;envoi sera en <strong>texte seul</strong>{" "}
              (sans mise en forme HTML).
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="confirm-body">
                {sendPreview?.body_html && !editPlain
                  ? "Modifier le texte (optionnel)"
                  : "Message"}
              </Label>
              {sendPreview?.body_html && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setEditPlain((v) => !v)}
                >
                  {editPlain ? "Masquer l'éditeur" : "Modifier le texte brut"}
                </Button>
              )}
            </div>
            {(editPlain || !sendPreview?.body_html) && (
              <Textarea
                id="confirm-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Annuler
          </Button>
          <Button
            onClick={() => void handleSend()}
            disabled={sending || !subject.trim() || !body.trim() || !item?.contact_email}
          >
            {sending ? (
              "Envoi..."
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Envoyer maintenant
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
