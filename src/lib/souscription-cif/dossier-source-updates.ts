import {
  indexRappelSituationLines,
  replaceOrInsertBulletLine,
} from "@/lib/souscription-cif/build-rappel-situation-default";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";
import type { SouscriptionCifDocumentId } from "@/lib/souscription-cif/souscription-cif-storage";
import type { DossierAutoFieldKey } from "@/lib/souscription-cif/sync-dossier-auto-fields";

/**
 * Champ retouché à la main alors que la fiche client / le dernier RIO-QPI a changé depuis :
 * l'utilisateur choisit de reprendre la nouvelle valeur ou de garder sa saisie.
 */
export type DossierSourceUpdate = {
  id: string;
  target: { kind: "field"; key: DossierAutoFieldKey } | { kind: "rappel-line"; label: string };
  label: string;
  fieldId: string;
  document: SouscriptionCifDocumentId;
  /** Valeur actuelle du dossier (saisie manuelle), pour affichage. */
  current: string;
  /** Nouvelle valeur issue de la fiche / des documents, pour affichage. */
  fresh: string;
  isDate: boolean;
};

type SourceUpdateState = Pick<
  SouscriptionDossierFields,
  | DossierAutoFieldKey
  | "autoValues"
  | "sourceValues"
  | "rappelSituationClient"
  | "rappelSituationAutoLines"
  | "rappelSituationSourceLines"
>;

const FIELD_META: Readonly<
  Record<
    DossierAutoFieldKey,
    { label: string; fieldId: string; document: SouscriptionCifDocumentId; isDate?: boolean }
  >
> = {
  dateRio: {
    label: "Date de signature du RIO",
    fieldId: "cif-date-rio",
    document: "lettre-mission",
    isDate: true,
  },
  dateQpi: {
    label: "Date de signature du QPI",
    fieldId: "cif-date-qpi",
    document: "lettre-mission",
    isDate: true,
  },
  lieuNaissance: {
    label: "Lieu de naissance",
    fieldId: "cif-lieu-naissance",
    document: "lettre-mission",
  },
  objectifsClient: {
    label: "Objectifs client",
    fieldId: "cif-objectifs",
    document: "lettre-mission",
  },
  rappelDemande: {
    label: "Rappel de la demande",
    fieldId: "cif-rappel-demande",
    document: "rapport-mission",
  },
  niveauExperience: {
    label: "Niveau de connaissances / expérience",
    fieldId: "cif-niveau-experience",
    document: "annexes-rapport",
  },
};

const FIELD_ORDER: readonly DossierAutoFieldKey[] = [
  "dateRio",
  "dateQpi",
  "lieuNaissance",
  "objectifsClient",
  "rappelDemande",
  "niveauExperience",
];

function bulletValue(line: string, label: string): string {
  const prefix = `➞ ${label} :`;
  return line.startsWith(prefix) ? line.slice(prefix.length).trim() : line.replace(/^➞\s*/, "");
}

/**
 * Champs retouchés dont la source a changé depuis la dernière valeur préremplie.
 * Rien n'est signalé tant que la fiche n'a pas bougé, ni pour un champ vide ou non retouché
 * (la synchro les met déjà à jour).
 */
export function listDossierSourceUpdates(
  dossier: SourceUpdateState,
  options: { includeNiveauExperience?: boolean } = {}
): DossierSourceUpdate[] {
  const updates: DossierSourceUpdate[] = [];
  const autoValues = dossier.autoValues ?? {};
  const sourceValues = dossier.sourceValues ?? {};

  for (const key of FIELD_ORDER) {
    if (key === "niveauExperience" && options.includeNiveauExperience === false) continue;
    const fresh = sourceValues[key];
    const lastAuto = autoValues[key];
    const current = dossier[key] ?? "";
    if (!fresh || lastAuto === undefined || fresh === lastAuto) continue;
    if (!current.trim() || current.trim() === fresh) continue;
    const meta = FIELD_META[key];
    updates.push({
      id: `field:${key}`,
      target: { kind: "field", key },
      label: meta.label,
      fieldId: meta.fieldId,
      document: meta.document,
      current,
      fresh,
      isDate: meta.isDate === true,
    });
  }

  const rappelText = dossier.rappelSituationClient ?? "";
  if (rappelText.trim()) {
    const currentLines = indexRappelSituationLines(rappelText);
    const autoLines = dossier.rappelSituationAutoLines ?? {};
    for (const [label, fresh] of Object.entries(dossier.rappelSituationSourceLines ?? {})) {
      const lastAuto = autoLines[label];
      const current = currentLines.get(label);
      if (!fresh || lastAuto === undefined || fresh === lastAuto) continue;
      if (!current || current === fresh || !bulletValue(current, label)) continue;
      updates.push({
        id: `rappel:${label}`,
        target: { kind: "rappel-line", label },
        label: `Rappel de la situation — ${label}`,
        fieldId: "cif-rappel-situation",
        document: "rapport-mission",
        current: bulletValue(current, label),
        fresh: bulletValue(fresh, label),
        isDate: false,
      });
    }
  }

  return updates;
}

/** Reprend la nouvelle valeur de la fiche ; le champ suit à nouveau la fiche. */
export function acceptDossierSourceUpdate(
  dossier: SourceUpdateState,
  update: DossierSourceUpdate
): Partial<SouscriptionDossierFields> {
  if (update.target.kind === "field") {
    const { key } = update.target;
    const fresh = dossier.sourceValues?.[key];
    if (!fresh) return {};
    return { [key]: fresh, autoValues: { ...dossier.autoValues, [key]: fresh } };
  }
  const { label } = update.target;
  const freshLine = dossier.rappelSituationSourceLines?.[label];
  if (!freshLine) return {};
  return {
    rappelSituationClient: replaceOrInsertBulletLine(
      dossier.rappelSituationClient ?? "",
      label,
      freshLine
    ),
    rappelSituationAutoLines: { ...dossier.rappelSituationAutoLines, [label]: freshLine },
  };
}

/** Garde la saisie : l'alerte disparaît jusqu'au prochain changement de la fiche. */
export function dismissDossierSourceUpdate(
  dossier: SourceUpdateState,
  update: DossierSourceUpdate
): Partial<SouscriptionDossierFields> {
  if (update.target.kind === "field") {
    const { key } = update.target;
    const fresh = dossier.sourceValues?.[key];
    if (!fresh) return {};
    return { autoValues: { ...dossier.autoValues, [key]: fresh } };
  }
  const { label } = update.target;
  const freshLine = dossier.rappelSituationSourceLines?.[label];
  if (!freshLine) return {};
  return {
    rappelSituationAutoLines: { ...dossier.rappelSituationAutoLines, [label]: freshLine },
  };
}
