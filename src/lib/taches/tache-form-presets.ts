import type { Contact } from "@/lib/api/tauri-contacts";
import type { Tache } from "@/lib/api/tauri-taches";

export type TacheFormCreationContext = "alerte" | "contact" | "chain";

export type TitlePresetContext = {
  firstPrenom: string | null;
  firstNom: string | null;
};

export type TacheTitlePreset = {
  id: string;
  label: string;
  build: (ctx: TitlePresetContext) => string;
};

export const TACHE_TITLE_PRESETS: TacheTitlePreset[] = [
  {
    id: "call",
    label: "Rappeler",
    build: ({ firstPrenom }) =>
      firstPrenom ? `Rappeler ${firstPrenom} pour ` : "Rappeler pour ",
  },
  {
    id: "doc",
    label: "Envoyer doc",
    build: ({ firstPrenom }) =>
      firstPrenom ? `Envoyer un document à ${firstPrenom}` : "Envoyer un document",
  },
  {
    id: "sub",
    label: "Relancer souscription",
    build: ({ firstPrenom }) =>
      firstPrenom
        ? `Relancer souscription — ${firstPrenom}`
        : "Relancer souscription",
  },
  {
    id: "rdv",
    label: "Préparer RDV",
    build: ({ firstPrenom, firstNom }) => {
      const name = [firstPrenom, firstNom].filter(Boolean).join(" ").trim();
      return name ? `Préparer RDV — ${name}` : "Préparer RDV";
    },
  },
];

export function buildTitlePresetContext(
  contactIds: number[],
  contacts: Contact[]
): TitlePresetContext {
  const first = contacts.find((c) => contactIds.includes(c.id!));
  return {
    firstPrenom: first?.prenom?.trim() || null,
    firstNom: first?.nom?.trim() || null,
  };
}

export function buildTacheTitlePlaceholder(ctx: TitlePresetContext): string {
  if (ctx.firstPrenom) {
    return `Rappeler ${ctx.firstPrenom} pour…`;
  }
  return "Ex. Rappeler pour le bilan retraite";
}

export function normalizeTacheTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Doublon probable : même contact + titre proche, tâche encore à faire. */
export function findSimilarPendingTache(
  taches: Tache[],
  titre: string,
  contactIds: number[]
): Tache | null {
  const normalized = normalizeTacheTitle(titre);
  if (normalized.length < 4) return null;

  return (
    taches.find((t) => {
      if (t.statut === "FAIT") return false;
      const tNorm = normalizeTacheTitle(t.titre);
      if (tNorm !== normalized && !tNorm.includes(normalized) && !normalized.includes(tNorm)) {
        return false;
      }
      if (contactIds.length === 0 && (t.contacts?.length ?? 0) === 0) return true;
      if (contactIds.length === 0 || (t.contacts?.length ?? 0) === 0) return false;
      return contactIds.some((id) => t.contacts.some((c) => c.contact_id === id));
    }) ?? null
  );
}

export function resolveTacheFormContextBanner(input: {
  tache?: Tache | null;
  creationContext?: TacheFormCreationContext;
  fixedContactId?: number;
  fixedContactIds?: number[];
  contacts: Contact[];
}): string | null {
  if (input.tache) return null;

  if (input.creationContext === "alerte") {
    return "Prérempli depuis une alerte Suivi — ajustez le titre si besoin.";
  }
  if (input.creationContext === "chain") {
    return "Nouveau rappel de suivi pour le(s) contact(s) de la tâche d'origine.";
  }

  const ids =
    input.fixedContactIds?.length
      ? input.fixedContactIds
      : input.fixedContactId != null
        ? [input.fixedContactId]
        : [];

  if (ids.length === 0) return null;

  const labels = ids
    .map((id) => {
      const c = input.contacts.find((x) => x.id === id);
      return c ? `${c.prenom} ${c.nom}`.trim() : null;
    })
    .filter(Boolean);

  if (labels.length === 0) return "Contact(s) pré-sélectionné(s).";
  if (labels.length === 1) return `Contact : ${labels[0]}`;
  return `Contacts : ${labels.join(", ")}`;
}

export function isGlobalTacheCreate(input: {
  tache?: Tache | null;
  fixedContactId?: number;
  fixedContactIds?: number[];
}): boolean {
  if (input.tache) return false;
  if (input.fixedContactId != null) return false;
  if (input.fixedContactIds && input.fixedContactIds.length > 0) return false;
  return true;
}
