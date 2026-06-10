import { resolveNewsletterPreheader } from "@/lib/newsletter/newsletter-html";
import type { GeneratedNewsletterContent } from "@/lib/api/tauri-newsletter";
import { replaceTemplateVariables } from "@/lib/api/tauri-templates-email";

type NewsletterInboxPreviewProps = {
  subject: string;
  draft: GeneratedNewsletterContent;
  variables: Record<string, string>;
};

export function NewsletterInboxPreview({
  subject,
  draft,
  variables,
}: NewsletterInboxPreviewProps) {
  const subj = replaceTemplateVariables(subject.trim(), variables);
  const preheader = resolveNewsletterPreheader(draft);

  return (
    <div className="rounded-lg border bg-background p-3 space-y-1.5 text-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Aperçu boîte de réception
      </p>
      <p className="font-semibold text-foreground leading-snug truncate" title={subj}>
        {subj || "Objet de la newsletter"}
      </p>
      <p className="text-muted-foreground text-xs leading-snug line-clamp-2">
        {preheader || "Preheader (phrase complémentaire sous l'objet)"}
      </p>
    </div>
  );
}
