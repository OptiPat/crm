/**
 * File d'attente d'import de documents (page Documents) — logique pure.
 *
 * On ne garde que les chemins source : chaque fichier n'est copié (staging)
 * qu'au moment où il devient le fichier courant. Un fichier en attente n'a donc
 * jamais de copie temporaire à nettoyer.
 */

export type DocumentImportQueue = {
  /** Chemins source pas encore préparés, dans l'ordre d'import. */
  pending: string[];
  /** Rang (1-based) du fichier courant ; 0 si aucun. */
  position: number;
  /** Nombre total de fichiers de la file (déjà traités + courant + restants). */
  total: number;
};

export const EMPTY_IMPORT_QUEUE: DocumentImportQueue = { pending: [], position: 0, total: 0 };

/** Extensions proposées par le sélecteur multi-fichiers (même liste que uploadDocument). */
export const DOCUMENT_IMPORT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "txt",
  "jpg",
  "jpeg",
  "png",
  "webp",
];

/** Ajoute des chemins en fin de file (doublons et chemins vides ignorés). */
export function enqueueImportPaths(
  queue: DocumentImportQueue,
  paths: readonly string[]
): { queue: DocumentImportQueue; added: number } {
  const pending = [...queue.pending];
  let added = 0;
  for (const raw of paths) {
    const path = raw.trim();
    if (!path || pending.includes(path)) continue;
    pending.push(path);
    added += 1;
  }
  return { queue: { ...queue, pending, total: queue.total + added }, added };
}

/** Retire le prochain chemin de la file et avance le rang courant. */
export function dequeueImportPath(queue: DocumentImportQueue): {
  queue: DocumentImportQueue;
  path: string | null;
} {
  const [path, ...rest] = queue.pending;
  if (path == null) return { queue, path: null };
  return { queue: { ...queue, pending: rest, position: queue.position + 1 }, path };
}

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** « Fichier 1 sur 3 — nom.pdf » ; rien si la file ne contient qu'un fichier. */
export function formatImportQueueLabel(
  queue: DocumentImportQueue,
  fileName: string
): string | undefined {
  if (queue.total <= 1 || queue.position < 1) return undefined;
  return `Fichier ${queue.position} sur ${queue.total} — ${fileName}`;
}

export function formatFilesCount(count: number): string {
  return `${count} fichier${count > 1 ? "s" : ""}`;
}

/**
 * Types repris d'un fichier à l'autre. Identité / RIO / QPI dépendent du contenu
 * (détection automatique) : on ne les propage pas.
 */
const CARRY_OVER_TYPES = new Set(["FISCAL", "CONTRAT", "RELEVE", "AUTRE"]);

export function carryOverTypeDocument(typeDocument?: string): string | undefined {
  return typeDocument && CARRY_OVER_TYPES.has(typeDocument) ? typeDocument : undefined;
}

/** Type proposé pour le fichier suivant : la détection prime, sinon le type précédent. */
export function resolveQueuedTypeDocument(
  detectedType: string,
  carriedType?: string
): string {
  if (detectedType !== "AUTRE") return detectedType;
  return carriedType ?? "AUTRE";
}

/** Comparaison de chemins insensible aux séparateurs et à la casse (Windows). */
export function normalizeDocumentPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
