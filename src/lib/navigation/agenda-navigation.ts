import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";

const WEEK_START_KEY = "crm_nav_agenda_week_start";
const HIGHLIGHT_START_KEY = "crm_nav_agenda_highlight_start";
const HIGHLIGHT_END_KEY = "crm_nav_agenda_highlight_end";
const RDV_PIPE_DRAFT_KEY = "crm_nav_agenda_rdv_pipe_draft";

export type AgendaRdvPipeDraft = {
  pipe: Pick<
    PipeRecord,
    "id" | "stage" | "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom" | "titre"
  >;
  rdvStage: PipeRdvStage;
  contenu?: string | null;
};

export function setAgendaNavigationWeekStart(weekStartAt: number): void {
  sessionStorage.setItem(WEEK_START_KEY, String(weekStartAt));
}

export function setAgendaNavigationHighlight(startAt: number, endAt: number): void {
  sessionStorage.setItem(HIGHLIGHT_START_KEY, String(startAt));
  sessionStorage.setItem(HIGHLIGHT_END_KEY, String(endAt));
}

export function setAgendaRdvPipeDraft(draft: AgendaRdvPipeDraft): void {
  sessionStorage.setItem(RDV_PIPE_DRAFT_KEY, JSON.stringify(draft));
}

export function peekAgendaRdvPipeDraft(): AgendaRdvPipeDraft | null {
  const raw = sessionStorage.getItem(RDV_PIPE_DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgendaRdvPipeDraft;
  } catch {
    return null;
  }
}

export function consumeAgendaRdvPipeDraft(): AgendaRdvPipeDraft | null {
  const draft = peekAgendaRdvPipeDraft();
  sessionStorage.removeItem(RDV_PIPE_DRAFT_KEY);
  return draft;
}

export function consumeAgendaNavigationWeekStart(): number | null {
  const raw = sessionStorage.getItem(WEEK_START_KEY);
  sessionStorage.removeItem(WEEK_START_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function consumeAgendaNavigationHighlight(): {
  startAt: number;
  endAt: number;
} | null {
  const startRaw = sessionStorage.getItem(HIGHLIGHT_START_KEY);
  const endRaw = sessionStorage.getItem(HIGHLIGHT_END_KEY);
  sessionStorage.removeItem(HIGHLIGHT_START_KEY);
  sessionStorage.removeItem(HIGHLIGHT_END_KEY);
  if (!startRaw || !endRaw) return null;
  const startAt = Number(startRaw);
  const endAt = Number(endRaw);
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return null;
  return { startAt, endAt };
}

export function navigateToAgendaWeek(
  onPageChange: (page: string) => void,
  weekStartAt: number,
  currentPage?: string
): void {
  setAgendaNavigationWeekStart(weekStartAt);
  if (currentPage !== "agenda") {
    onPageChange("agenda");
  }
}

export function navigateToAgendaWeekWithHighlight(
  onPageChange: (page: string) => void,
  weekStartAt: number,
  startAt: number,
  endAt: number,
  currentPage?: string,
  pipeDraft?: AgendaRdvPipeDraft | null
): void {
  setAgendaNavigationWeekStart(weekStartAt);
  setAgendaNavigationHighlight(startAt, endAt);
  if (pipeDraft) {
    setAgendaRdvPipeDraft(pipeDraft);
  }
  if (currentPage !== "agenda") {
    onPageChange("agenda");
  }
}
