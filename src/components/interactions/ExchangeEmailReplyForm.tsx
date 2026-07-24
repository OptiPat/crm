import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEmailEditor } from "@/components/emails/RichTextEmailEditor";
import { readRichTextEditorHtml } from "@/components/emails/rich-text-email-editor-utils";
import { SendFromSelector } from "@/components/team/SendFromSelector";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { sendEmail } from "@/lib/api/tauri-email";
import { dismissEmailCampaignFollowup } from "@/lib/api/tauri-etiquettes";
import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";
import { defaultCampaignReplySubject } from "@/lib/emails/campaign-email-reply";
import { buildEditedHtmlEmailSendBodies } from "@/lib/etiquettes/etiquette-email-send-bodies";
import { exchangeContactName } from "@/lib/interactions/exchange-history-display";
import { htmlToPlainEmail } from "@/lib/emails/template-email-html";
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

export function ExchangeEmailReplyForm({
  entry,
  queueRowKind = "etiquette",
  compact = false,
  onSent,
}: {
  entry: ExchangeHistoryEntry;
  queueRowKind?: string;
  compact?: boolean;
  onSent?: () => void;
}) {
  const [subject, setSubject] = useState(() => defaultCampaignReplySubject(entry));
  const [bodyHtml, setBodyHtml] = useState("");
  const [cgpConfig, setCgpConfig] = useState<CgpConfig | null>(null);
  const [sending, setSending] = useState(false);
  const [senderEmail, setSenderEmail] = useState<string | null>(null);
  const editorElementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSubject(defaultCampaignReplySubject(entry));
    setBodyHtml("");
    void getCgpConfig()
      .then(setCgpConfig)
      .catch(() => setCgpConfig(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- réinitialise sur changement d'entrée
  }, [entry.contact_id, entry.contact_etiquette_id, entry.sent_subject, entry.template_sujet]);

  const contactEmail = entry.contact_email?.trim();
  const canSend = Boolean(contactEmail);
  const messageReady = htmlToPlainEmail(bodyHtml).trim().length > 0;

  const handleSend = async () => {
    if (!contactEmail) {
      toast.error("Email du contact manquant sur la fiche.");
      return;
    }
    if (!messageReady) {
      toast.error("Écrivez un message avant d'envoyer.");
      return;
    }
    setSending(true);
    try {
      const cgp = cgpConfig ?? (await getCgpConfig());
      const htmlSource =
        readRichTextEditorHtml(editorElementRef.current).trim() || bodyHtml.trim();
      if (!htmlSource) {
        toast.error("Écrivez un message avant d'envoyer.");
        return;
      }
      const { body: plainBody, body_html } = buildEditedHtmlEmailSendBodies(htmlSource, cgp);
      await sendEmail({
        to_email: contactEmail,
        to_name: exchangeContactName(entry),
        subject: subject.trim(),
        body: plainBody,
        body_html,
        thread_id: entry.email_gmail_thread_id ?? null,
        in_reply_to_message_id:
          entry.email_reponse_gmail_message_id ??
          entry.email_gmail_message_id ??
          null,
        sender_email: senderEmail,
        audit_contact_id: entry.contact_id,
      });
      if (entry.contact_etiquette_id != null) {
        await dismissEmailCampaignFollowup(entry.contact_etiquette_id, queueRowKind);
        notifyRelationChanged(entry.contact_id);
      }
      toast.success(`Réponse envoyée à ${entry.contact_prenom} ${entry.contact_nom}`);
      setBodyHtml("");
      onSent?.();
    } catch (error) {
      const hint = error instanceof Error ? error.message : String(error);
      toast.error(
        hint.includes("connexion") || hint.includes("Google") ? hint : `${hint} (Paramètres → Emails & envois → Connexion)`
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={compact ? "space-y-3" : "space-y-3 border-t border-border/60 pt-4"}>
      {!compact && (
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Répondre depuis le CRM
        </p>
      )}
      {!canSend && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Ajoutez un email sur la fiche contact pour répondre depuis le CRM.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="reply-subject">Objet</Label>
        <Input
          id="reply-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={!canSend || sending}
        />
      </div>
      <SendFromSelector
        value={senderEmail}
        onChange={setSenderEmail}
        disabled={!canSend || sending}
      />
      <div className="space-y-2">
        <Label htmlFor="reply-body-html">Votre message</Label>
        <RichTextEmailEditor
          editorElementRef={editorElementRef}
          value={bodyHtml}
          onChange={setBodyHtml}
          minHeight="min(40vh, 280px)"
          showFooter={false}
          placeholder="Réponse au client…"
          ariaLabel="Réponse au client"
        />
        <p className="text-[11px] text-muted-foreground">
          Gras, listes et liens — rendu identique à Gmail. La signature est ajoutée à l&apos;envoi.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="gap-1"
          disabled={!canSend || sending || !subject.trim() || !messageReady}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void handleSend()}
        >
          <span className="inline-flex items-center gap-1">
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Envoyer la réponse
          </span>
        </Button>
      </div>
    </section>
  );
}
