export const CRM_PARRAINAGE_PIPE_FOCUS_ID_KEY = "crm_parrainage_pipe_focus_id";
export const PARRAINAGE_PIPE_FOCUS_EVENT = "crm:parrainage-pipe-focus";

export function parseParrainagePipeFocusId(raw: string | null): number | null {
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function peekParrainagePipeFocusId(): number | null {
  return parseParrainagePipeFocusId(sessionStorage.getItem(CRM_PARRAINAGE_PIPE_FOCUS_ID_KEY));
}

export function clearParrainagePipeFocusId(): void {
  sessionStorage.removeItem(CRM_PARRAINAGE_PIPE_FOCUS_ID_KEY);
}

export function navigateToParrainagePipe(
  onPageChange: (page: string) => void,
  pipeId?: number
): void {
  if (pipeId != null) {
    sessionStorage.setItem(CRM_PARRAINAGE_PIPE_FOCUS_ID_KEY, String(pipeId));
  } else {
    clearParrainagePipeFocusId();
  }
  window.dispatchEvent(
    new CustomEvent(PARRAINAGE_PIPE_FOCUS_EVENT, { detail: { pipeId: pipeId ?? null } })
  );
  onPageChange("pipe-parrainage");
}

export function consumeParrainagePipeFocusId(): number | null {
  const id = peekParrainagePipeFocusId();
  clearParrainagePipeFocusId();
  return id;
}
