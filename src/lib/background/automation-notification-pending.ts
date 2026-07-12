import { invoke } from "@tauri-apps/api/core";
import {
  applyAutomationNotificationTarget,
  parseAutomationNotificationTarget,
} from "@/lib/background/automation-notification-nav";

const STORAGE_KEY = "crm_pending_automation_nav";
const MAX_AGE_MS = 24 * 60 * 60_000;

type PendingNavRecord = {
  nav: string;
  savedAtMs: number;
};

function readLocalPending(): PendingNavRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingNavRecord;
    if (typeof parsed.nav !== "string" || typeof parsed.savedAtMs !== "number") {
      return null;
    }
    if (Date.now() - parsed.savedAtMs > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function persistPendingAutomationNav(navJson: string): void {
  try {
    const record: PendingNavRecord = { nav: navJson, savedAtMs: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* quota / private mode */
  }
}

export function clearPendingAutomationNavLocal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function takePendingFromRust(): Promise<string | null> {
  try {
    return await invoke<string | null>("take_pending_automation_notification_nav_cmd");
  } catch {
    return null;
  }
}

function applyNavJson(navJson: string, setCurrentPage: (page: string) => void): void {
  applyAutomationNotificationTarget(
    parseAutomationNotificationTarget({ nav: navJson }),
    setCurrentPage
  );
}

/** Applique la nav en attente (localStorage + fichier Rust) après déverrouillage. */
export async function consumePendingAutomationNotificationNav(
  setCurrentPage: (page: string) => void
): Promise<boolean> {
  const fromRust = await takePendingFromRust();
  const fromLocal = readLocalPending()?.nav ?? null;
  const navJson = fromRust ?? fromLocal;
  if (!navJson) return false;

  clearPendingAutomationNavLocal();
  applyNavJson(navJson, setCurrentPage);
  return true;
}

export function resetPendingAutomationNavForTests(): void {
  clearPendingAutomationNavLocal();
}
