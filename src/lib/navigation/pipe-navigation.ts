export const CRM_PIPE_FOCUS_ID_KEY = "crm_pipe_focus_id";
export const PIPE_FOCUS_EVENT = "crm:pipe-focus";

export function parsePipeFocusId(raw: string | null): number | null {
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function peekPipeFocusId(): number | null {
  return parsePipeFocusId(sessionStorage.getItem(CRM_PIPE_FOCUS_ID_KEY));
}

export function clearPipeFocusId(): void {
  sessionStorage.removeItem(CRM_PIPE_FOCUS_ID_KEY);
}

export function navigateToPipe(onPageChange: (page: string) => void, pipeId: number): void {
  sessionStorage.setItem(CRM_PIPE_FOCUS_ID_KEY, String(pipeId));
  window.dispatchEvent(new CustomEvent(PIPE_FOCUS_EVENT, { detail: { pipeId } }));
  onPageChange("pipe");
}

export function consumePipeFocusId(): number | null {
  const id = peekPipeFocusId();
  clearPipeFocusId();
  return id;
}
