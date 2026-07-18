import { describe, expect, it, vi } from "vitest";
import { linkChecklistItemDocument } from "./pipe-checklist-link-document";

type TestChecklist = {
  items: Record<string, { received: boolean; document_id?: number | null }>;
};

type TestUpdate = { items?: TestChecklist["items"] };

function createChecklistState(initial: TestChecklist, pipeId = 1) {
  const checklistRef = { current: structuredClone(initial) as TestChecklist | null };
  const activePipeIdRef = { current: pipeId };
  let state: TestChecklist | null = checklistRef.current;

  const setChecklist = (
    updater: TestChecklist | null | ((prev: TestChecklist | null) => TestChecklist | null)
  ) => {
    state = typeof updater === "function" ? updater(state) : updater;
    if (state) checklistRef.current = state;
  };

  return { checklistRef, activePipeIdRef, setChecklist, getState: () => state };
}

describe("linkChecklistItemDocument", () => {
  it("applique la réponse serveur avec un compteur de liaison indépendant", async () => {
    const initial: TestChecklist = {
      items: { cni: { received: true, document_id: null } },
    };
    const { checklistRef, activePipeIdRef, setChecklist, getState } = createChecklistState(initial);
    const linkGenerationRef = { current: 0 };
    const persistGenerationRef = { current: 0 };

    const saveUpdate = vi.fn(async (update: TestUpdate) => {
      ++persistGenerationRef.current;
      return {
        items: {
          ...initial.items,
          ...(update.items ?? {}),
        },
      };
    });

    await linkChecklistItemDocument({
      enabled: true,
      pipeId: 1,
      itemId: "cni",
      documentId: 42,
      checklistRef,
      activePipeIdRef,
      setChecklist,
      getItemState: (items, itemId) => items[itemId] ?? { received: false },
      mergeUpdate: (current, update) => ({
        ...current,
        items: { ...current.items, ...(update.items ?? {}) },
      }),
      linkGenerationRef,
      saveUpdate,
    });

    expect(saveUpdate).toHaveBeenCalledWith({
      items: {
        cni: { received: true, document_id: 42 },
      },
    });
    expect(getState()?.items.cni.document_id).toBe(42);
    expect(checklistRef.current?.items.cni.document_id).toBe(42);
    expect(persistGenerationRef.current).toBe(1);
    expect(linkGenerationRef.current).toBe(1);
  });

  it("échoue si la checklist n'est pas encore chargée", async () => {
    const checklistRef = { current: null as TestChecklist | null };
    const setChecklist = vi.fn();

    await expect(
      linkChecklistItemDocument({
        enabled: true,
        pipeId: 1,
        itemId: "cni",
        documentId: 42,
        checklistRef,
        activePipeIdRef: { current: 1 },
        setChecklist,
        getItemState: (items, itemId) => items[itemId] ?? { received: false },
        mergeUpdate: (current, update) => ({
          ...current,
          items: { ...current.items, ...(update.items ?? {}) },
        }),
        linkGenerationRef: { current: 0 },
        saveUpdate: async (): Promise<TestChecklist> => ({ items: {} }),
      })
    ).rejects.toThrow(/Checklist non chargée/);

    expect(setChecklist).not.toHaveBeenCalled();
  });

  it("ignore la réponse serveur si l'affaire a changé entre-temps", async () => {
    const initial: TestChecklist = {
      items: { cni: { received: true, document_id: null } },
    };
    const { checklistRef, activePipeIdRef, setChecklist, getState } = createChecklistState(initial, 1);
    const linkGenerationRef = { current: 0 };

    const saveUpdate = vi.fn(async (update: TestUpdate) => {
      activePipeIdRef.current = 2;
      return {
        items: {
          ...initial.items,
          ...(update.items ?? {}),
        },
      };
    });

    await linkChecklistItemDocument({
      enabled: true,
      pipeId: 1,
      itemId: "cni",
      documentId: 42,
      checklistRef,
      activePipeIdRef,
      setChecklist,
      getItemState: (items, itemId) => items[itemId] ?? { received: false },
      mergeUpdate: (current, update) => ({
        ...current,
        items: { ...current.items, ...(update.items ?? {}) },
      }),
      linkGenerationRef,
      saveUpdate,
    });

    expect(saveUpdate).toHaveBeenCalled();
    expect(getState()?.items.cni.document_id).toBe(42);
  });

  it("restaure le snapshot si la persistance échoue", async () => {
    const initial: TestChecklist = {
      items: { rib: { received: false, document_id: 7 } },
    };
    const { checklistRef, activePipeIdRef, setChecklist, getState } = createChecklistState(initial, 2);
    const linkGenerationRef = { current: 0 };

    await expect(
      linkChecklistItemDocument({
        enabled: true,
        pipeId: 2,
        itemId: "rib",
        documentId: null,
        checklistRef,
        activePipeIdRef,
        setChecklist,
        getItemState: (items, itemId) => items[itemId] ?? { received: false },
        mergeUpdate: (current, update) => ({
          ...current,
          items: { ...current.items, ...(update.items ?? {}) },
        }),
        linkGenerationRef,
        saveUpdate: async () => {
          throw new Error("save failed");
        },
      })
    ).rejects.toThrow(/save failed/);

    expect(getState()?.items.rib.document_id).toBe(7);
    expect(checklistRef.current?.items.rib.document_id).toBe(7);
  });
});
