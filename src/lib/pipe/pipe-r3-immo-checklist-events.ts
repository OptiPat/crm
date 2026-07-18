export const PIPE_R3_IMMO_CHECKLIST_CHANGED_EVENT = "crm:pipe-r3-immo-checklist-changed";

export interface PipeR3ImmoChecklistChangedDetail {
  pipeId: number;
  missingItemKeys: string[];
}

export function notifyPipeR3ImmoChecklistChanged(
  detail?: PipeR3ImmoChecklistChangedDetail
): void {
  window.dispatchEvent(new CustomEvent(PIPE_R3_IMMO_CHECKLIST_CHANGED_EVENT, { detail }));
}

export function subscribePipeR3ImmoChecklistChanged(
  listener: (detail?: PipeR3ImmoChecklistChangedDetail) => void
): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<PipeR3ImmoChecklistChangedDetail>).detail);
  };
  window.addEventListener(PIPE_R3_IMMO_CHECKLIST_CHANGED_EVENT, handler);
  return () => window.removeEventListener(PIPE_R3_IMMO_CHECKLIST_CHANGED_EVENT, handler);
}
