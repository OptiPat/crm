import { getSetting, setSetting } from "@/lib/api/tauri-settings";
import {
  currentFiscalYearLabel,
  fiscalYearLabelForUnix,
  listSelectableFiscalYearLabels,
} from "@/lib/pipe/remuneration-fiscal-year";
import {
  REMUNERATION_TPC_OPTIONS,
  type RemunerationTpcPercent,
} from "@/lib/pipe/remuneration-calc";

export const REMUNERATION_CIF_SETTING_KEY = "remuneration.cif_enabled";

export const REMUNERATION_SETTINGS_CHANGED_EVENT = "crm:remuneration-settings-changed";

export function notifyRemunerationSettingsChanged(): void {
  window.dispatchEvent(new CustomEvent(REMUNERATION_SETTINGS_CHANGED_EVENT));
}

function tpcSettingKey(fiscalYearLabel: string): string {
  return `remuneration.tpc.${fiscalYearLabel}`;
}

export function parseTpcPercent(value: string | null | undefined): RemunerationTpcPercent | null {
  if (value == null) return null;
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return (REMUNERATION_TPC_OPTIONS as readonly number[]).includes(n)
    ? (n as RemunerationTpcPercent)
    : null;
}

export async function getRemunerationCifEnabled(): Promise<boolean> {
  const raw = await getSetting(REMUNERATION_CIF_SETTING_KEY);
  return raw === "true" || raw === "1";
}

export async function setRemunerationCifEnabled(enabled: boolean): Promise<void> {
  await setSetting(REMUNERATION_CIF_SETTING_KEY, enabled ? "true" : "false");
  notifyRemunerationSettingsChanged();
}

export async function getTpcForFiscalYear(
  fiscalYearLabel: string
): Promise<RemunerationTpcPercent | null> {
  const raw = await getSetting(tpcSettingKey(fiscalYearLabel));
  return parseTpcPercent(raw);
}

export async function setTpcForFiscalYear(
  fiscalYearLabel: string,
  tpc: RemunerationTpcPercent
): Promise<void> {
  await setSetting(tpcSettingKey(fiscalYearLabel), String(tpc));
  notifyRemunerationSettingsChanged();
}

export async function getTpcForSubscriptionDate(
  dateSouscriptionUnix: number
): Promise<RemunerationTpcPercent | null> {
  const label = fiscalYearLabelForUnix(dateSouscriptionUnix);
  return getTpcForFiscalYear(label);
}

export {
  currentFiscalYearLabel,
  listSelectableFiscalYearLabels,
  REMUNERATION_TPC_OPTIONS,
};
