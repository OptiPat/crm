declare module "pagedjs" {
  /** Résultat de fragmentation (instance Chunker). */
  interface PagedFlow {
    total: number;
    pages: unknown[];
  }

  export class Previewer {
    constructor();
    /**
     * Fragmente `content` en pages A4 dans `renderTo`.
     * @param stylesheets Feuilles de style : URL (string) ou `{ [href]: cssText }`.
     */
    preview(
      content?: Node | string,
      stylesheets?: Array<string | Record<string, string>>,
      renderTo?: Element
    ): Promise<PagedFlow>;
  }
}
