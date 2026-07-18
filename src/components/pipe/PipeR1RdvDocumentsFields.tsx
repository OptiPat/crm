import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { buildR1ChecklistEmailVariablesFromProfile } from "@/lib/pipe/pipe-r1-checklist-email-vars";
import { buildR1ChecklistEmailPreviewDocument } from "@/lib/pipe/pipe-checklist-email-list";
import type { PipeChecklistTemplates, R1ChecklistProfile } from "@/lib/pipe/pipe-checklist-template";

interface PipeR1RdvDocumentsFieldsProps {
  profile: R1ChecklistProfile;
  templates: PipeChecklistTemplates | null;
  onProfileChange: (profile: R1ChecklistProfile) => void;
  disabled?: boolean;
}

function ProfileToggle({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
      />
      <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
        {label}
      </Label>
    </div>
  );
}

function R1ChecklistHtmlPreview({ html }: { html: string }) {
  const srcDoc = useMemo(() => buildR1ChecklistEmailPreviewDocument(html), [html]);
  if (!srcDoc) return null;

  return (
    <iframe
      title="Aperçu HTML liste documents R1"
      srcDoc={srcDoc}
      sandbox=""
      className="w-full border-0 bg-transparent block min-h-[4rem]"
      onLoad={(event) => {
        const frame = event.currentTarget;
        const height = frame.contentDocument?.documentElement?.scrollHeight;
        if (height && height > 0) {
          frame.style.height = `${height}px`;
        }
      }}
    />
  );
}

export function PipeR1RdvDocumentsFields({
  profile,
  templates,
  onProfileChange,
  disabled = false,
}: PipeR1RdvDocumentsFieldsProps) {
  const previewHtml = useMemo(() => {
    if (!templates) return null;
    return buildR1ChecklistEmailVariablesFromProfile(templates, profile).liste_documents_r1_html;
  }, [profile, templates]);

  const patchProfile = (patch: Partial<R1ChecklistProfile>) => {
    let next: R1ChecklistProfile = { ...profile, ...patch };
    if (patch.salarie === true) {
      next = { ...next, chef_entreprise: false };
    }
    if (patch.chef_entreprise === true) {
      next = { ...next, salarie: false };
    }
    onProfileChange(next);
  };

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Documents demandés (mail R1)</p>
        <p className="text-xs text-muted-foreground leading-snug">
          Profil revenus pour{" "}
          <span className="font-mono">{"{{liste_documents_r1_html}}"}</span> dans le modèle email
          HTML.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <ProfileToggle
          id="rdv-r1-salarie"
          label="Salarié"
          checked={profile.salarie}
          disabled={disabled}
          onCheckedChange={(checked) => patchProfile({ salarie: checked })}
        />
        <ProfileToggle
          id="rdv-r1-chef"
          label="Chef d'entreprise"
          checked={profile.chef_entreprise}
          disabled={disabled}
          onCheckedChange={(checked) => patchProfile({ chef_entreprise: checked })}
        />
        <ProfileToggle
          id="rdv-r1-retraite"
          label="Estimation retraite"
          checked={profile.retraite}
          disabled={disabled}
          onCheckedChange={(checked) => patchProfile({ retraite: checked })}
        />
      </div>

      {previewHtml ? (
        <div className="rounded-md border border-border/50 bg-background/80 px-3 py-2 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Aperçu liste (HTML)</p>
          <R1ChecklistHtmlPreview html={previewHtml} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {templates ? "Aucune pièce active pour ce profil." : "Chargement des modèles checklist…"}
        </p>
      )}
    </div>
  );
}
