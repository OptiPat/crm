import { useEffect, useRef, useState } from "react";
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
import { RichTextEmailEditor } from "@/components/emails/RichTextEmailEditor";
import { CgpEmailSignaturePreview } from "@/components/emails/CgpEmailSignaturePreview";
import { EmailAttachmentsPreviewList } from "@/components/emails/EmailAttachmentsPreviewList";
import { CheckCircle2 } from "lucide-react";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { ContactRegistreBadge } from "@/components/contacts/ContactRegistreSwitch";
import {
  getCampaignTemplateSendBlockReason,
  renderEtiquetteEmailPreview,
} from "@/lib/etiquettes/etiquette-email-preview";
import { buildEditedHtmlEmailSendBodies } from "@/lib/etiquettes/etiquette-email-send-bodies";
import { readRichTextEditorHtml } from "@/components/emails/rich-text-email-editor-utils";
import { stripPlainBodyEmailSignature } from "@/lib/emails/email-signature";
import { extractMessageHtmlWithoutSignature } from "@/lib/emails/template-email-html";
import {
  isEtiquetteEmailSendActive,
  isEtiquetteQueueItemBatchLocked,
  startIndividualEtiquetteEmailSend,
} from "@/lib/etiquettes/etiquette-email-send-runner";
import { toast } from "sonner";

interface EtiquetteEmailSendDialogProps {
  item: EtiquetteEmailQueueItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: (meta?: {
    subject: string;
    sentAtSec: number;
    gmailMessageId?: string | null;
    gmailThreadId?: string | null;
  }) => void;
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
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyPlain, setBodyPlain] = useState("");
  const [htmlMode, setHtmlMode] = useState(true);
  const [cgpConfig, setCgpConfig] = useState<CgpConfig | null>(cgpConfigProp ?? null);
  const editorElementRef = useRef<HTMLDivElement>(null);
  const bodyDirtyRef = useRef(false);

  useEffect(() => {
    if (!open || !item) return;
    let cancelled = false;
    bodyDirtyRef.current = false;
    void (async () => {
      try {
        const cgp = cgpConfigProp ?? (await getCgpConfig());
        if (cancelled) return;
        setCgpConfig(cgp);
        const preview = renderEtiquetteEmailPreview(item, cgp);
        setSubject(preview.subject);
        if (preview.body_html?.trim()) {
          setHtmlMode(true);
          setBodyHtml(extractMessageHtmlWithoutSignature(preview.body_html, cgp));
          setBodyPlain(stripPlainBodyEmailSignature(preview.body, cgp.email_signature));
        } else {
          setHtmlMode(false);
          setBodyPlain(stripPlainBodyEmailSignature(preview.body, cgp.email_signature));
          setBodyHtml("");
        }
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

  const batchLocked =
    item != null && isEtiquetteQueueItemBatchLocked(item);
  const scpiSendBlockReason =
    item != null ? getCampaignTemplateSendBlockReason(item) : null;
  const sendBlocked =
    batchLocked || isEtiquetteEmailSendActive() || scpiSendBlockReason != null;

  const messageReady = htmlMode ? bodyHtml.trim().length > 0 : bodyPlain.trim().length > 0;

  const handleSend = () => {
    if (!item?.contact_email || !cgpConfig) return;
    if (batchLocked) {
      toast.warning("Cet envoi fait partie d'une salve en cours.");
      return;
    }
    if (isEtiquetteEmailSendActive()) {
      toast.warning("Un envoi est déjà en cours.");
      return;
    }
    if (scpiSendBlockReason) {
      toast.warning(scpiSendBlockReason);
      return;
    }

    const subjectTrim = subject.trim();
    let body: string;
    let body_html: string | null;

    if (htmlMode) {
      if (!bodyDirtyRef.current) {
        const preview = renderEtiquetteEmailPreview(
          { ...item, template_sujet: subjectTrim },
          cgpConfig
        );
        body = preview.body;
        body_html = preview.body_html;
      } else {
        const el = editorElementRef.current;
        const htmlSource =
          readRichTextEditorHtml(el).trim() || bodyHtml.trim();
        const visibleText = (el?.textContent ?? "").replace(/\u00a0/g, " ").trim();
        if (!htmlSource && visibleText) {
          toast.error(
            "Impossible de lire le message édité — cliquez dans le texte puis réessayez."
          );
          return;
        }
        if (!htmlSource) {
          toast.error("Le message est vide — vérifiez le contenu avant d'envoyer.");
          return;
        }
        const built = buildEditedHtmlEmailSendBodies(htmlSource, cgpConfig);
        body = built.body;
        body_html = built.body_html;
      }
      if (!body.trim() && !(body_html?.trim())) {
        toast.error("Le message est vide après préparation — réessayez ou rouvrez la fenêtre.");
        return;
      }
    } else {
      const plainSource = bodyPlain.trim();
      if (!plainSource) {
        toast.error("Le message est vide.");
        return;
      }
      const preview = renderEtiquetteEmailPreview(
        { ...item, template_sujet: subjectTrim, template_corps: plainSource },
        cgpConfig
      );
      body = preview.body;
      body_html = preview.body_html;
    }

    const itemSnapshot = item;
    onOpenChange(false);
    toast.info(
      `Envoi en arrière-plan — ${item.contact_prenom} ${item.contact_nom}. Vous pouvez continuer à utiliser le CRM.`
    );

    try {
      startIndividualEtiquetteEmailSend({
        item: itemSnapshot,
        subject: subjectTrim,
        body,
        body_html,
        onSent: (meta) => onSent?.(meta),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur envoi");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmer l&apos;envoi</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1 text-sm text-muted-foreground">
              {item && (
                <p>
                  À <strong className="text-foreground">{item.contact_email}</strong> —{" "}
                  <strong className="text-foreground">{item.etiquette_nom}</strong>{" "}
                  <ContactRegistreBadge registre={item.contact_registre} className="align-middle" />
                </p>
              )}
              <p className="text-xs">
                Objet et message modifiables ci-dessous — la signature est affichée séparément et
                conservée telle qu&apos;en Paramètres.
              </p>
            </div>
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

          {scpiSendBlockReason ? (
            <p className="text-xs text-amber-800 dark:text-amber-200 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2">
              {scpiSendBlockReason}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={htmlMode ? "confirm-body-html" : "confirm-body"}>Message</Label>
            {htmlMode ? (
              <RichTextEmailEditor
                editorElementRef={editorElementRef}
                value={bodyHtml}
                onChange={(html, meta) => {
                  if (meta?.edited) bodyDirtyRef.current = true;
                  setBodyHtml(html);
                }}
                minHeight="9rem"
                showFooter={false}
                ariaLabel="Message à envoyer"
              />
            ) : (
              <Textarea
                id="confirm-body"
                value={bodyPlain}
                onChange={(e) => setBodyPlain(e.target.value)}
                rows={12}
                className="text-sm leading-relaxed"
              />
            )}
            {htmlMode ? (
              <p className="text-[11px] text-muted-foreground">
                Gras, listes et liens : modifiables directement — rendu identique à Gmail.
              </p>
            ) : null}
          </div>

          {item ? (
            <EmailAttachmentsPreviewList variables={item.template_variables} />
          ) : null}

          <CgpEmailSignaturePreview
            html={cgpConfig?.email_signature_html}
            plain={
              cgpConfig?.email_signature_html?.trim()
                ? null
                : cgpConfig?.email_signature
            }
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleSend}
            onMouseDown={(e) => e.preventDefault()}
            disabled={sendBlocked || !subject.trim() || !messageReady || !item?.contact_email}
          >
            <>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Envoyer maintenant
            </>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
