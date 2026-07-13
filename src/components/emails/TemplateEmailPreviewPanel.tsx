import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import type { Contact } from "@/lib/api/tauri-contacts";
import { setTemplateCorpsHtmlInMeta } from "@/lib/emails/template-email-html";
import {
  isContactTu,
  normalizeContactRegistre,
  pickTemplateContentForRegistre,
  type ContactRegistre,
} from "@/lib/emails/template-email-formality";
import {
  renderTemplatePreview,
  SAMPLE_PREVIEW_CONTACT,
} from "@/lib/emails/template-email-meta";
import { sendTemplateTestToSelf } from "@/lib/emails/template-email-test-send";
import {
  formatAttachmentSize,
  parseTemplateEmailAttachments,
} from "@/lib/emails/template-email-attachments";
import { EMAIL_PREVIEW_HTML_CLASS } from "@/lib/emails/email-preview-html-styles";
import { cn } from "@/lib/utils";
import { Loader2, Mail, Paperclip } from "lucide-react";
import { toast } from "sonner";

type TemplateEmailPreviewPanelProps = {
  sujet: string;
  corps: string;
  cgp: CgpConfig | null;
  agendaLinkId?: string | null;
  templateVariables?: string | null;
  templateNom?: string | null;
  /** HTML live de l’éditeur (évite le décalage avec `variables` JSON). */
  corpsHtml?: string | null;
  contact?: Pick<Contact, "prenom" | "nom" | "email" | "telephone" | "registre"> | null;
  /** Variante tutoiement liée (si activée). */
  tutoiement?: { sujet: string; corps: string; corpsHtml?: string | null } | null;
  /** Aperçu forcé tu/vous (sans contact réel). */
  previewRegistre?: ContactRegistre;
  label?: string;
  /** Bouton « M’envoyer un test » (compte OAuth Paramètres → Emails & envois → Connexion). */
  allowSendTest?: boolean;
};

export function TemplateEmailPreviewPanel({
  sujet,
  corps,
  cgp,
  agendaLinkId,
  templateVariables,
  templateNom,
  corpsHtml,
  contact,
  tutoiement,
  previewRegistre,
  label = "Aperçu (exemple)",
  allowSendTest = false,
}: TemplateEmailPreviewPanelProps) {
  const [sendingTest, setSendingTest] = useState(false);

  const sample = useMemo(
    () =>
      contact
        ? {
            prenom: contact.prenom ?? "",
            nom: contact.nom ?? "",
            email: contact.email ?? "",
            telephone: contact.telephone ?? "",
          }
        : SAMPLE_PREVIEW_CONTACT,
    [contact]
  );

  const mergedVariables = useMemo(
    () => setTemplateCorpsHtmlInMeta(templateVariables, corpsHtml?.trim() || null),
    [templateVariables, corpsHtml]
  );

  const previewAttachments = useMemo(
    () => parseTemplateEmailAttachments(mergedVariables),
    [mergedVariables]
  );

  const effective = useMemo(
    () =>
      pickTemplateContentForRegistre(
        { sujet, corps },
        tutoiement ?? null,
        contact?.registre ?? previewRegistre
      ),
    [sujet, corps, tutoiement, contact?.registre, previewRegistre]
  );

  const useTuVariant = isContactTu(contact?.registre ?? previewRegistre);
  const effectiveHtml =
    useTuVariant && tutoiement?.corpsHtml?.trim() ? tutoiement.corpsHtml : corpsHtml;

  const previewRegistreEffective: ContactRegistre = normalizeContactRegistre(
    contact?.registre ?? previewRegistre
  );

  const preview = useMemo(
    () =>
      renderTemplatePreview(
        effective.sujet,
        effective.corps,
        sample,
        cgp,
        agendaLinkId,
        mergedVariables,
        effectiveHtml,
        { templateNom, registre: previewRegistreEffective }
      ),
    [
      effective.sujet,
      effective.corps,
      sample,
      cgp,
      agendaLinkId,
      mergedVariables,
      effectiveHtml,
      templateNom,
      previewRegistreEffective,
    ]
  );

  const handleSendTest = async () => {
    if (!effective.sujet.trim() || !effective.corps.trim()) {
      toast.error("Renseignez au moins l'objet et le message avant le test");
      return;
    }
    setSendingTest(true);
    try {
      const testVariables = setTemplateCorpsHtmlInMeta(
        templateVariables,
        effectiveHtml?.trim() || null
      );
      const to = await sendTemplateTestToSelf({
        sujet: effective.sujet,
        corps: effective.corps,
        corpsHtml: effectiveHtml,
        templateVariables: testVariables,
        agendaLinkId,
        cgp,
        contact: sample,
        templateNom,
        registre: previewRegistreEffective,
      });
      toast.success(
        preview.body_html
          ? `Email de test envoyé à ${to} (version HTML, comme dans Gmail)`
          : `Email de test envoyé à ${to}`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi du test impossible");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-2">
      {label ? <p className="text-sm font-medium">{label}</p> : null}
      {contact && (
        <p className="text-xs text-muted-foreground">
          Contact : {contact.prenom} {contact.nom}
          {contact.email ? ` — ${contact.email}` : ""}
        </p>
      )}
      <div className="p-4 border rounded-lg bg-white dark:bg-card space-y-2 shadow-sm">
        <p className="text-sm">
          <strong>Objet :</strong> {preview.subject || "(vide)"}
        </p>
        {previewAttachments.length > 0 ? (
          <div className="text-xs text-muted-foreground border-t pt-2 space-y-1">
            <p className="font-medium text-foreground flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              {previewAttachments.length}{" "}
              {previewAttachments.length > 1 ? "pièces jointes" : "pièce jointe"}
            </p>
            <ul className="space-y-0.5">
              {previewAttachments.map((att) => (
                <li key={att.id} className="truncate">
                  {att.filename} ({formatAttachmentSize(att.size_bytes)})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {preview.body_html ? (
          <div
            className={cn("border-t pt-3", EMAIL_PREVIEW_HTML_CLASS)}
            dangerouslySetInnerHTML={{ __html: preview.body_html }}
          />
        ) : (
          <div className="text-sm whitespace-pre-wrap border-t pt-2 text-muted-foreground">
            {preview.body || "(vide)"}
          </div>
        )}
        {preview.body_html && (
          <p className="text-[10px] text-muted-foreground border-t pt-2">
            Rendu HTML (gras, listes, liens) — identique à l&apos;envoi Gmail si vous n&apos;éditez
            pas le texte au moment de l&apos;envoi.
          </p>
        )}
      </div>
      {allowSendTest && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={sendingTest}
          onClick={() => void handleSendTest()}
        >
          {sendingTest ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Mail className="h-4 w-4 mr-2" />
          )}
          M&apos;envoyer un test
        </Button>
      )}
    </div>
  );
}
