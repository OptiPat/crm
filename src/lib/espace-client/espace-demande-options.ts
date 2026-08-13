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

/** Libellés espace client (plus clairs que le titre court du pipe). */
const LABEL_OVERRIDES: Record<string, string> = {
  "R3:cni": "Carte d'identité ou passeport en cours de validité",
  "R1:bulletin_salaire_decembre": "Bulletin de salaire de décembre",
};

/** Pièces du pipe inutiles, ou déjà couvertes par une ligne R1 / un autre groupe. */
const EXCLUDED_TEMPLATE_KEYS = new Set([
  "R3:der",
  "R3:rio",
  "R3:qpi_a_signer",
  "R3:justificatif_domicile",
  "R3_IMMO:justificatif_domicile",
  "R3_IMMO:cni_emprunteurs",
  "R3_IMMO:avis_imposition_salarie",
  "R3_IMMO:avis_imposition_3",
  "R3_IMMO:bulletins_paie",
  "R3_IMMO:bilans_3",
  "R3_IMMO:estimatif_retraite",
  "R3_IMMO:tableaux_amortissement",
  "R3_IMMO:releves_epargne",
  "R3_IMMO:sci_statuts_revenus",
  "R3_IMMO:sci_kbis_revenus",
  "R3_IMMO:bulletin_souscription_scpi",
  "R3_IMMO:mandat_recherche_capitaux",
  "R1:avis_impot_chef_entreprise",
]);

const SPLIT_TEMPLATE_KEYS: Record<
  string,
  Array<{ id: string; label: string }>
> = {
  "R1:bilans_comptables": [
    { id: "bilan_comptable", label: "Dernier bilan comptable" },
    { id: "bilan_comptable_n1", label: "Bilan comptable N-2" },
    { id: "bilan_comptable_n2", label: "Bilan comptable N-3" },
  ],
  "R1:avis_imposition": [
    { id: "avis_imposition", label: "Dernier avis d'imposition" },
    { id: "avis_imposition_n1", label: "Avis d'imposition N-2" },
    { id: "avis_imposition_n2", label: "Avis d'imposition N-3" },
  ],
  "R1:bulletin_salaire": [
    { id: "bulletin_salaire", label: "Dernier bulletin de salaire" },
    { id: "bulletin_salaire_m2", label: "Bulletin de salaire M-2" },
    { id: "bulletin_salaire_m3", label: "Bulletin de salaire M-3" },
  ],
  "R3_IMMO:releves_compte_courant": [
    { id: "releves_compte_courant", label: "Dernier relevé de compte" },
    { id: "releves_compte_courant_m2", label: "Relevé de compte M-2" },
    { id: "releves_compte_courant_m3", label: "Relevé de compte M-3" },
  ],
};

/** Séries collées (Dernier = N-1/M-1 → -2 → -3) au rang du libellé « Dernier … ». */
const YEAR_SERIES: Array<{ ids: string[]; sortLabel: string }> = [
  {
    ids: ["avis_imposition", "avis_imposition_n1", "avis_imposition_n2"],
    sortLabel: "Dernier avis d'imposition",
  },
  {
    ids: ["bilan_comptable", "bilan_comptable_n1", "bilan_comptable_n2"],
    sortLabel: "Dernier bilan comptable",
  },
  {
    ids: ["bulletin_salaire", "bulletin_salaire_m2", "bulletin_salaire_m3"],
    sortLabel: "Dernier bulletin de salaire",
  },
  {
    ids: ["releves_compte_courant", "releves_compte_courant_m2", "releves_compte_courant_m3"],
    sortLabel: "Dernier relevé de compte",
  },
];

function seriesSortKey(option: EspaceDemandeOption): { label: string; rank: number } {
  const id = option.templateKey.split(":")[1] ?? "";
  for (const series of YEAR_SERIES) {
    const rank = series.ids.indexOf(id);
    if (rank >= 0) return { label: series.sortLabel, rank };
  }
  return { label: option.label, rank: 0 };
}

function isRibOption(option: EspaceDemandeOption): boolean {
  const id = option.templateKey.split(":")[1] ?? "";
  return id === "rib" || /^rib\b/i.test(option.label.trim());
}

export function curateEspaceDemandeOptions(
  options: EspaceDemandeOption[]
): EspaceDemandeOption[] {
  const curated: EspaceDemandeOption[] = [];
  let keptRib = false;
  for (const option of options) {
    if (EXCLUDED_TEMPLATE_KEYS.has(option.templateKey)) continue;
    const split = SPLIT_TEMPLATE_KEYS[option.templateKey];
    const expanded = split
      ? split.map((row) => ({
          group: option.group,
          templateKey: `${option.templateKey.split(":")[0]}:${row.id}`,
          label: row.label,
          typeDocument: option.typeDocument,
        }))
      : [option];
    for (const row of expanded) {
      if (isRibOption(row)) {
        if (keptRib) continue;
        keptRib = true;
      }
      const label = LABEL_OVERRIDES[row.templateKey] ?? row.label;
      curated.push({ ...row, label });
    }
  }
  curated.sort((a, b) => {
    if (a.templateKey === "custom") return 1;
    if (b.templateKey === "custom") return -1;
    const ka = seriesSortKey(a);
    const kb = seriesSortKey(b);
    const byLabel = ka.label.localeCompare(kb.label, "fr", { sensitivity: "base" });
    if (byLabel !== 0) return byLabel;
    return ka.rank - kb.rank;
  });
  return curated;
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

/** Liste déroulante espace client : checklists pipe, élaguées et découpées. */
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
  return curateEspaceDemandeOptions(options);
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
