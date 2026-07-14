import { describe, expect, it, vi } from "vitest";
import {
  buildTrayDigestLines,
  decideTrayDigestNotification,
  formatTrayDigestRdvLine,
  hasNewImminentRdv,
  loadTrayDigestNotifyState,
  persistTrayDigestNotifyState,
  resetTrayDigestNotifyStateForTests,
  trayDigestFingerprint,
  TRAY_DIGEST_MIN_INTERVAL_MS,
} from "@/lib/background/tray-digest-notify";
import type { TrayDigestSnapshot } from "@/lib/api/tauri-tray-digest";

const NOW_MS = 1_783_881_000_000;
const NOW_UNIX = Math.floor(NOW_MS / 1000);

function emptySnapshot(overrides: Partial<TrayDigestSnapshot> = {}): TrayDigestSnapshot {
  return {
    pipe_rdvs_within_2h: [],
    alertes_count: 0,
    taches_urgent_count: 0,
    emails_ready_count: 0,
    placement_pending_count: 0,
    placement_non_conforme_count: 0,
    ...overrides,
  };
}

describe("tray-digest-notify", () => {
  it("formate un RDV Pipe imminent", () => {
    const line = formatTrayDigestRdvLine(
      {
        calendar_event_id: 1,
        start_at: NOW_UNIX + 3600,
        timeline_titre: "R1",
        contact_nom: "DUPONT",
        contact_prenom: "Jean",
      },
      NOW_UNIX
    );
    expect(line).toContain("RDV R1 avec DUPONT");
    expect(line).toContain("dans 1 h");
  });

  it("regroupe alertes, taches et emails en lignes digest", () => {
    const lines = buildTrayDigestLines(
      emptySnapshot({
        alertes_count: 3,
        taches_urgent_count: 2,
        emails_ready_count: 12,
      }),
      NOW_UNIX
    );
    expect(lines).toHaveLength(3);
    expect(lines[0]?.text).toBe("3 alertes Suivi à traiter");
    expect(lines[1]?.text).toBe("2 tâches aujourd'hui / en retard");
    expect(lines[2]?.text).toBe("12 emails prêts dans Suivi");
  });

  it("ne renvoie pas le même digest avant le cooldown", () => {
    const snapshot = emptySnapshot({ alertes_count: 2 });
    const lines = buildTrayDigestLines(snapshot, NOW_UNIX);
    const fp = trayDigestFingerprint(lines);
    const decision = decideTrayDigestNotification(snapshot, {
      nowMs: NOW_MS,
      lastFingerprint: fp,
      lastSentAtMs: NOW_MS - 30 * 60_000,
    });
    expect(decision.shouldSend).toBe(false);
  });

  it("ne renvoie pas si contenu change avant cooldown sans nouveau RDV", () => {
    const snapshot = emptySnapshot({ alertes_count: 1 });
    const decision = decideTrayDigestNotification(snapshot, {
      nowMs: NOW_MS,
      lastFingerprint: "alertes:2 alertes Suivi à traiter",
      lastSentAtMs: NOW_MS - 30 * 60_000,
      notifiedRdvIds: new Set(),
    });
    expect(decision.shouldSend).toBe(false);
  });

  it("renvoie si cooldown ecoule", () => {
    const snapshot = emptySnapshot({ alertes_count: 2 });
    const lines = buildTrayDigestLines(snapshot, NOW_UNIX);
    const fp = trayDigestFingerprint(lines);
    const decision = decideTrayDigestNotification(snapshot, {
      nowMs: NOW_MS,
      lastFingerprint: fp,
      lastSentAtMs: NOW_MS - TRAY_DIGEST_MIN_INTERVAL_MS - 1,
    });
    expect(decision.shouldSend).toBe(true);
  });

  it("bypass cooldown pour un nouveau RDV dans les 2 h", () => {
    const snapshot = emptySnapshot({
      pipe_rdvs_within_2h: [
        {
          calendar_event_id: 42,
          start_at: NOW_UNIX + 3600,
          timeline_titre: "R1",
          contact_nom: "DUPONT",
          contact_prenom: "Jean",
        },
      ],
    });
    const decision = decideTrayDigestNotification(snapshot, {
      nowMs: NOW_MS,
      lastFingerprint: "old",
      lastSentAtMs: NOW_MS - 60_000,
      notifiedRdvIds: new Set(),
    });
    expect(decision.shouldSend).toBe(true);
    expect(decision.title).toContain("RDV imminent");
    expect(decision.rdvIdsToMark).toEqual([42]);
  });

  it("detecte les RDV deja notifies", () => {
    const snapshot = emptySnapshot({
      pipe_rdvs_within_2h: [
        {
          calendar_event_id: 42,
          start_at: NOW_UNIX + 3600,
          timeline_titre: "R1",
          contact_nom: "DUPONT",
          contact_prenom: "Jean",
        },
      ],
    });
    expect(hasNewImminentRdv(snapshot, new Set([42]))).toBe(false);
    expect(hasNewImminentRdv(snapshot, new Set())).toBe(true);
  });

  it("persistTrayDigestNotifyState conserve les RDV si imminentIds non vide", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    resetTrayDigestNotifyStateForTests();

    persistTrayDigestNotifyState("fp", NOW_MS, new Set([42]), [42]);
    expect(loadTrayDigestNotifyState().notifiedRdvIds.has(42)).toBe(true);

    persistTrayDigestNotifyState("fp2", NOW_MS, new Set([42]), [42, 99]);
    const state = loadTrayDigestNotifyState();
    expect(state.notifiedRdvIds.has(42)).toBe(true);
    expect(state.notifiedRdvIds.has(99)).toBe(true);
  });

  it("persistTrayDigestNotifyState purge les RDV hors fenetre 2 h", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    resetTrayDigestNotifyStateForTests();

    persistTrayDigestNotifyState("fp", NOW_MS, new Set([42]), [42]);
    persistTrayDigestNotifyState("fp2", NOW_MS, new Set([42]), []);
    expect(loadTrayDigestNotifyState().notifiedRdvIds.has(42)).toBe(false);
  });
});
