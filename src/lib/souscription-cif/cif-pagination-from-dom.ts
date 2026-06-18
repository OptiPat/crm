import type { ScpiLmPagePreview, ScpiLettreMissionPreview, SouscriptionPreviewSegment } from "@/lib/souscription-cif/render-template";
import {
  getCifDocumentBodyContentMaxHeightPx,
  getCifDocumentBodyContentWidthPx,
  cifMmToPx,
} from "@/lib/souscription-cif/document-page-layout";
import {
  CIF_RECAP_CONTINUATION_SUFFIX,
  pageNeedsPagination,
  segmentsPlainText,
  splitProseSegments,
  textToSegments,
} from "@/lib/souscription-cif/cif-pagination";

function splitTextByLineBudget(text: string, linesPerPage: number): string[] {
  const lines = text.split("\n");
  if (lines.length <= 1 || linesPerPage <= 0) return [text];

  const parts: string[] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    parts.push(lines.slice(i, i + linesPerPage).join("\n"));
  }
  return parts.filter((p) => p.length > 0);
}

function splitTextByCharBudget(text: string, charsPerPage: number): string[] {
  if (charsPerPage <= 0 || text.length <= charsPerPage) return [text];

  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= charsPerPage) {
      parts.push(remaining);
      break;
    }
    let cut = charsPerPage;
    const space = remaining.lastIndexOf(" ", cut);
    if (space > cut * 0.4) cut = space;
    parts.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  return parts.filter((p) => p.length > 0);
}

function paginateOversizedRecapRow(
  page: ScpiLmPagePreview,
  row: { title: string; contentSegments: SouscriptionPreviewSegment[] },
  maxHeight: number,
  rowElement: HTMLElement
): ScpiLmPagePreview[] {
  const text = segmentsPlainText(row.contentSegments);
  if (!text) return [page];

  const rowHeight = rowElement.offsetHeight || rowElement.scrollHeight;
  const lines = text.split("\n");
  const lineHeight = rowHeight / Math.max(lines.length, 1);
  let linesPerPage = Math.max(1, Math.floor(maxHeight / lineHeight) - 1);

  let parts = splitTextByLineBudget(text, linesPerPage);
  if (parts.length <= 1 && text.length > 0 && rowHeight > maxHeight) {
    const charsPerPage = Math.max(1, Math.floor(text.length * (maxHeight / rowHeight)));
    parts = splitTextByCharBudget(text, charsPerPage);
  }

  if (parts.length <= 1) return [page];

  return parts.map((part, index) => ({
    ...page,
    bodySegments: [],
    rapportRecapRows: [
      {
        title: index > 0 ? `${row.title}${CIF_RECAP_CONTINUATION_SUFFIX}` : row.title,
        contentSegments: textToSegments(part),
      },
    ],
    bodySegmentsAfterRecapTable:
      index === parts.length - 1 ? page.bodySegmentsAfterRecapTable : undefined,
    showAnnexesCostsTable: index === parts.length - 1 ? page.showAnnexesCostsTable : false,
    annexesCostsRows: index === parts.length - 1 ? page.annexesCostsRows : undefined,
    bodySegmentsAfterCostsTable:
      index === parts.length - 1 ? page.bodySegmentsAfterCostsTable : undefined,
    signatureColumns: index === parts.length - 1 ? page.signatureColumns : undefined,
  }));
}

function buildRecapGroupPage(
  page: ScpiLmPagePreview,
  rows: NonNullable<ScpiLmPagePreview["rapportRecapRows"]>,
  indices: number[],
  groupIndex: number,
  groupCount: number
): ScpiLmPagePreview {
  return {
    ...page,
    bodySegments: groupIndex === 0 ? page.bodySegments : [],
    rapportRecapTableHeader:
      groupIndex > 0 && page.rapportRecapTableHeader
        ? `${page.rapportRecapTableHeader}${CIF_RECAP_CONTINUATION_SUFFIX}`
        : page.rapportRecapTableHeader,
    rapportRecapRows: indices.map((i) => rows[i]!).filter(Boolean),
    bodySegmentsAfterRecapTable:
      groupIndex === groupCount - 1 ? page.bodySegmentsAfterRecapTable : undefined,
    showAnnexesCostsTable: groupIndex === groupCount - 1 ? page.showAnnexesCostsTable : false,
    annexesCostsRows: groupIndex === groupCount - 1 ? page.annexesCostsRows : undefined,
    bodySegmentsAfterCostsTable:
      groupIndex === groupCount - 1 ? page.bodySegmentsAfterCostsTable : undefined,
    signatureColumns: groupIndex === groupCount - 1 ? page.signatureColumns : undefined,
  };
}

function paginateRecapPageFromDom(
  page: ScpiLmPagePreview,
  bodyEl: HTMLElement,
  maxHeight: number
): ScpiLmPagePreview[] {
  const rows = page.rapportRecapRows ?? [];
  const table = bodyEl.querySelector(".cif-rm-recap-table");
  if (!table || rows.length === 0) return [page];

  const tableEl = table as HTMLElement;
  const thead = table.querySelector("thead");
  const headerHeight = (thead as HTMLElement | null)?.offsetHeight ?? 0;
  const tableOffsetTop = tableEl.offsetTop;
  const trs = [...table.querySelectorAll("tbody tr")] as HTMLElement[];

  if (trs.length === 1 && rows[0] && (trs[0]?.offsetHeight ?? 0) > maxHeight) {
    return paginateOversizedRecapRow(page, rows[0], maxHeight, trs[0]!);
  }

  const groups: number[][] = [];
  let current: number[] = [];
  let currentHeight = tableOffsetTop + headerHeight;

  trs.forEach((tr, index) => {
    const rowHeight = tr.offsetHeight || tr.scrollHeight;
    if (current.length > 0 && currentHeight + rowHeight > maxHeight) {
      groups.push(current);
      current = [index];
      currentHeight = headerHeight + rowHeight;
    } else {
      current.push(index);
      currentHeight += rowHeight;
    }
  });

  if (current.length > 0) groups.push(current);

  if (groups.length <= 1 && bodyEl.scrollHeight > maxHeight + 2) {
    if (rows.length > 1) {
      const rowsOnFirstPage = Math.max(
        1,
        Math.floor(rows.length * (maxHeight / bodyEl.scrollHeight))
      );
      if (rowsOnFirstPage < rows.length) {
        groups.length = 0;
        groups.push(
          Array.from({ length: rowsOnFirstPage }, (_, i) => i),
          Array.from({ length: rows.length - rowsOnFirstPage }, (_, i) => i + rowsOnFirstPage)
        );
      }
    } else if (rows[0] && trs[0]) {
      return paginateOversizedRecapRow(page, rows[0], maxHeight, trs[0]);
    }
  }

  if (groups.length <= 1) return [page];

  const pages: ScpiLmPagePreview[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const indices = groups[groupIndex]!;
    const groupPage = buildRecapGroupPage(page, rows, indices, groupIndex, groups.length);

    if (indices.length === 1) {
      const rowIndex = indices[0]!;
      const tr = trs[rowIndex];
      const row = rows[rowIndex];
      const overhead =
        groupIndex === 0 ? tableOffsetTop + headerHeight : headerHeight;
      const rowHeight = tr?.offsetHeight || tr?.scrollHeight || 0;
      if (row && tr && rowHeight > maxHeight - overhead) {
        pages.push(
          ...paginateOversizedRecapRow(
            groupPage,
            row,
            maxHeight - overhead,
            tr
          )
        );
        continue;
      }
    }

    pages.push(groupPage);
  }

  return pages.length > 1 ? pages : [page];
}

function paginateProsePageFromDom(
  page: ScpiLmPagePreview,
  bodyEl: HTMLElement,
  maxHeight: number
): ScpiLmPagePreview[] {
  const chunks = splitProseSegments(page.bodySegments);
  const proseEl = bodyEl.querySelector("[data-cif-prose]") as HTMLElement | null;
  const contentHeight = proseEl?.offsetHeight ?? bodyEl.scrollHeight;

  if (chunks.length > 1) {
    const packed: SouscriptionPreviewSegment[][] = [];
    let current: SouscriptionPreviewSegment[] = [];
    let currentHeight = 0;
    const totalTextLen = Math.max(segmentsPlainText(page.bodySegments).length, 1);

    for (const chunk of chunks) {
      const chunkText = segmentsPlainText(chunk);
      const estimatedHeight = contentHeight * (chunkText.length / totalTextLen);

      if (current.length > 0 && currentHeight + estimatedHeight > maxHeight) {
        packed.push(current);
        current = chunk;
        currentHeight = estimatedHeight;
      } else {
        current = current.length > 0 ? [...current, { kind: "text", value: "\n\n" }, ...chunk] : chunk;
        currentHeight += estimatedHeight;
      }
    }
    if (current.length > 0) packed.push(current);
    if (packed.length <= 1) return [page];
    return packed.map((segments) => ({ ...page, bodySegments: segments }));
  }

  const text = segmentsPlainText(page.bodySegments);
  const totalHeight = contentHeight;
  const lines = text.split("\n");
  const lineHeight = totalHeight / Math.max(lines.length, 1);
  let linesPerPage = Math.max(1, Math.floor(maxHeight / lineHeight));

  let parts = splitTextByLineBudget(text, linesPerPage);
  if (parts.length <= 1 && totalHeight > maxHeight) {
    const charsPerPage = Math.max(1, Math.floor(text.length * (maxHeight / totalHeight)));
    parts = splitTextByCharBudget(text, charsPerPage);
  }

  if (parts.length <= 1) return [page];

  return parts.map((part) => ({
    ...page,
    bodySegments: textToSegments(part),
  }));
}

/** Repli sans mesure fiable des <tr> (poids texte vs scrollHeight). */
function paginateRecapTextFallback(
  page: ScpiLmPagePreview,
  maxHeight: number,
  scrollHeight: number
): ScpiLmPagePreview[] {
  const rows = page.rapportRecapRows ?? [];
  if (rows.length === 0) return [page];

  const ratio = maxHeight / scrollHeight;
  const weights = rows.map((r) => Math.max(segmentsPlainText(r.contentSegments).length, 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const groups: number[][] = [];
  let current: number[] = [];
  let currentWeight = 0;

  for (let i = 0; i < rows.length; i++) {
    const w = weights[i]! / totalWeight;
    if (current.length > 0 && currentWeight + w > ratio * 0.92) {
      groups.push(current);
      current = [i];
      currentWeight = w;
    } else {
      current.push(i);
      currentWeight += w;
    }
  }
  if (current.length > 0) groups.push(current);

  if (groups.length <= 1 && rows.length > 1) {
    const rowsOnFirstPage = Math.max(1, Math.floor(rows.length * ratio));
    if (rowsOnFirstPage < rows.length) {
      groups.length = 0;
      groups.push(
        Array.from({ length: rowsOnFirstPage }, (_, i) => i),
        Array.from({ length: rows.length - rowsOnFirstPage }, (_, i) => i + rowsOnFirstPage)
      );
    }
  }

  if (groups.length <= 1) return [page];

  const pages: ScpiLmPagePreview[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const indices = groups[gi]!;
    const groupPage = buildRecapGroupPage(page, rows, indices, gi, groups.length);
    const isLastGroup = gi === groups.length - 1;

    if (indices.length === 1) {
      const rowIdx = indices[0]!;
      const row = rows[rowIdx]!;
      const text = segmentsPlainText(row.contentSegments);
      const rowShare = weights[rowIdx]! / totalWeight;
      if (text.length > 80 && rowShare > ratio * 0.85) {
        const charsPerPage = Math.max(80, Math.floor(text.length * (ratio / rowShare)));
        const parts = splitTextByCharBudget(text, charsPerPage);
        if (parts.length > 1) {
          for (let pi = 0; pi < parts.length; pi++) {
            const isLastPart = isLastGroup && pi === parts.length - 1;
            pages.push({
              ...groupPage,
              bodySegments: gi === 0 && pi === 0 ? page.bodySegments : [],
              rapportRecapRows: [
                {
                  title:
                    pi > 0 ? `${row.title}${CIF_RECAP_CONTINUATION_SUFFIX}` : row.title,
                  contentSegments: textToSegments(parts[pi]!),
                },
              ],
              bodySegmentsAfterRecapTable: isLastPart
                ? page.bodySegmentsAfterRecapTable
                : undefined,
              showAnnexesCostsTable: isLastPart ? page.showAnnexesCostsTable : false,
              annexesCostsRows: isLastPart ? page.annexesCostsRows : undefined,
              bodySegmentsAfterCostsTable: isLastPart
                ? page.bodySegmentsAfterCostsTable
                : undefined,
              signatureColumns: isLastPart ? page.signatureColumns : undefined,
            });
          }
          continue;
        }
      }
    }

    pages.push(groupPage);
  }

  return pages.length > 1 ? pages : [page];
}

type RecapRow = NonNullable<ScpiLmPagePreview["rapportRecapRows"]>[number];

function buildRawRecapRowMap(rawPages: ScpiLmPagePreview[]): Map<string, RecapRow> {
  const map = new Map<string, RecapRow>();
  for (const raw of rawPages) {
    for (const row of raw.rapportRecapRows ?? []) {
      map.set(row.title, row);
    }
  }
  return map;
}

function recapRowBaseTitle(title: string): string {
  return title.replace(CIF_RECAP_CONTINUATION_SUFFIX, "");
}

function resplitContinuationRecapRows(
  pages: ScpiLmPagePreview[],
  rawRowMap: Map<string, RecapRow>
): ScpiLmPagePreview[] {
  const result = pages.map((p) => ({ ...p, rapportRecapRows: p.rapportRecapRows?.map((r) => ({ ...r })) }));
  const splitTitles = new Set<string>();

  for (const page of pages) {
    for (const row of page.rapportRecapRows ?? []) {
      if (row.title.includes(CIF_RECAP_CONTINUATION_SUFFIX)) {
        splitTitles.add(recapRowBaseTitle(row.title));
      }
    }
  }

  for (const baseTitle of splitTitles) {
    const rawRow = rawRowMap.get(baseTitle);
    if (!rawRow) continue;

    const pageIndices: number[] = [];
    for (let i = 0; i < result.length; i++) {
      const rows = result[i]!.rapportRecapRows ?? [];
      if (rows.some((r) => recapRowBaseTitle(r.title) === baseTitle)) {
        pageIndices.push(i);
      }
    }
    if (pageIndices.length === 0) continue;

    const text = segmentsPlainText(rawRow.contentSegments);
    const charsPerPart = Math.max(1, Math.ceil(text.length / pageIndices.length));
    const parts = splitTextByCharBudget(text, charsPerPart);

    pageIndices.forEach((pageIdx, partIdx) => {
      const part = parts[partIdx] ?? parts[parts.length - 1] ?? "";
      const page = result[pageIdx]!;
      result[pageIdx] = {
        ...page,
        rapportRecapRows: (page.rapportRecapRows ?? []).map((row) => {
          if (recapRowBaseTitle(row.title) !== baseTitle) return row;
          return {
            title: partIdx > 0 ? `${baseTitle}${CIF_RECAP_CONTINUATION_SUFFIX}` : baseTitle,
            contentSegments: textToSegments(part),
          };
        }),
      };
    });
  }

  return result;
}

/**
 * Met à jour le texte depuis le preview brut sans modifier la structure (nombre de pages).
 */
export function overlayRawContentOnDisplayPages(
  displayPages: ScpiLmPagePreview[],
  rawPages: ScpiLmPagePreview[]
): ScpiLmPagePreview[] {
  if (displayPages.length === rawPages.length) {
    return rawPages.map((raw, index) => ({
      ...raw,
      pageNumber: displayPages[index]?.pageNumber ?? raw.pageNumber,
      dynamicPagination: displayPages[index]?.dynamicPagination ?? raw.dynamicPagination,
      paginationSliceId: displayPages[index]?.paginationSliceId ?? raw.paginationSliceId,
    }));
  }

  const footer = rawPages[0]?.footerSegments ?? [];
  const rawBySlice = new Map(
    rawPages
      .filter((p) => p.paginationSliceId)
      .map((p) => [p.paginationSliceId!, p] as const)
  );

  const result = displayPages.map((page) => ({ ...page, footerSegments: footer }));

  const sliceIndices = new Map<string, number[]>();
  result.forEach((page, index) => {
    if (!page.paginationSliceId) return;
    const list = sliceIndices.get(page.paginationSliceId) ?? [];
    list.push(index);
    sliceIndices.set(page.paginationSliceId, list);
  });

  for (const [sliceId, indices] of sliceIndices) {
    const raw = rawBySlice.get(sliceId);
    if (!raw) continue;

    if (raw.rapportRecapRows?.length) {
      applyRecapSliceOverlay(result, indices, raw);
    } else {
      applyProseSliceOverlay(result, indices, raw);
    }
  }

  for (let index = 0; index < result.length; index++) {
    const page = result[index]!;
    if (page.paginationSliceId) continue;
    const raw = rawPages.find((p) => p.pageNumber === page.pageNumber && !p.dynamicPagination);
    if (raw) {
      result[index] = { ...raw, pageNumber: page.pageNumber, footerSegments: footer };
    }
  }

  return result;
}

function applyProseSliceOverlay(
  result: ScpiLmPagePreview[],
  indices: number[],
  raw: ScpiLmPagePreview
): void {
  const text = segmentsPlainText(raw.bodySegments);
  if (!text) return;

  const parts =
    indices.length <= 1
      ? [text]
      : splitTextByCharBudget(text, Math.max(1, Math.ceil(text.length / indices.length)));

  indices.forEach((pageIndex, partIndex) => {
    const part = parts[partIndex] ?? parts[parts.length - 1] ?? "";
    const page = result[pageIndex]!;
    result[pageIndex] = {
      ...page,
      bodySegments: textToSegments(part),
      dynamicPagination: true,
      paginationSliceId: raw.paginationSliceId,
    };
  });
}

function applyRecapSliceOverlay(
  result: ScpiLmPagePreview[],
  indices: number[],
  raw: ScpiLmPagePreview
): void {
  const rawRowMap = buildRawRecapRowMap([raw]);

  for (const pageIndex of indices) {
    const page = result[pageIndex]!;
    if (!page.rapportRecapRows?.length) continue;

    result[pageIndex] = {
      ...page,
      rapportRecapRows: page.rapportRecapRows.map((row) => {
        const baseTitle = recapRowBaseTitle(row.title);
        const rawRow = rawRowMap.get(baseTitle);
        if (!rawRow || row.title.includes(CIF_RECAP_CONTINUATION_SUFFIX)) {
          return row;
        }
        const hasSuiteInSlice = indices.some((i) =>
          result[i]?.rapportRecapRows?.some(
            (r) => r.title === `${baseTitle}${CIF_RECAP_CONTINUATION_SUFFIX}`
          )
        );
        if (hasSuiteInSlice) return row;
        return { ...row, contentSegments: rawRow.contentSegments };
      }),
    };
  }

  const slicePages = indices.map((i) => result[i]!);
  const resplit = resplitContinuationRecapRows(slicePages, rawRowMap);
  indices.forEach((pageIndex, i) => {
    result[pageIndex] = {
      ...resplit[i]!,
      dynamicPagination: true,
      paginationSliceId: raw.paginationSliceId,
      footerSegments: raw.footerSegments,
    };
  });
}

/** Estimation hauteur tableau récap (sans DOM) — base pour repagination au chargement. */
export function estimateRecapPageScrollHeight(page: ScpiLmPagePreview): number {
  const rows = page.rapportRecapRows ?? [];
  if (rows.length === 0) return 0;

  const contentWidth = getCifDocumentBodyContentWidthPx();
  const labelChars = Math.max(10, Math.floor((contentWidth * 0.28) / 4.8));
  const cellChars = Math.max(20, Math.floor((contentWidth * 0.72) / 4.8));
  const lineHeightPx = Math.round(8 * 1.25 * (96 / 72));
  const tableMarginPx = cifMmToPx(4);
  const rowPaddingPx = cifMmToPx(3);

  let total = tableMarginPx;
  for (const row of rows) {
    const titleLines = Math.ceil(row.title.length / labelChars);
    const text = segmentsPlainText(row.contentSegments);
    const contentLines = text.split("\n").reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(Math.max(line.length, 1) / cellChars)),
      0
    );
    total += Math.max(titleLines, contentLines, 1) * lineHeightPx + rowPaddingPx;
  }

  if (page.bodySegmentsAfterRecapTable?.length) {
    total += cifMmToPx(10);
  }
  if (page.signatureColumns) {
    total += cifMmToPx(38);
  }

  return Math.round(total * 1.1);
}

/** Empreinte du contenu rédactionnel (déclenche repagination à l'édition). */
export function previewContentFingerprint(preview: ScpiLettreMissionPreview): string {
  return preview.pages
    .map((p) => {
      const rows =
        p.rapportRecapRows
          ?.map((r) => `${r.title}:${segmentsPlainText(r.contentSegments).length}`)
          .join(";") ?? "";
      return [
        rows,
        segmentsPlainText(p.bodySegments).length,
        segmentsPlainText(p.bodySegmentsAfterRecapTable ?? []).length,
        p.signatureColumns ? 1 : 0,
      ].join(":");
    })
    .join("§");
}

/** Repagination estimée (sans mesure DOM) — rapport récap et prose longue. */
export function paginatePageFromEstimate(page: ScpiLmPagePreview): ScpiLmPagePreview[] {
  const maxHeight = getCifDocumentBodyContentMaxHeightPx();
  if (maxHeight <= 0) return [page];
  const usableHeight = Math.floor(maxHeight * 0.95);

  if (page.rapportRecapRows?.length) {
    const estScroll = estimateRecapPageScrollHeight(page);
    if (estScroll > usableHeight) {
      const split = paginateRecapTextFallback(page, usableHeight, estScroll);
      if (split.length > 1) return split;
    }
    return [page];
  }

  if (page.bodySegments.length > 0 && pageNeedsPagination(page)) {
    const text = segmentsPlainText(page.bodySegments);
    const lineHeightPx = Math.round(10 * 1.15 * (96 / 72));
    const charsPerLine = 85;
    const estLines = Math.ceil(text.length / charsPerLine) + text.split("\n").length;
    const estScroll = estLines * lineHeightPx;
    if (estScroll > usableHeight && text.length > 80) {
      const ratio = usableHeight / estScroll;
      const charsPerPage = Math.max(80, Math.floor(text.length * ratio));
      const parts = splitTextByCharBudget(text, charsPerPage);
      if (parts.length > 1) {
        return parts.map((part) => ({ ...page, bodySegments: textToSegments(part) }));
      }
    }
  }

  return [page];
}

/** Repagine une page à partir du DOM réel (scrollHeight vs clientHeight du corps A4). */
export function paginatePageFromLiveBody(
  page: ScpiLmPagePreview,
  bodyEl: HTMLElement
): ScpiLmPagePreview[] {
  let maxHeight = bodyEl.clientHeight;
  if (maxHeight <= 0) {
    maxHeight = getCifDocumentBodyContentMaxHeightPx();
  }
  if (bodyEl.scrollHeight <= maxHeight + 2) return [page];

  if (page.rapportRecapRows?.length) {
    const split = paginateRecapPageFromDom(page, bodyEl, maxHeight);
    if (split.length > 1) return split;
    return paginateRecapTextFallback(page, maxHeight, bodyEl.scrollHeight);
  }

  if (page.bodySegments.length > 0) {
    return paginateProsePageFromDom(page, bodyEl, maxHeight);
  }

  return [page];
}
