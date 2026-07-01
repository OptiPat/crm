import { FileSignature } from "lucide-react";
import { Label } from "@/components/ui/label";

type CgpEmailSignaturePreviewProps = {
  html?: string | null;
  plain?: string | null;
};

/** Aperçu fidèle de la signature Paramètres (HTML Gmail importé ou texte brut). */
export function CgpEmailSignaturePreview({ html, plain }: CgpEmailSignaturePreviewProps) {
  const htmlTrim = html?.trim();
  const plainTrim = plain?.trim();
  if (!htmlTrim && !plainTrim) return null;

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
        <FileSignature className="h-4 w-4" />
        Signature (ajoutée à l&apos;envoi)
      </Label>
      <div className="rounded-xl border bg-white p-4 shadow-inner text-sm">
        {htmlTrim ? (
          <div
            className="prose prose-sm max-w-none text-foreground"
            dangerouslySetInnerHTML={{ __html: htmlTrim }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm text-foreground m-0">
            {plainTrim}
          </pre>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Identique à Paramètres → Email. Seul le message ci-dessus est modifiable.
      </p>
    </div>
  );
}
