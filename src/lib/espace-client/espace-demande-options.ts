import { loadPipeChecklistTemplates, type PipeChecklistStage } from "@/lib/pipe/pipe-checklist-template";
import { suggestedDocumentTypeForChecklistItem } from "@/lib/pipe/pipe-checklist-document-import";
import {
  cloneDefaultR3ImmoChecklistTemplate,
  loadR3ImmoChecklistTemplate,
} from "@/lib/pipe/r3-immo-checklist-template";

export type EspaceDemandeOptionGroup =
  | "R1"
  | "R2"
  | "R3_PLACEMENT"
  | "R3_IMMO"
  | "CUSTOM";

export interface EspaceDemandeOption {
  group: EspaceDemandeOptionGroup;
  /** Clé stable : `R1:avis_imposition`, `R3_IMMO:cni`, ou `custom`. */
  templateKey: string;
  label: string;
  /** Type GED suggéré (IDENTITE, FISCAL, …). */
  typeDocument: string;
}

const PIPE_STAGES: Array<{ stage: PipeChecklistStage; group: EspaceDemandeOptionGroup }> =
  [
    { stage: "R1", group: "R1" },
    { stage: "R2", group: "R2" },
    { stage: "R3", group: "R3_PLACEMENT" },
  ];

const GROUP_LABELS: Record<EspaceDemandeOptionGroup, string> = {
  R1: "R1",
  R2: "R2",
  R3_PLACEMENT: "R3 Placements",
  R3_IMMO: "R3 Immo",
  CUSTOM: "Autre",
};

export function espaceDemandeGroupLabel(group: EspaceDemandeOptionGroup): string {
  return GROUP_LABELS[group];
}

function pipeOptionsFromStage(
  stage: PipeChecklistStage,
  group: EspaceDemandeOptionGroup,
  templates: Awaited<ReturnType<typeof loadPipeChecklistTemplates>>
): EspaceDemandeOption[] {
  return (templates[stage] ?? []).map((item) => ({
    group,
    templateKey: `${stage}:${item.id}`,
    label: item.label,
    typeDocument: suggestedDocumentTypeForChecklistItem(item.id) ?? "AUTRE",
  }));
}

/** Liste déroulante : mêmes libellés que les checklists pipe + option libre. */
export async function loadEspaceDemandeOptions(): Promise<EspaceDemandeOption[]> {
  const [pipeTemplates, r3Immo] = await Promise.all([
    loadPipeChecklistTemplates(),
    loadR3ImmoChecklistTemplate().catch(() => cloneDefaultR3ImmoChecklistTemplate()),
  ]);

  const options: EspaceDemandeOption[] = [];
  for (const { stage, group } of PIPE_STAGES) {
    options.push(...pipeOptionsFromStage(stage, group, pipeTemplates));
  }
  for (const item of r3Immo.items) {
    options.push({
      group: "R3_IMMO",
      templateKey: `R3_IMMO:${item.id}`,
      label: item.label,
      typeDocument: suggestedDocumentTypeForChecklistItem(item.id) ?? "AUTRE",
    });
  }
  options.push({
    group: "CUSTOM",
    templateKey: "custom",
    label: "Autre (libellé personnalisé)",
    typeDocument: "AUTRE",
  });
  return options;
}

export function resolveEspaceDemandeSelection(
  options: EspaceDemandeOption[],
  templateKey: string,
  customLabel?: string
): { libelle: string; typeDocument: string; templateKey: string | null } | null {
  if (templateKey === "custom") {
    const libelle = customLabel?.trim();
    if (!libelle) return null;
    return { libelle, typeDocument: "AUTRE", templateKey: null };
  }
  const match = options.find((opt) => opt.templateKey === templateKey);
  if (!match) return null;
  return {
    libelle: match.label,
    typeDocument: match.typeDocument,
    templateKey: match.templateKey,
  };
}
