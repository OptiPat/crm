import type { CgpConfig } from "@/lib/api/tauri-settings";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  renderTemplatePreview,
  SAMPLE_PREVIEW_CONTACT,
} from "@/lib/emails/template-email-meta";

type TemplateEmailPreviewPanelProps = {
  sujet: string;
  corps: string;
  cgp: CgpConfig | null;
  contact?: Pick<Contact, "prenom" | "nom" | "email" | "telephone"> | null;
  label?: string;
};

export function TemplateEmailPreviewPanel({
  sujet,
  corps,
  cgp,
  contact,
  label = "Aperçu (exemple)",
}: TemplateEmailPreviewPanelProps) {
  const sample = contact ?? SAMPLE_PREVIEW_CONTACT;
  const preview = renderTemplatePreview(sujet, corps, sample, cgp);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {contact && (
        <p className="text-xs text-muted-foreground">
          Contact : {contact.prenom} {contact.nom}
          {contact.email ? ` — ${contact.email}` : ""}
        </p>
      )}
      <div className="p-4 border rounded-lg bg-muted/50 space-y-2">
        <p className="text-sm">
          <strong>Objet :</strong> {preview.subject || "(vide)"}
        </p>
        <div className="text-sm whitespace-pre-wrap border-t pt-2">
          {preview.body || "(vide)"}
        </div>
      </div>
    </div>
  );
}
