export const PIPE_R3_CHECKLIST_CHANGED_EVENT = "crm:pipe-r3-checklist-changed";

export interface PipeR3ChecklistChangedDetail {
  pipeId: number;
  missingItemKeys: string[];
}

export function notifyPipeR3ChecklistChanged(detail?: PipeR3ChecklistChangedDetail): void {
  window.dispatchEvent(new CustomEvent(PIPE_R3_CHECKLIST_CHANGED_EVENT, { detail }));
}

export function subscribePipeR3ChecklistChanged(
  listener: (detail?: PipeR3ChecklistChangedDetail) => void
): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<PipeR3ChecklistChangedDetail>).detail);
  };
  window.addEventListener(PIPE_R3_CHECKLIST_CHANGED_EVENT, handler);
  return () => window.removeEventListener(PIPE_R3_CHECKLIST_CHANGED_EVENT, handler);
}
