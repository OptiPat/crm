export const RELATION_INTERVAL_MS = 3 * 60_000;
export const STELLIUM_INTERVAL_MS = 60 * 60_000;
export const NOTES_INTERVAL_MS = 5 * 60_000;
export const BIRTHDAY_INTERVAL_MS = 60 * 60_000;
export const RELATION_COOLDOWN_MS = 90_000;
export const STELLIUM_COOLDOWN_MS = 60 * 60_000;
export const NOTES_COOLDOWN_MS = 4 * 60_000;
export const BIRTHDAY_COOLDOWN_MS = 30 * 60_000;
export const WAKE_DEBOUNCE_MS = 300;

export type BackgroundAutomationJob =
  | "relation"
  | "stellium"
  | "notes"
  | "pipe_rdv"
  | "birthdays";

export const JOB_INTERVAL_MS: Record<BackgroundAutomationJob, number> = {
  relation: RELATION_INTERVAL_MS,
  stellium: STELLIUM_INTERVAL_MS,
  notes: NOTES_INTERVAL_MS,
  pipe_rdv: RELATION_INTERVAL_MS,
  birthdays: BIRTHDAY_INTERVAL_MS,
};

export const JOB_COOLDOWN_MS: Partial<Record<BackgroundAutomationJob, number>> = {
  relation: RELATION_COOLDOWN_MS,
  stellium: STELLIUM_COOLDOWN_MS,
  notes: NOTES_COOLDOWN_MS,
  birthdays: BIRTHDAY_COOLDOWN_MS,
};
