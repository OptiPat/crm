export const RDV_DURATION_PRESETS = [
  { id: "30", label: "30 min", minutes: 30 },
  { id: "45", label: "45 min", minutes: 45 },
  { id: "60", label: "1 h", minutes: 60 },
  { id: "90", label: "1 h 30", minutes: 90 },
  { id: "120", label: "2 h", minutes: 120 },
] as const;

export type RdvDurationPresetId = (typeof RDV_DURATION_PRESETS)[number]["id"];

export const DEFAULT_RDV_DURATION_MINUTES = 60;

export function rdvDurationMinutesFromPreset(presetId: RdvDurationPresetId): number {
  return RDV_DURATION_PRESETS.find((p) => p.id === presetId)?.minutes ?? DEFAULT_RDV_DURATION_MINUTES;
}

export function endUnixFromDuration(startUnix: number, durationMinutes: number): number {
  return startUnix + durationMinutes * 60;
}

export function unixToDatetimeLocalInput(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToUnix(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

export function syncEndFromStartAndDuration(
  startValue: string,
  durationMinutes: number
): string {
  if (!startValue) return "";
  const endUnix = endUnixFromDuration(datetimeLocalToUnix(startValue), durationMinutes);
  return unixToDatetimeLocalInput(endUnix);
}
