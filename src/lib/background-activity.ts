export type BackgroundActivityKind =
  | "relation-sync"
  | "stellium-scan"
  | "etiquettes-recalc"
  | "newsletter-send"
  | "notes-sync";

const LABELS: Record<BackgroundActivityKind, string> = {
  "relation-sync": "Synchronisation Gmail / Agenda…",
  "stellium-scan": "Scan Stellium…",
  "etiquettes-recalc": "Recalcul des étiquettes…",
  "newsletter-send": "Envoi newsletter en cours…",
  "notes-sync": "Synchronisation des notes partagées…",
};

type Listener = (active: BackgroundActivityKind[]) => void;

const counts = new Map<BackgroundActivityKind, number>();
const listeners = new Set<Listener>();

function snapshot(): BackgroundActivityKind[] {
  return (Object.keys(LABELS) as BackgroundActivityKind[]).filter(
    (kind) => (counts.get(kind) ?? 0) > 0
  );
}

function notify(): void {
  const active = snapshot();
  for (const listener of listeners) {
    listener(active);
  }
}

export function getBackgroundActivityLabel(kind: BackgroundActivityKind): string {
  return LABELS[kind];
}

export function subscribeBackgroundActivity(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

/** Incrémente un compteur d’activité ; le retour décrémente au `finally`. */
export function beginBackgroundActivity(kind: BackgroundActivityKind): () => void {
  counts.set(kind, (counts.get(kind) ?? 0) + 1);
  notify();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const next = (counts.get(kind) ?? 1) - 1;
    if (next <= 0) counts.delete(kind);
    else counts.set(kind, next);
    notify();
  };
}
