import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RichTextEmailEditor } from "@/components/emails/RichTextEmailEditor";
import { buildTutoiementTemplateNom } from "@/lib/emails/template-email-formality";
import { Users } from "lucide-react";
import type { RefObject } from "react";

export type TemplateTutoiementDraft = {
  enabled: boolean;
  sujet: string;
  corpsHtml: string;
};

type Props = {
  draft: TemplateTutoiementDraft;
  onChange: (next: TemplateTutoiementDraft) => void;
  onCorpsHtmlChange: (html: string) => void;
  editorElementRef?: RefObject<HTMLDivElement | null>;
  parentNom: string;
};

export function TemplateEmailTutoiementPanel({
  draft,
  onChange,
  onCorpsHtmlChange,
  editorElementRef,
  parentNom,
}: Props) {
  const patch = (partial: Partial<TemplateTutoiementDraft>) =>
    onChange({ ...draft, ...partial });

  const linkedNom = buildTutoiementTemplateNom(parentNom);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-violet-50/80 px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-900">
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Label htmlFor="tutoiement-enabled" className="text-sm font-medium">
              Variante tutoiement (modèle lié)
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Modèle principal = vouvoiement. Si le contact est en tutoiement sur sa fiche, ce
              texte est utilisé à l&apos;envoi ({linkedNom}).
            </p>
          </div>
        </div>
        <Switch
          id="tutoiement-enabled"
          checked={draft.enabled}
          onCheckedChange={(checked) => patch({ enabled: checked })}
        />
      </div>

      {!draft.enabled && (
        <p className="text-sm text-center text-muted-foreground py-6 border border-dashed rounded-lg">
          Sans variante liée — tous les contacts reçoivent le message vouvoiement ci-dessus.
        </p>
      )}

      {draft.enabled && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label htmlFor="tu-sujet">Objet (tu)</Label>
            <Input
              id="tu-sujet"
              value={draft.sujet}
              onChange={(e) => patch({ sujet: e.target.value })}
              placeholder="Ex. Un point sur ton dossier"
            />
          </div>
          <div className="space-y-2">
            <Label>Message (tu)</Label>
            <RichTextEmailEditor
              value={draft.corpsHtml}
              onChange={onCorpsHtmlChange}
              editorElementRef={editorElementRef}
              placeholder="Rédigez la version tutoiement (ton, te, tiens…)"
            />
          </div>
        </div>
      )}
    </div>
  );
}
