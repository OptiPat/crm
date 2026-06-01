import { useEffect, useState } from "react";
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
import {
  markEtiquetteEmailSent,
  type EtiquetteEmailQueueItem,
} from "@/lib/api/tauri-etiquettes";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { sendEmail } from "@/lib/api/tauri-email";
import { renderEtiquetteEmailPreview } from "@/lib/etiquettes/etiquette-email-preview";
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";
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

  const handleSend = async () => {
    if (!item?.contact_email) return;
    setSending(true);
    try {
      const cgp = cgpConfig ?? (await getCgpConfig());
      const preview = renderEtiquetteEmailPreview(
        { ...item, template_sujet: subject.trim(), template_corps: body },
        cgp
      );
      const sent = await sendEmail({
        to_email: item.contact_email,
        to_name: `${item.contact_prenom} ${item.contact_nom}`,
        subject: subject.trim(),
        body: preview.body,
        body_html: preview.body_html,
      });
      try {
        await markEtiquetteEmailSent(
          item.contact_etiquette_id,
          sent.gmail_message_id,
          sent.gmail_thread_id,
          subject.trim(),
          preview.body
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
                À <strong>{item.contact_email}</strong> — étiquette{" "}
                <strong>{item.etiquette_nom}</strong>
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
          <div className="space-y-2">
            <Label htmlFor="confirm-body">Message</Label>
            <Textarea
              id="confirm-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
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
