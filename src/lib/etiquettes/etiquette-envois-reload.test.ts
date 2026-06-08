import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedEnvoisReload } from "@/lib/etiquettes/etiquette-envois-reload";

describe("createDebouncedEnvoisReload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("regroupe plusieurs appels en un seul reload", () => {
    const onReload = vi.fn();
    const schedule = createDebouncedEnvoisReload(onReload, 300);

    schedule();
    schedule();
    schedule();
    expect(onReload).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(onReload).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
