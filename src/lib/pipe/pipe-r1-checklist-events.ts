export const PIPE_R1_CHECKLIST_CHANGED_EVENT = "crm:pipe-r1-checklist-changed";

export interface PipeR1ChecklistChangedDetail {
  pipeId: number;
  missingItemKeys: string[];
}

export function notifyPipeR1ChecklistChanged(detail?: PipeR1ChecklistChangedDetail): void {
  window.dispatchEvent(new CustomEvent(PIPE_R1_CHECKLIST_CHANGED_EVENT, { detail }));
}

export function subscribePipeR1ChecklistChanged(
  listener: (detail?: PipeR1ChecklistChangedDetail) => void
): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<PipeR1ChecklistChangedDetail>).detail);
  };
  window.addEventListener(PIPE_R1_CHECKLIST_CHANGED_EVENT, handler);
  return () => window.removeEventListener(PIPE_R1_CHECKLIST_CHANGED_EVENT, handler);
}
