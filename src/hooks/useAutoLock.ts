import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  APP_RUNTIME_PREFS_CHANGED_EVENT,
  DEFAULT_APP_RUNTIME_PREFS,
  getAppRuntimePrefs,
  type AppRuntimePrefs,
} from "@/lib/api/tauri-app-runtime";
import { shouldAutoLock } from "@/lib/security/auto-lock";

const CHECK_INTERVAL_MS = 1_000;
const BACKEND_TOUCH_INTERVAL_MS = 5_000;
const UI_SESSION_LOCKED_EVENT = "ui-session-locked";
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "keydown",
  "pointerdown",
  "pointermove",
  "touchstart",
  "wheel",
];

export function useAutoLock(
  enabled: boolean,
  onLock: () => void | Promise<void>,
  onBackendLocked: () => void | Promise<void>,
): void {
  const onLockRef = useRef(onLock);
  const onBackendLockedRef = useRef(onBackendLocked);

  useEffect(() => {
    onLockRef.current = onLock;
    onBackendLockedRef.current = onBackendLocked;
  }, [onBackendLocked, onLock]);

  useEffect(() => {
    if (!enabled) return;

    let timeoutMinutes = DEFAULT_APP_RUNTIME_PREFS.auto_lock_minutes;
    let lastActivityMs = Date.now();
    let lastBackendTouchMs = 0;
    let locking = false;

    const requestLock = () => {
      if (locking) return;
      locking = true;
      void Promise.resolve(onLockRef.current())
        .catch(() => undefined)
        .finally(() => {
          locking = false;
        });
    };
    const acceptBackendLock = () => {
      if (locking) return;
      locking = true;
      void Promise.resolve(onBackendLockedRef.current())
        .catch(() => undefined)
        .finally(() => {
          locking = false;
        });
    };
    const check = (nowMs = Date.now()) => {
      if (shouldAutoLock(nowMs, lastActivityMs, timeoutMinutes)) requestLock();
    };
    const recordActivity = () => {
      const nowMs = Date.now();
      // Au retour d'une veille, vérifier l'expiration avant de remettre le
      // compteur à zéro avec un éventuel mouvement de souris système.
      if (shouldAutoLock(nowMs, lastActivityMs, timeoutMinutes)) {
        requestLock();
        return;
      }
      lastActivityMs = nowMs;
      if (nowMs - lastBackendTouchMs < BACKEND_TOUCH_INTERVAL_MS) return;
      lastBackendTouchMs = nowMs;
      void invoke<boolean>("touch_ui_session_activity")
        .then((active) => {
          if (!active) acceptBackendLock();
        })
        .catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) check();
    };
    const handleFocus = () => check();
    const handlePrefsChanged = (event: Event) => {
      const detail = (event as CustomEvent<AppRuntimePrefs>).detail;
      timeoutMinutes = detail?.auto_lock_minutes ?? timeoutMinutes;
      check();
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, recordActivity, { capture: true, passive: true });
    }
    window.addEventListener("focus", handleFocus);
    window.addEventListener(APP_RUNTIME_PREFS_CHANGED_EVENT, handlePrefsChanged);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    let unlistenLocked: (() => void) | undefined;
    let cancelled = false;
    void listen(UI_SESSION_LOCKED_EVENT, acceptBackendLock)
      .then((unlisten) => {
        if (cancelled) unlisten();
        else unlistenLocked = unlisten;
      })
      .catch(() => undefined);
    void invoke<boolean>("touch_ui_session_activity")
      .then((active) => {
        if (!active) acceptBackendLock();
      })
      .catch(() => undefined);
    void getAppRuntimePrefs()
      .then((prefs) => {
        timeoutMinutes = prefs.auto_lock_minutes;
        check();
      })
      .catch(() => {
        // Le défaut sécurisé de 15 minutes reste actif.
      });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      unlistenLocked?.();
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, recordActivity, { capture: true });
      }
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(APP_RUNTIME_PREFS_CHANGED_EVENT, handlePrefsChanged);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled]);
}
