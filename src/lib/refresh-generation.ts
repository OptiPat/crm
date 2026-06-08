/** Token renvoyé au début d'un reload async — ignore les réponses obsolètes. */
export type RefreshGenerationRef = { current: number };

export function beginRefreshGeneration(ref: RefreshGenerationRef): number {
  ref.current += 1;
  return ref.current;
}

export function isRefreshGenerationCurrent(
  ref: RefreshGenerationRef,
  token: number
): boolean {
  return ref.current === token;
}
