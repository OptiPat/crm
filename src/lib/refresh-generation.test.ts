import { describe, expect, it } from "vitest";
import {
  beginRefreshGeneration,
  isRefreshGenerationCurrent,
  type RefreshGenerationRef,
} from "./refresh-generation";

describe("refresh-generation", () => {
  it("ignore les réponses d'une génération antérieure", () => {
    const ref: RefreshGenerationRef = { current: 0 };
    const first = beginRefreshGeneration(ref);
    const second = beginRefreshGeneration(ref);
    expect(isRefreshGenerationCurrent(ref, first)).toBe(false);
    expect(isRefreshGenerationCurrent(ref, second)).toBe(true);
  });
});
