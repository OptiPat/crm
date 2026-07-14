import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Fenêtre principale cachée (tray / fermée avec ✕) — plus fiable que `document.hidden` sous Windows. */
export async function isCrmWindowHidden(): Promise<boolean> {
  try {
    const window = getCurrentWebviewWindow();
    return !(await window.isVisible());
  } catch {
    return typeof document !== "undefined" ? document.hidden : false;
  }
}

export async function isCrmWindowVisible(): Promise<boolean> {
  return !(await isCrmWindowHidden());
}
