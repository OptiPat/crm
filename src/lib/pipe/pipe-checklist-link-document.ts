import type { Dispatch, MutableRefObject, SetStateAction } from "react";

type ChecklistItemState = {
  received: boolean;
  document_id?: number | null;
  no_credit?: boolean | null;
};

type ChecklistWithItems = {
  items: Record<string, ChecklistItemState>;
};

export async function linkChecklistItemDocument<
  TChecklist extends ChecklistWithItems,
  TUpdate extends { items?: TChecklist["items"] },
>(options: {
  enabled: boolean;
  pipeId: number;
  itemId: string;
  documentId: number | null;
  checklistRef: MutableRefObject<TChecklist | null>;
  activePipeIdRef: MutableRefObject<number>;
  setChecklist: Dispatch<SetStateAction<TChecklist | null>>;
  getItemState: (items: TChecklist["items"], itemId: string) => ChecklistItemState;
  mergeUpdate: (current: TChecklist, update: TUpdate) => TChecklist;
  linkGenerationRef: MutableRefObject<number>;
  saveUpdate: (update: TUpdate) => Promise<TChecklist>;
  onSaved?: (updated: TChecklist) => void;
}): Promise<void> {
  const {
    enabled,
    pipeId,
    itemId,
    documentId,
    checklistRef,
    activePipeIdRef,
    setChecklist,
    getItemState,
    mergeUpdate,
    linkGenerationRef,
    saveUpdate,
    onSaved,
  } = options;

  if (!enabled || pipeId <= 0) {
    throw new Error("Checklist indisponible.");
  }

  const base = checklistRef.current;
  if (!base) {
    throw new Error("Checklist non chargée — réessayez dans un instant.");
  }

  const requestPipeId = pipeId;
  const current = getItemState(base.items, itemId);
  const update = {
    items: {
      ...base.items,
      [itemId]: { ...current, document_id: documentId },
    },
  } as TUpdate;

  const snapshot = base;
  const optimistic = mergeUpdate(base, update);
  setChecklist(optimistic);
  checklistRef.current = optimistic;

  const generation = ++linkGenerationRef.current;
  const isStillActive = () =>
    generation === linkGenerationRef.current && activePipeIdRef.current === requestPipeId;

  try {
    const updated = await saveUpdate(update);
    if (isStillActive()) {
      setChecklist(updated);
      checklistRef.current = updated;
      onSaved?.(updated);
    }
  } catch (err) {
    if (isStillActive()) {
      setChecklist(snapshot);
      checklistRef.current = snapshot;
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}
