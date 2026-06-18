import type {
  ScpiLmPagePreview,
  ScpiLettreMissionPreview,
  SouscriptionPreviewSegment,
} from "@/lib/souscription-cif/render-template";

export const CIF_RECAP_CONTINUATION_SUFFIX = " (suite)";

export type CifLayoutBlock =
  | { kind: "prose"; id: string; segments: SouscriptionPreviewSegment[] }
  | { kind: "recap-header"; id: string; header: string }
  | {
      kind: "recap-row";
      id: string;
      title: string;
      contentSegments: SouscriptionPreviewSegment[];
      continuation?: boolean;
    }
  | { kind: "costs-table"; id: string; rowCount: number }
  | { kind: "signature"; id: string };

/** Pages à repaginer dynamiquement — uniquement si marquées à la construction du preview. */
export function pageNeedsPagination(page: ScpiLmPagePreview): boolean {
  return page.dynamicPagination === true;
}

export function segmentsPlainText(segments: SouscriptionPreviewSegment[]): string {
  return segments
    .map((s) => {
      if (s.kind === "text" || s.kind === "underline" || s.kind === "bold") return s.value;
      return "";
    })
    .join("");
}

export function textToSegments(text: string): SouscriptionPreviewSegment[] {
  if (!text) return [];
  return [{ kind: "text", value: text }];
}

/** Découpe un bloc prose sur les paragraphes (`\n\n`). */
export function splitProseSegments(segments: SouscriptionPreviewSegment[]): SouscriptionPreviewSegment[][] {
  const chunks: SouscriptionPreviewSegment[][] = [];
  let current: SouscriptionPreviewSegment[] = [];

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = [];
    }
  };

  for (const seg of segments) {
    if (seg.kind === "missing") {
      flush();
      chunks.push([seg]);
      continue;
    }
    const parts = seg.value.split(/\n\n+/);
    parts.forEach((part, index) => {
      if (index > 0) flush();
      const trimmed = part.replace(/^\n+|\n+$/g, "");
      if (trimmed) {
        current.push({ ...seg, value: trimmed });
      }
    });
  }
  flush();
  return chunks.length > 0 ? chunks : [segments];
}

export function flattenPageToBlocks(page: ScpiLmPagePreview): CifLayoutBlock[] {
  const blocks: CifLayoutBlock[] = [];
  let proseIndex = 0;

  if (page.bodySegments.length > 0) {
    for (const chunk of splitProseSegments(page.bodySegments)) {
      blocks.push({
        kind: "prose",
        id: `prose-${proseIndex++}`,
        segments: chunk,
      });
    }
  }

  if (page.rapportRecapTableHeader) {
    blocks.push({
      kind: "recap-header",
      id: "recap-header",
      header: page.rapportRecapTableHeader,
    });
  }

  page.rapportRecapRows?.forEach((row, index) => {
    blocks.push({
      kind: "recap-row",
      id: `recap-row-${index}-${slugId(row.title)}`,
      title: row.title,
      contentSegments: row.contentSegments,
    });
  });

  if (page.bodySegmentsAfterRecapTable?.length) {
    blocks.push({
      kind: "prose",
      id: "prose-after-recap",
      segments: page.bodySegmentsAfterRecapTable,
    });
  }

  if (page.showAnnexesCostsTable) {
    blocks.push({
      kind: "costs-table",
      id: "costs-table",
      rowCount: page.annexesCostsRows?.length ?? 0,
    });
  }

  if (page.bodySegmentsAfterCostsTable?.length) {
    blocks.push({
      kind: "prose",
      id: "prose-after-costs",
      segments: page.bodySegmentsAfterCostsTable,
    });
  }

  if (page.signatureColumns) {
    blocks.push({ kind: "signature", id: "signature" });
  }

  return blocks;
}

function slugId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40);
}

export function packBlocksIntoPages(
  blocks: readonly CifLayoutBlock[],
  heights: ReadonlyMap<string, number>,
  maxBodyHeight: number
): CifLayoutBlock[][] {
  if (blocks.length === 0 || maxBodyHeight <= 0) return [];

  const pages: CifLayoutBlock[][] = [];
  let current: CifLayoutBlock[] = [];
  let currentHeight = 0;
  let activeRecapHeader: string | null = null;

  const pushPage = () => {
    if (current.length > 0) {
      pages.push(current);
      current = [];
      currentHeight = 0;
    }
  };

  const headerHeight = (header: string) =>
    heights.get(`recap-header:${header}`) ?? heights.get("recap-header") ?? 0;

  for (const block of blocks) {
    const blockHeight = heights.get(block.id) ?? 0;

    if (blockHeight > maxBodyHeight && block.kind === "recap-row") {
      pushPage();
      if (activeRecapHeader) {
        const contHeader = `${activeRecapHeader}${CIF_RECAP_CONTINUATION_SUFFIX}`;
        const contBlock: CifLayoutBlock = {
          kind: "recap-header",
          id: `recap-header-cont-${pages.length}`,
          header: contHeader,
        };
        current.push(contBlock);
        currentHeight += headerHeight(contHeader);
      }
      current.push(block);
      currentHeight += blockHeight;
      pushPage();
      continue;
    }

    if (currentHeight + blockHeight > maxBodyHeight && current.length > 0) {
      pushPage();
      if (activeRecapHeader && block.kind === "recap-row") {
        const contHeader = `${activeRecapHeader}${CIF_RECAP_CONTINUATION_SUFFIX}`;
        const contBlock: CifLayoutBlock = {
          kind: "recap-header",
          id: `recap-header-cont-${pages.length}`,
          header: contHeader,
        };
        current.push(contBlock);
        currentHeight += headerHeight(contHeader);
      }
    }

    if (block.kind === "recap-header") {
      activeRecapHeader = block.header.replace(CIF_RECAP_CONTINUATION_SUFFIX, "");
    }

    current.push(block);
    currentHeight += blockHeight;
  }

  pushPage();
  return pages;
}

export function blocksToPage(
  blocks: readonly CifLayoutBlock[],
  template: ScpiLmPagePreview
): ScpiLmPagePreview {
  const page: ScpiLmPagePreview = {
    pageNumber: template.pageNumber,
    footerSegments: template.footerSegments,
    bodySegments: [],
  };

  const recapRows: NonNullable<ScpiLmPagePreview["rapportRecapRows"]> = [];
  let sawRecap = false;

  for (const block of blocks) {
    switch (block.kind) {
      case "prose":
        if (!sawRecap && recapRows.length === 0 && !page.showAnnexesCostsTable) {
          page.bodySegments =
            page.bodySegments.length === 0
              ? block.segments
              : [...page.bodySegments, { kind: "text", value: "\n\n" }, ...block.segments];
        } else if (sawRecap && !page.showAnnexesCostsTable && !page.bodySegmentsAfterRecapTable) {
          page.bodySegmentsAfterRecapTable = block.segments;
        } else if (page.showAnnexesCostsTable || block.id === "prose-after-costs") {
          page.bodySegmentsAfterCostsTable = block.segments;
        } else if (!sawRecap) {
          page.bodySegments =
            page.bodySegments.length === 0
              ? block.segments
              : [...page.bodySegments, { kind: "text", value: "\n\n" }, ...block.segments];
        }
        break;
      case "recap-header":
        page.rapportRecapTableHeader = block.header;
        sawRecap = true;
        break;
      case "recap-row":
        recapRows.push({
          title: block.continuation ? `${block.title}${CIF_RECAP_CONTINUATION_SUFFIX}` : block.title,
          contentSegments: block.contentSegments,
        });
        sawRecap = true;
        break;
      case "costs-table":
        page.showAnnexesCostsTable = true;
        page.annexesCostsRows = template.annexesCostsRows;
        break;
      case "signature":
        page.signatureColumns = template.signatureColumns;
        break;
      default:
        break;
    }
  }

  if (recapRows.length > 0) {
    page.rapportRecapRows = recapRows;
  }

  return page;
}

/** Découpe un bloc recap-row ou prose trop haut en plusieurs blocs (par lignes). */
export function splitOversizedBlock(
  block: CifLayoutBlock,
  maxHeight: number,
  measure: (candidate: CifLayoutBlock) => number,
  knownHeight?: number
): CifLayoutBlock[] {
  const height = knownHeight ?? measure(block);
  if (height <= maxHeight) return [block];

  if (block.kind === "prose") {
    return splitProseBlock(block, maxHeight, measure, height);
  }

  if (block.kind === "recap-row") {
    return splitRecapRowBlock(block, maxHeight, measure, height);
  }

  return [block];
}

function splitProseBlock(
  block: Extract<CifLayoutBlock, { kind: "prose" }>,
  maxHeight: number,
  measure: (candidate: CifLayoutBlock) => number,
  knownHeight?: number
): CifLayoutBlock[] {
  const text = segmentsPlainText(block.segments);
  if (!text) return [block];

  const lines = text.split("\n");
  if (lines.length > 1) {
    return splitByLineGroups(block, lines, maxHeight, measure, (linesChunk, index) => ({
      kind: "prose" as const,
      id: `${block.id}-part-${index}`,
      segments: textToSegments(linesChunk.join("\n")),
    }), knownHeight);
  }

  return splitByCharSearch(block, maxHeight, measure, (chunk, index) => ({
    kind: "prose" as const,
    id: `${block.id}-part-${index}`,
    segments: textToSegments(chunk),
  }), knownHeight);
}

function splitRecapRowBlock(
  block: Extract<CifLayoutBlock, { kind: "recap-row" }>,
  maxHeight: number,
  measure: (candidate: CifLayoutBlock) => number,
  knownHeight?: number
): CifLayoutBlock[] {
  const text = segmentsPlainText(block.contentSegments);
  if (!text) return [block];

  const lines = text.split("\n");
  const mapRow = (linesChunk: string[], index: number, continuation: boolean): CifLayoutBlock => ({
    kind: "recap-row",
    id: `${block.id}-part-${index}`,
    title: block.title,
    contentSegments: textToSegments(linesChunk.join("\n")),
    continuation: continuation || index > 0,
  });

  if (lines.length > 1) {
    return splitByLineGroups(block, lines, maxHeight, measure, (linesChunk, index) =>
      mapRow(linesChunk, index, block.continuation ?? false)
    , knownHeight);
  }

  return splitByCharSearch(block, maxHeight, measure, (chunk, index) =>
    mapRow([chunk], index, block.continuation ?? false)
  , knownHeight);
}

function estimateFits(
  candidate: CifLayoutBlock,
  maxHeight: number,
  measure: (candidate: CifLayoutBlock) => number,
  parentHeight?: number,
  parentBlock?: CifLayoutBlock
): boolean {
  const measured = measure(candidate);
  if (measured > 0) return measured <= maxHeight;
  if (!parentHeight || !parentBlock) return false;
  const parentText =
    parentBlock.kind === "prose"
      ? segmentsPlainText(parentBlock.segments)
      : parentBlock.kind === "recap-row"
        ? segmentsPlainText(parentBlock.contentSegments)
        : "";
  const candidateText =
    candidate.kind === "prose"
      ? segmentsPlainText(candidate.segments)
      : candidate.kind === "recap-row"
        ? segmentsPlainText(candidate.contentSegments)
        : "";
  if (!parentText || !candidateText) return false;
  const estimated = (candidateText.length / parentText.length) * parentHeight;
  return estimated <= maxHeight * 1.02;
}

function splitByLineGroups<T extends CifLayoutBlock>(
  block: T,
  lines: string[],
  maxHeight: number,
  measure: (candidate: CifLayoutBlock) => number,
  build: (linesChunk: string[], index: number) => T,
  parentHeight?: number
): T[] {
  const parts: T[] = [];
  let chunk: string[] = [];

  const flush = (index: number) => {
    if (chunk.length === 0) return;
    parts.push(build(chunk, index));
    chunk = [];
  };

  for (const line of lines) {
    const candidate = build([...chunk, line], parts.length);
    if (chunk.length > 0 && !estimateFits(candidate, maxHeight, measure, parentHeight, block)) {
      flush(parts.length);
      chunk = [line];
      const single = build(chunk, parts.length);
      if (!estimateFits(single, maxHeight, measure, parentHeight, block)) {
        const charParts = splitByCharSearch(
          single,
          maxHeight,
          measure,
          (text, index) => build([text], parts.length + index) as T,
          parentHeight
        );
        parts.push(...charParts);
        chunk = [];
      }
    } else {
      chunk.push(line);
    }
  }
  flush(parts.length);
  return parts.length > 0 ? parts : [block];
}

function splitByCharSearch<T extends CifLayoutBlock>(
  block: T,
  maxHeight: number,
  measure: (candidate: CifLayoutBlock) => number,
  build: (text: string, index: number) => T,
  parentHeight?: number
): T[] {
  const text =
    block.kind === "prose"
      ? segmentsPlainText(block.segments)
      : block.kind === "recap-row"
        ? segmentsPlainText(block.contentSegments)
        : "";
  if (!text) return [block];

  const parts: T[] = [];
  let remaining = text;
  let partIndex = 0;

  while (remaining.length > 0) {
    const tailCandidate = build(remaining, partIndex);
    if (estimateFits(tailCandidate, maxHeight, measure, parentHeight, block)) {
      parts.push(tailCandidate);
      break;
    }

    let lo = 1;
    let hi = remaining.length;
    let best = 1;

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      let cut = mid;
      const space = remaining.lastIndexOf(" ", mid);
      if (space > mid * 0.5) cut = space;

      const candidate = build(remaining.slice(0, cut).trimEnd(), partIndex);
      if (estimateFits(candidate, maxHeight, measure, parentHeight, block)) {
        best = cut;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (best <= 0) {
      parts.push(build(remaining.slice(0, 1), partIndex));
      remaining = remaining.slice(1).trimStart();
    } else {
      parts.push(build(remaining.slice(0, best).trimEnd(), partIndex));
      remaining = remaining.slice(best).trimStart();
    }
    partIndex += 1;
  }

  return parts.length > 0 ? parts : [block];
}

export function paginateSinglePage(
  page: ScpiLmPagePreview,
  heights: ReadonlyMap<string, number>,
  maxBodyHeight: number,
  measure: (block: CifLayoutBlock) => number
): ScpiLmPagePreview[] {
  let blocks = flattenPageToBlocks(page);
  blocks = blocks.flatMap((block) => {
    const knownHeight = heights.get(block.id) ?? measure(block);
    return splitOversizedBlock(block, maxBodyHeight, measure, knownHeight);
  });

  const mergedHeights = new Map(heights);
  for (const block of blocks) {
    if (!mergedHeights.has(block.id)) {
      const measured = measure(block);
      if (measured > 0) mergedHeights.set(block.id, measured);
    }
  }

  const packed = packBlocksIntoPages(blocks, mergedHeights, maxBodyHeight);
  return packed.map((pageBlocks) => blocksToPage(pageBlocks, page));
}

export function applyPaginationToPreview(
  preview: ScpiLettreMissionPreview,
  paginatedPages: ScpiLmPagePreview[]
): ScpiLettreMissionPreview {
  return {
    ...preview,
    pages: paginatedPages.map((p, index) => ({ ...p, pageNumber: index + 1 })),
  };
}

export function mergePaginatedPages(
  originalPages: readonly ScpiLmPagePreview[],
  replacements: ReadonlyMap<number, ScpiLmPagePreview[]>
): ScpiLmPagePreview[] {
  const result: ScpiLmPagePreview[] = [];
  originalPages.forEach((page, index) => {
    const replacement = replacements.get(index);
    if (replacement) {
      result.push(...replacement);
    } else {
      result.push(page);
    }
  });
  return result.map((p, index) => ({ ...p, pageNumber: index + 1 }));
}
