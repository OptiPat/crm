import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { R1ChecklistEmailHtmlPreview } from "@/components/pipe/R1ChecklistEmailHtmlPreview";
import { buildR3ImmoChecklistEmailVariablesFromContext } from "@/lib/pipe/pipe-r3-immo-checklist-email-vars";
import {
  patchR3ImmoRdvPlanningDraft,
  type R3ImmoRdvPlanningDraft,
} from "@/lib/pipe/pipe-r3-immo-rdv-planning";
import type { R3ImmoChecklistContext } from "@/lib/pipe/r3-immo-document-checklist";
import type { R3ImmoChecklistTemplate } from "@/lib/pipe/r3-immo-checklist-template";

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

interface PipeR3ImmoRdvDocumentsFieldsProps {
  draft: R3ImmoRdvPlanningDraft;
  onDraftChange: (draft: R3ImmoRdvPlanningDraft) => void;
  checklistContext: R3ImmoChecklistContext | null;
  template: R3ImmoChecklistTemplate | null;
  revenueFromR1: boolean;
  revenueLabel: string | null;
  disabled?: boolean;
}

export function PipeR3ImmoRdvDocumentsFields({
  draft,
  onDraftChange,
  checklistContext,
  template,
  revenueFromR1,
  revenueLabel,
  disabled = false,
}: PipeR3ImmoRdvDocumentsFieldsProps) {
  const previewHtml = useMemo(() => {
    if (!checklistContext || !template) return "";
    return buildR3ImmoChecklistEmailVariablesFromContext(template, checklistContext)
      .liste_documents_r3_immo_html;
  }, [checklistContext, template]);

  const resolvedSalarie = checklistContext?.checklist.profile_salarie ?? draft.profile_salarie;
  const resolvedChef =
    checklistContext?.checklist.profile_chef_entreprise ?? draft.profile_chef_entreprise;

  const patchDraft = (patch: Partial<R3ImmoRdvPlanningDraft>) => {
    onDraftChange(patchR3ImmoRdvPlanningDraft(draft, patch));
  };

  if (!template) {
    return (
      <p className="text-xs text-muted-foreground rounded-lg border border-border/70 bg-muted/20 p-3">
        Chargement des modèles checklist…
      </p>
    );
  }

  return (
    <div className={disabled ? "opacity-60" : undefined}>
      <div className="space-y-3">
        <p className="text-sm font-medium px-0.5">Documents demandés (mail R3 Immo)</p>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Profil revenus</p>
            {revenueFromR1 && revenueLabel ? (
              <p className="text-xs text-muted-foreground">
                Repris du R1 :{" "}
                <span className="font-medium text-foreground">{revenueLabel}</span>
                {" — "}ajustez si besoin pour chaque emprunteur.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <ProfileToggle
                id="rdv-r3-immo-salarie"
                label="Salarié"
                checked={resolvedSalarie}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  patchDraft({
                    profile_salarie: checked,
                    profile_chef_entreprise: resolvedChef,
                  })
                }
              />
              <ProfileToggle
                id="rdv-r3-immo-chef"
                label="Chef d'entreprise"
                checked={resolvedChef}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  patchDraft({
                    profile_chef_entreprise: checked,
                    profile_salarie: resolvedSalarie,
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Situation dossier</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <ProfileToggle
                id="rdv-r3-immo-pm"
                label="Emprunteur personne morale (SCI)"
                checked={draft.emprunteur_personne_morale}
                disabled={disabled}
                onCheckedChange={(checked) => patchDraft({ emprunteur_personne_morale: checked })}
              />
              <ProfileToggle
                id="rdv-r3-immo-fonciers"
                label="Revenus fonciers hors micro"
                checked={draft.revenus_fonciers_hors_micro}
                disabled={disabled}
                onCheckedChange={(checked) => patchDraft({ revenus_fonciers_hors_micro: checked })}
              />
              <ProfileToggle
                id="rdv-r3-immo-sci-revenus"
                label="Revenus via SCI"
                checked={draft.revenus_via_sci}
                disabled={disabled}
                onCheckedChange={(checked) => patchDraft({ revenus_via_sci: checked })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Type de projet</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <ProfileToggle
                id="rdv-r3-immo-vefa"
                label="VEFA"
                checked={draft.projet_vefa}
                disabled={disabled}
                onCheckedChange={(checked) => patchDraft({ projet_vefa: checked })}
              />
              <ProfileToggle
                id="rdv-r3-immo-ancien"
                label="Ancien"
                checked={draft.projet_ancien}
                disabled={disabled}
                onCheckedChange={(checked) => patchDraft({ projet_ancien: checked })}
              />
              <ProfileToggle
                id="rdv-r3-immo-scpi"
                label="SCPI"
                checked={draft.projet_scpi}
                disabled={disabled}
                onCheckedChange={(checked) => patchDraft({ projet_scpi: checked })}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Aperçu variable email</p>
            <p className="text-xs text-muted-foreground leading-snug">
              Rendu de{" "}
              <span className="font-mono">{"{{liste_documents_r3_immo_html}}"}</span> selon le
              contexte ci-dessus et la fiche contact (situation familiale, logement, patrimoine…).
            </p>
          </div>

          {previewHtml ? (
            <div className="rounded-md border border-border/50 bg-background/80 px-3 py-2 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">Liste HTML</p>
              <R1ChecklistEmailHtmlPreview html={previewHtml} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Aucune pièce active — complétez le contexte ou la fiche contact.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
