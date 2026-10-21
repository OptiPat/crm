import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RichTextEmailEditor } from "@/components/emails/RichTextEmailEditor";
import { UnknownVariablesWarning } from "@/components/emails/UnknownVariablesWarning";
import { TemplateEmailAttachmentsPanel } from "@/components/emails/TemplateEmailAttachmentsPanel";
import { buildTutoiementTemplateNom } from "@/lib/emails/template-email-formality";
import type { TemplateEmailAttachmentMeta } from "@/lib/emails/template-email-attachments";
import { Copy, Users } from "lucide-react";
import type { RefObject, ReactNode } from "react";

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
  templateId?: number | null;
  attachments?: TemplateEmailAttachmentMeta[];
  onAttachmentsChange?: (attachments: TemplateEmailAttachmentMeta[]) => void;
  attachmentsDisabled?: boolean;
  variablePicker?: ReactNode;
  sujetInputRef?: RefObject<HTMLInputElement | null>;
  onSujetSelectionCapture?: () => void;
  onEditorSelectionSave?: (range: Range | null) => void;
  /** Recopie l'objet et le message vouvoiement dans la version tu (à adapter ensuite). */
  onCopyFromVous?: () => void;
  /** Version tu existante pas encore chargée (ou illisible) : recopie interdite. */
  copyFromVousLocked?: boolean;
};

/** La version tu a du contenu (texte ou image) : jamais écrasée sans confirmation. */
function hasText(html: string): boolean {
  if (/<img\b/i.test(html)) return true;
  return (
    html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/\u00a0/g, " ")
      .trim().length > 0
  );
}

export function TemplateEmailTutoiementPanel({
  draft,
  onChange,
  onCorpsHtmlChange,
  editorElementRef,
  parentNom,
  templateId = null,
  attachments = [],
  onAttachmentsChange,
  attachmentsDisabled = false,
  variablePicker,
  sujetInputRef,
  onSujetSelectionCapture,
  onEditorSelectionSave,
  onCopyFromVous,
  copyFromVousLocked = false,
}: Props) {
  const [confirmCopyOpen, setConfirmCopyOpen] = useState(false);
  const tuIsEmpty = !draft.sujet.trim() && !hasText(draft.corpsHtml);
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
          onCheckedChange={(checked) => {
            patch({ enabled: checked });
            // Première activation : on part du texte vouvoiement plutôt que d'une page blanche.
            if (checked && tuIsEmpty && !copyFromVousLocked) onCopyFromVous?.();
          }}
        />
      </div>

      {!draft.enabled && (
        <p className="text-sm text-center text-muted-foreground py-6 border border-dashed rounded-lg">
          Sans variante liée — tous les contacts reçoivent le message vouvoiement ci-dessus.
        </p>
      )}

      {draft.enabled && (
        <div className="space-y-4 rounded-lg border p-4">
          {onCopyFromVous && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-violet-50/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Partez du texte vouvoiement, puis remplacez « vous » par « tu ».
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                data-no-dirty
                disabled={copyFromVousLocked}
                onClick={() => (tuIsEmpty ? onCopyFromVous() : setConfirmCopyOpen(true))}
              >
                <Copy className="h-3.5 w-3.5" />
                Recopier le texte vouvoiement
              </Button>
            </div>
          )}
          {variablePicker}
          <div className="space-y-2">
            <Label htmlFor="tu-sujet">Objet (tu)</Label>
            <Input
              id="tu-sujet"
              ref={sujetInputRef}
              value={draft.sujet}
              onChange={(e) => patch({ sujet: e.target.value })}
              onFocus={onSujetSelectionCapture}
              onClick={onSujetSelectionCapture}
              onKeyUp={onSujetSelectionCapture}
              onBlur={onSujetSelectionCapture}
              placeholder="Ex. Un point sur ton dossier"
            />
          </div>
          <div className="space-y-2">
            <Label>Message (tu)</Label>
            <RichTextEmailEditor
              value={draft.corpsHtml}
              onChange={onCorpsHtmlChange}
              editorElementRef={editorElementRef}
              onSelectionSave={onEditorSelectionSave}
              placeholder="Rédigez la version tutoiement (ton, te, tiens…)"
            />
            <UnknownVariablesWarning texts={[draft.sujet, draft.corpsHtml]} />
          </div>
          {onAttachmentsChange && (
            <TemplateEmailAttachmentsPanel
              templateId={templateId}
              attachments={attachments}
              onChange={onAttachmentsChange}
              disabled={attachmentsDisabled}
              inheritHint="Sans pièce jointe ici, celles du message vouvoiement sont envoyées."
            />
          )}
        </div>
      )}

      <AlertDialog open={confirmCopyOpen} onOpenChange={setConfirmCopyOpen}>
        <AlertDialogContent data-no-dirty>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer la version tu ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;objet et le message tu actuels seront remplacés par ceux du vouvoiement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder la version tu</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmCopyOpen(false);
                onCopyFromVous?.();
              }}
            >
              Remplacer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
