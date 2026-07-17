import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPipeFocusId,
  consumePipeFocusId,
  CRM_PIPE_FOCUS_ID_KEY,
  navigateToPipe,
  peekPipeFocusId,
  PIPE_FOCUS_EVENT,
} from "./pipe-navigation";

function mockSessionStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("pipe-navigation", () => {
  let dispatchEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dispatchEvent = vi.fn();
    vi.stubGlobal("sessionStorage", mockSessionStorage());
    vi.stubGlobal("window", {
      dispatchEvent,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stocke et consomme l'id de focus pipe", () => {
    sessionStorage.setItem(CRM_PIPE_FOCUS_ID_KEY, "42");
    expect(peekPipeFocusId()).toBe(42);
    expect(consumePipeFocusId()).toBe(42);
    expect(peekPipeFocusId()).toBeNull();
  });

  it("navigateToPipe enregistre le focus et émet un événement", () => {
    const onPageChange = vi.fn();

    navigateToPipe(onPageChange, 7);

    expect(sessionStorage.getItem(CRM_PIPE_FOCUS_ID_KEY)).toBe("7");
    expect(onPageChange).toHaveBeenCalledWith("pipe");
    expect(dispatchEvent).toHaveBeenCalledOnce();
    const event = dispatchEvent.mock.calls[0][0] as CustomEvent<{ pipeId: number }>;
    expect(event.type).toBe(PIPE_FOCUS_EVENT);
    expect(event.detail.pipeId).toBe(7);
  });

  it("clearPipeFocusId retire la clé session", () => {
    sessionStorage.setItem(CRM_PIPE_FOCUS_ID_KEY, "3");
    clearPipeFocusId();
    expect(peekPipeFocusId()).toBeNull();
  });
});
