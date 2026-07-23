export const ORGANISATION_TREE_VIEWPORT_PADDING = 24;

/** Limite le pan pour garder l'arbre dans le cadre visible (avec marge). */
export function clampOrganisationTreeViewportPan(
  panX: number,
  panY: number,
  scale: number,
  containerWidth: number,
  containerHeight: number,
  contentWidth: number,
  contentHeight: number,
  padding = ORGANISATION_TREE_VIEWPORT_PADDING
): { panX: number; panY: number } {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    contentWidth <= 0 ||
    contentHeight <= 0 ||
    scale <= 0
  ) {
    return { panX, panY };
  }

  const scaledWidth = contentWidth * scale;
  const scaledHeight = contentHeight * scale;

  let x = panX;
  let y = panY;

  if (scaledWidth <= containerWidth - 2 * padding) {
    x = (containerWidth - scaledWidth) / 2;
  } else {
    const minX = containerWidth - scaledWidth - padding;
    const maxX = padding;
    x = Math.min(maxX, Math.max(minX, x));
  }

  if (scaledHeight <= containerHeight - 2 * padding) {
    y = containerHeight - padding - scaledHeight;
  } else {
    const minY = containerHeight - scaledHeight - padding;
    const maxY = padding;
    y = Math.min(maxY, Math.max(minY, y));
  }

  return { panX: x, panY: y };
}
