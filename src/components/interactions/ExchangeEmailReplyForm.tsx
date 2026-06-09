import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { importCampaignReplyFromGmail, sendEmail } from "@/lib/api/tauri-email";
import { dismissEmailCampaignFollowup } from "@/lib/api/tauri-etiquettes";
import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";
import { getSentSubjectLabel } from "@/lib/interactions/exchange-history-display";
import { buildSendEmailBodies } from "@/lib/emails/email-signature";
import { exchangeContactName } from "@/lib/interactions/exchange-history-display";
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";
import { Loader2, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function defaultReplySubject(entry: ExchangeHistoryEntry): string {
  const base = getSentSubjectLabel(entry);
  if (!base) return "Re: votre message";
  return base.toLowerCase().startsWith("re:") ? base : `Re: ${base}`;
}

export function ExchangeEmailReplyForm({
  entry,
  onSent,
}: {
  entry: ExchangeHistoryEntry;
  onSent?: () => void;
}) {
  const [subject, setSubject] = useState(() => defaultReplySubject(entry));
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setSubject(defaultReplySubject(entry));
    setBody("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- réinitialise sur changement d'entrée, pas à chaque rendu (évite d'effacer la saisie)
  }, [entry.contact_id, entry.contact_etiquette_id]);

  const contactEmail = entry.contact_email?.trim();
  const canSend = Boolean(contactEmail);

  const handleImportReply = async () => {
    if (entry.contact_etiquette_id == null) {
      toast.error("Impossible d'importer : envoi campagne introuvable.");
      return;
    }
    setImporting(true);
    try {
      await importCampaignReplyFromGmail(entry.contact_etiquette_id);
      onSent?.();
      toast.success("Réponse importée depuis Gmail");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
    }
  };

  const handleSend = async () => {
    if (!contactEmail) {
      toast.error("Email du contact manquant sur la fiche.");
      return;
    }
    if (!body.trim()) {
      toast.error("Écrivez un message avant d'envoyer.");
      return;
    }
    setSending(true);
    try {
      const cgp = await getCgpConfig();
      const { body: plainBody, body_html } = buildSendEmailBodies(body, cgp);
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
      });
      // Réponse libre CGP : on n'attend plus une réponse au template initial.
      if (entry.contact_etiquette_id != null) {
        await dismissEmailCampaignFollowup(entry.contact_etiquette_id);
        notifyRelationChanged(entry.contact_id);
      }
      toast.success(`Réponse envoyée à ${entry.contact_prenom} ${entry.contact_nom}`);
      setBody("");
      onSent?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-3 border-t border-border/60 pt-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Répondre depuis le CRM
      </p>
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
      <div className="space-y-2">
        <Label htmlFor="reply-body">Votre message</Label>
        <Textarea
          id="reply-body"
          className="min-h-[120px]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Réponse au client…"
          disabled={!canSend || sending}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="gap-1"
          disabled={!canSend || sending}
          onClick={() => void handleSend()}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
          Envoyer la réponse
        </Button>
        {entry.contact_etiquette_id != null && (
          <Button
            type="button"
            variant="outline"
            className="gap-1"
            disabled={importing}
            onClick={() => void handleImportReply()}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Importer la réponse Gmail
          </Button>
        )}
      </div>
    </section>
  );
}
