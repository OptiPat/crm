import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  consumeDocumentsContactFocus,
  navigateToDocuments,
  setDocumentsContactFocus,
} from "./documents-navigation";

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

describe("documents-navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", mockSessionStorage());
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persiste et consomme le focus contact", () => {
    setDocumentsContactFocus(42);
    expect(consumeDocumentsContactFocus()).toBe(42);
    expect(consumeDocumentsContactFocus()).toBeNull();
  });

  it("navigateToDocuments appelle onPageChange et persiste le contact", () => {
    const pages: string[] = [];
    navigateToDocuments((page) => pages.push(page), 7, "contacts");
    expect(pages).toEqual(["documents"]);
    expect(consumeDocumentsContactFocus()).toBe(7);
  });

  it("dispatchAppNavigation documents via navigateToDocuments", () => {
    const dispatch = vi.fn();
    vi.stubGlobal("window", {
      dispatchEvent: dispatch,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    navigateToDocuments(() => {}, 3);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const event = dispatch.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail).toEqual({ type: "documents", contactId: 3 });
  });
});
