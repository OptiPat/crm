import { buildCifPagedCss } from "@/lib/souscription-cif/cif-paged-css";

export type CifPagedResult = {
  /** Nombre de pages A4 générées. */
  pageCount: number;
  /** Retire les `<style>` injectés par Paged.js et vide la cible. */
  cleanup: () => void;
};

const PAGED_STYLESHEET_HREF = "cif-paged.css";

/**
 * Fragmente un noeud source (flux continu) en pages A4 via Paged.js (CSS Paged Media).
 *
 * - Attend `document.fonts.ready` : les hauteurs de ligne dépendent de la police chargée
 *   (Comfortaa) — sans ça la pagination serait calculée sur la police de repli.
 * - Import dynamique : Paged.js touche `window`/`document`, on évite de le charger en SSR/tests.
 * - Renvoie un `cleanup` car chaque rendu injecte des `<style>` globaux (à retirer avant un nouveau rendu).
 */
export type RenderCifPagedOptions = {
  /**
   * Limite les styles injectés par Paged.js au média écran.
   *
   * Indispensable pour l'aperçu : Paged.js insère une règle `@page` globale ;
   * sans ce cadrage, elle s'appliquerait aussi à l'impression des documents à
   * pages figées (lettre de mission, convention RTO) et casserait leur mise en page.
   * Le portail d'impression, lui, doit garder les styles actifs au média print.
   */
  scopeToScreen?: boolean;
};

export async function renderCifPaged(
  sourceEl: HTMLElement,
  targetEl: HTMLElement,
  options: RenderCifPagedOptions = {}
): Promise<CifPagedResult> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* polices indisponibles : on pagine quand même */
    }
  }

  const { Previewer } = await import("pagedjs");

  const stylesBefore = new Set(
    Array.from(document.head.querySelectorAll("style"))
  );

  targetEl.innerHTML = "";

  const content = sourceEl.cloneNode(true) as HTMLElement;
  content.removeAttribute("hidden");
  content.style.display = "";

  const previewer = new Previewer();
  const flow = await previewer.preview(
    content,
    [{ [PAGED_STYLESHEET_HREF]: buildCifPagedCss() }],
    targetEl
  );

  const addedStyles = Array.from(document.head.querySelectorAll("style")).filter(
    (style) => !stylesBefore.has(style)
  );

  if (options.scopeToScreen) {
    for (const style of addedStyles) style.media = "screen";
  }

  // Ne retire QUE les styles de ce rendu : la cible est partagée et vidée au début
  // du rendu suivant. Vider ici effacerait le rendu courant si un rendu obsolète
  // se termine après qu'un rendu plus récent a déjà repeuplé la cible.
  const cleanup = () => {
    for (const style of addedStyles) style.remove();
  };

  const pageCount =
    typeof flow?.total === "number" && flow.total > 0
      ? flow.total
      : targetEl.querySelectorAll(".pagedjs_page").length;

  return { pageCount, cleanup };
}
