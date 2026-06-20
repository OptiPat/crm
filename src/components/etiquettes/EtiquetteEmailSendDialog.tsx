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
import { RichTextEmailEditor } from "@/components/emails/RichTextEmailEditor";
import { CheckCircle2 } from "lucide-react";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { ContactRegistreBadge } from "@/components/contacts/ContactRegistreSwitch";
import {
  isScpiBulletinContentMissing,
  renderEtiquetteEmailPreview,
} from "@/lib/etiquettes/etiquette-email-preview";
import { buildEditedHtmlEmailSendBodies } from "@/lib/etiquettes/etiquette-email-send-bodies";
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
  onSent?: (meta?: { subject: string; sentAtSec: number }) => void;
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
        if (preview.body_html?.trim()) {
          setHtmlMode(true);
          setBodyHtml(preview.body_html);
          setBodyPlain(preview.body);
        } else {
          setHtmlMode(false);
          setBodyPlain(preview.body);
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
  const sendBlocked = batchLocked || isEtiquetteEmailSendActive();

  const messageReady = htmlMode ? bodyHtml.trim().length > 0 : bodyPlain.trim().length > 0;

  const handleSend = () => {
    if (!item?.contact_email || !cgpConfig || !messageReady) return;
    if (batchLocked) {
      toast.warning("Cet envoi fait partie d'une salve en cours.");
      return;
    }
    if (isEtiquetteEmailSendActive()) {
      toast.warning("Un envoi est déjà en cours.");
      return;
    }

    const subjectTrim = subject.trim();
    let body: string;
    let body_html: string | null;

    if (htmlMode) {
      const built = buildEditedHtmlEmailSendBodies(bodyHtml, cgpConfig);
      body = built.body;
      body_html = built.body_html;
    } else {
      const preview = renderEtiquetteEmailPreview(
        { ...item, template_sujet: subjectTrim, template_corps: bodyPlain },
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
                Objet et message modifiables ci-dessous — la mise en forme est conservée à
                l&apos;envoi.
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

          {item && isScpiBulletinContentMissing(item) && (
            <p className="text-xs text-amber-800 dark:text-amber-200 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2">
              Résumé bulletins absent pour ce contact — relancez la préparation campagne n8n
              avant envoi.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor={htmlMode ? "confirm-body-html" : "confirm-body"}>Message</Label>
            {htmlMode ? (
              <RichTextEmailEditor
                value={bodyHtml}
                onChange={setBodyHtml}
                minHeight="min(50vh, 360px)"
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
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleSend}
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
