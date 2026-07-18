import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { R1ChecklistEmailHtmlPreview } from "@/components/pipe/R1ChecklistEmailHtmlPreview";
import { buildR1ChecklistEmailVariablesFromProfile } from "@/lib/pipe/pipe-r1-checklist-email-vars";
import type { PipeChecklistTemplates, R1ChecklistProfile } from "@/lib/pipe/pipe-checklist-template";

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

export function patchR1ChecklistProfile(
  profile: R1ChecklistProfile,
  patch: Partial<R1ChecklistProfile>
): R1ChecklistProfile {
  let next: R1ChecklistProfile = { ...profile, ...patch };
  if (patch.salarie === true) {
    next = { ...next, chef_entreprise: false };
  }
  if (patch.chef_entreprise === true) {
    next = { ...next, salarie: false };
  }
  return next;
}

interface PipeR1ChecklistEmailPreviewPanelProps {
  templates: PipeChecklistTemplates;
  profile: R1ChecklistProfile;
  onProfileChange: (profile: R1ChecklistProfile) => void;
  idPrefix?: string;
  disabled?: boolean;
}

export function PipeR1ChecklistEmailPreviewPanel({
  templates,
  profile,
  onProfileChange,
  idPrefix = "r1-email-preview",
  disabled = false,
}: PipeR1ChecklistEmailPreviewPanelProps) {
  const previewHtml = useMemo(
    () => buildR1ChecklistEmailVariablesFromProfile(templates, profile).liste_documents_r1_html,
    [profile, templates]
  );

  const patchProfile = (patch: Partial<R1ChecklistProfile>) => {
    onProfileChange(patchR1ChecklistProfile(profile, patch));
  };

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Aperçu variable email</p>
        <p className="text-xs text-muted-foreground leading-snug">
          Rendu de{" "}
          <span className="font-mono">{"{{liste_documents_r1_html}}"}</span> selon le profil
          revenus (validé à la planification RDV sur chaque dossier).
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <ProfileToggle
          id={`${idPrefix}-salarie`}
          label="Salarié"
          checked={profile.salarie}
          disabled={disabled}
          onCheckedChange={(checked) => patchProfile({ salarie: checked })}
        />
        <ProfileToggle
          id={`${idPrefix}-chef`}
          label="Chef d'entreprise"
          checked={profile.chef_entreprise}
          disabled={disabled}
          onCheckedChange={(checked) => patchProfile({ chef_entreprise: checked })}
        />
        <ProfileToggle
          id={`${idPrefix}-retraite`}
          label="Estimation retraite"
          checked={profile.retraite}
          disabled={disabled}
          onCheckedChange={(checked) => patchProfile({ retraite: checked })}
        />
      </div>

      {previewHtml ? (
        <div className="rounded-md border border-border/50 bg-background/80 px-3 py-2 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Liste HTML</p>
          <R1ChecklistEmailHtmlPreview html={previewHtml} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Aucune pièce active pour ce profil.</p>
      )}
    </div>
  );
}
