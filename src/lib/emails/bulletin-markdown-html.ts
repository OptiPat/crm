/** Markdown court (résumés SCPI Mistral) → HTML Gmail-safe pour {{bulletin_resume_html}}. */

const GMAIL_LINE = "line-height:1.5;margin:0;padding:0";

function lineDiv(inner: string, extraStyle = ""): string {
  const style = extraStyle ? `${GMAIL_LINE};${extraStyle}` : GMAIL_LINE;
  return `<div style="${style}">${inner}</div>`;
}

function blankLine(): string {
  return `<div style="${GMAIL_LINE}"><br></div>`;
}

const SUBSECTION_TITLES = ["Chiffres clés", "Ce trimestre", "Acquisitions"] as const;

function subsectionTitleCandidate(rest: string): string {
  return rest.trim().replace(/:\s*$/, "").trim();
}

function foldSubsectionKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function isSubsectionTitle(rest: string): boolean {
  return canonicalSubsectionTitle(rest) !== null;
}

function canonicalSubsectionTitle(rest: string): (typeof SUBSECTION_TITLES)[number] | null {
  const key = foldSubsectionKey(subsectionTitleCandidate(rest));
  if (key === "chiffres cles") return "Chiffres clés";
  if (key === "ce trimestre") return "Ce trimestre";
  if (key === "acquisitions") return "Acquisitions";
  return null;
}

function subsectionDisplayNumber(title: (typeof SUBSECTION_TITLES)[number]): number {
  if (title === "Chiffres clés") return 1;
  if (title === "Ce trimestre") return 2;
  return 3;
}

function looksLikePeriodLabel(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (/^t[1-4](\s+20\d{2})?$/i.test(t)) return true;
  if (/^20\d{2}$/.test(t)) return true;
  if (lower.includes("trimestre") || lower.includes("semestre")) return true;
  if (/^t[1-4]\s+20\d{2}$/i.test(t)) return true;
  return false;
}

function periodPartAfterDash(line: string, dashIdx: number): string {
  return line
    .slice(dashIdx + 1)
    .trim()
    .replace(/^[–—-]\s*/, "");
}

function looksLikeProductPeriodLine(s: string): boolean {
  const t = s.trim();
  if (!t || isSubsectionTitle(t) || t.startsWith("- ") || t.startsWith("* ")) {
    return false;
  }
  // Ligne d'acquisition « Pays : ville, … » — pas un titre SCPI.
  if (t.includes(":") && !/[–—]/.test(t)) return false;
  for (const dash of ["–", "—", "-"] as const) {
    const idx = t.indexOf(dash);
    if (idx <= 0 || idx >= t.length - 1) continue;
    const period = periodPartAfterDash(t, idx);
    if (looksLikePeriodLabel(period)) return true;
    // Titre SCPI dont la période OCR est coupée (« Comète – T » + « 2026 » lignes suivantes).
    if (period.length <= 6 && !period.includes(":")) return true;
  }
  return false;
}

function unwrapMistralMarkdownLine(line: string): string {
  let t = line.trim();
  if (!t || t === "**" || t === "*" || t === "***") return "";
  if (t.startsWith("**") && t.endsWith("**") && t.length > 4) {
    return t.slice(2, -2).trim();
  }
  while (t.startsWith("**")) {
    t = t.slice(2).trimStart();
  }
  while (t.endsWith("**")) {
    t = t.slice(0, -2).trimEnd();
  }
  return t;
}

function normalizeSubsectionLine(line: string): string {
  const trimmed = unwrapMistralMarkdownLine(line);
  if (!trimmed) return "";
  const titleOnly = canonicalSubsectionTitle(trimmed);
  if (titleOnly) {
    return `${subsectionDisplayNumber(titleOnly)}. ${titleOnly}`;
  }
  const dotIdx = trimmed.indexOf(".");
  if (dotIdx <= 0) return trimmed;
  const num = Number.parseInt(trimmed.slice(0, dotIdx).trim(), 10);
  if (!Number.isFinite(num) || num < 1 || num > 4) return trimmed;
  const rest = trimmed.slice(dotIdx + 1).trim();
  const title = canonicalSubsectionTitle(rest);
  if (!title) return trimmed;
  return `${subsectionDisplayNumber(title)}. ${title}`;
}

function shouldUseCrmPeriode(periodClean: string, periode: string): boolean {
  if (!periode.trim()) return false;
  const lower = periodClean.toLowerCase();
  if (lower.includes("trimestre") || lower.includes("semestre")) return true;
  return periodClean.length < 4 || !/\d/.test(periodClean);
}

function normalizeDashChars(s: string): string {
  return s.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "–");
}

function stripTitleMarkdownArtifacts(line: string): string {
  let s = normalizeDashChars(line.trim());
  if (s.startsWith("## ")) {
    s = s.slice(3).trim();
  } else if (s.startsWith("1.")) {
    s = s.slice(2).trim();
  }
  while (s.endsWith("**")) {
    s = s.slice(0, -2).trimEnd();
  }
  return s;
}

function productTitleDetectionLine(line: string): string {
  let s = stripTitleMarkdownArtifacts(line).replace(/^\*\*|\*\*$/g, "").trim();
  if (s.startsWith("- ") || s.startsWith("* ")) {
    s = s.slice(2).trim();
  }
  return s;
}

function foldProductTitleKey(line: string, periode = ""): string {
  const bare = formatProductTitleLine(line, "", periode)
    .replace(/^##\s+/, "")
    .trim()
    .replace(/–/g, "-");
  return foldSubsectionKey(bare);
}

function preferProductTitleLine(candidate: string, current: string): boolean {
  const c = candidate.trim();
  const cur = current.trim();
  if (c.startsWith("## ") && !cur.startsWith("## ")) return true;
  if (!c.startsWith("## ") && cur.startsWith("## ")) return false;
  const accentCount = (s: string) => (s.match(/[àâäéèêëïîôùûüç]/gi) ?? []).length;
  const cAccents = accentCount(c);
  const curAccents = accentCount(cur);
  if (cAccents !== curAccents) return cAccents > curAccents;
  return c.length > cur.length;
}

function titleDedupKey(line: string, periode = ""): string {
  return foldProductTitleKey(line, periode);
}

function stripTrailingProductTitleLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0) {
    const t = (lines[end - 1] ?? "").trim();
    if (!t) {
      end -= 1;
      continue;
    }
    if (isProductTitleLine(t)) {
      end -= 1;
      continue;
    }
    break;
  }
  return lines.slice(0, end);
}

function stripTrailingDuplicateTitle(text: string, periode = ""): string {
  const lines = stripTrailingProductTitleLines(text.split("\n"));
  return lines.join("\n");
}

function dedupeProductTitleLines(lines: string[], periode = ""): string[] {
  const out: string[] = [];
  const seenInBlock = new Set<string>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const t = line.trim();
    if (t === "---") {
      seenInBlock.clear();
      out.push(line);
      i += 1;
      continue;
    }
    if (isProductTitleLine(t)) {
      const key = foldProductTitleKey(t, periode);
      let best = line;
      let j = i + 1;
      while (j < lines.length) {
        const tj = (lines[j] ?? "").trim();
        if (!tj) {
          j += 1;
          continue;
        }
        if (!isProductTitleLine(tj)) break;
        if (foldProductTitleKey(tj, periode) !== key) break;
        if (preferProductTitleLine(lines[j]!, best)) best = lines[j]!;
        j += 1;
      }
      if (seenInBlock.has(key)) {
        i = j;
        continue;
      }
      seenInBlock.add(key);
      out.push(best);
      i = j;
      continue;
    }
    out.push(line);
    i += 1;
  }
  return out;
}

function removeEmptySubsectionHeadings(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i]?.trim() ?? "";
    if (isSubsectionHeadingLine(t)) {
      let j = i + 1;
      while (j < lines.length && !lines[j]?.trim()) j += 1;
      const next = lines[j]?.trim() ?? "";
      if (
        !next ||
        isSubsectionHeadingLine(next) ||
        next.startsWith("## ") ||
        isProductTitleLine(next)
      ) {
        continue;
      }
    }
    out.push(lines[i]!);
  }
  return out;
}

function isProductTitleLine(line: string): boolean {
  return looksLikeProductPeriodLine(productTitleDetectionLine(line));
}

function formatProductTitleLine(line: string, displayName: string, periode = ""): string {
  const rest = productTitleDetectionLine(line);
  const dashIdx = (["–", "—", "-"] as const)
    .map((d) => rest.indexOf(d))
    .find((idx) => idx > 0) ?? -1;
  if (dashIdx < 0) {
    const name = displayName.trim() || rest;
    return periode.trim() ? `## ${name} – ${periode.trim()}` : `## ${name}`;
  }
  const dash = rest[dashIdx]!;
  const periodClean = rest.slice(dashIdx + 1).trim().replace(/^[–—-]\s*/, "");
  const name = displayName.trim() || rest.slice(0, dashIdx).trim();
  if (shouldUseCrmPeriode(periodClean, periode)) {
    return `## ${name} ${dash} ${periode.trim()}`;
  }
  return `## ${name} ${dash} ${periodClean}`;
}

function preprocessMistralBulletinLine(line: string): string | null {
  const t = line.trim();
  if (!t) return "";
  if (t === "-" || t === "–" || t === "—" || t === "**" || t === "*" || t === "***") {
    return null;
  }
  if (t.startsWith("- ") || t.startsWith("* ")) {
    const rest = unwrapMistralMarkdownLine(t.slice(2).trim());
    if (/^[1-4]\.\s+/.test(rest)) return rest;
    return line;
  }
  return unwrapMistralMarkdownLine(line);
}

function removeSplitPeriodFragments(lines: string[]): string[] {
  if (lines.length === 0) return lines;
  const first = lines[0]?.trim() ?? "";
  if (!isProductTitleLine(first)) return lines;
  const rest = stripTitleMarkdownArtifacts(first);
  const dashIdx = (["–", "—", "-"] as const)
    .map((d) => rest.indexOf(d))
    .find((idx) => idx > 0) ?? -1;
  const periodClean =
    dashIdx >= 0 ? rest.slice(dashIdx + 1).trim().replace(/^[–—-]\s*/, "") : "";
  if (periodClean.length >= 4 && /\d/.test(periodClean)) return lines;
  let skip = 1;
  while (skip < lines.length) {
    const t = lines[skip]?.trim() ?? "";
    if (!t) {
      skip += 1;
      continue;
    }
    if (t.length <= 4 && /^\d+$/.test(t)) {
      skip += 1;
      continue;
    }
    break;
  }
  if (skip <= 1) return lines;
  return [lines[0]!, ...lines.slice(skip)];
}

export function normalizeScpiBulletinMarkdown(
  markdown: string,
  displayName = "",
  periode = "",
  ensureProductHeader = true
): string {
  const lines = removeSplitPeriodFragments(
    mergeOrphanYearWithPreviousLine(
      collapseVerticalYearLines(markdown).replace(/\r\n/g, "\n").split("\n")
    )
  );
  let start = 0;
  while (start < lines.length) {
    const t = lines[start]?.trim() ?? "";
    if (t.startsWith("## ") && !looksLikeProductPeriodLine(t.slice(3).trim())) {
      start += 1;
      continue;
    }
    if (t.startsWith("## ") && looksLikeProductPeriodLine(t.slice(3).trim())) break;
    if (t.startsWith("1.") && looksLikeProductPeriodLine(t.slice(2).trim())) break;
    if (looksLikeProductPeriodLine(productTitleDetectionLine(t))) break;
    if (!t) {
      start += 1;
      continue;
    }
    break;
  }

  const out: string[] = [];
  let sawProductTitle = false;
  for (const line of lines.slice(start)) {
    const preprocessed = preprocessMistralBulletinLine(line);
    if (preprocessed === null) continue;
    if (!preprocessed.trim()) {
      if (out.length > 0 && out[out.length - 1]?.trim()) out.push("");
      continue;
    }
    const expanded = fixGluedYearSubsection(preprocessed);
    let normalized = normalizeSubsectionLine(expanded);
    if (isProductTitleLine(normalized)) {
      normalized = formatProductTitleLine(normalized, displayName, periode);
      sawProductTitle = true;
    }
    out.push(normalized);
  }

  const body = removeEmptySubsectionHeadings(
    prefixAcquisitionBullets(dedupeProductTitleLines(out, periode))
  )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!sawProductTitle && ensureProductHeader && displayName.trim()) {
    return `## ${displayName.trim()} – ${periode.trim()}\n\n${body}`.trim();
  }
  return stripTrailingDuplicateTitle(body, periode);
}

export function normalizeScpiBulletinDigest(markdown: string, periode = ""): string {
  const blocks = markdown.split(/\n---\n/);
  if (blocks.length <= 1) {
    return normalizeScpiBulletinMarkdown(markdown, "", periode, false);
  }
  return blocks
    .map((block) => normalizeScpiBulletinMarkdown(block.trim(), "", periode, true))
    .filter(Boolean)
    .join("\n\n---\n\n");
}

function fixGluedYearSubsection(line: string): string {
  return line.replace(
    /(\d{4})([1-4]\.\s+(?:Chiffres clés|Ce trimestre|Acquisitions))/g,
    "$1\n$2"
  );
}

function collapseVerticalYearLines(markdown: string): string {
  let s = markdown.replace(/\r\n/g, "\n");
  s = s.replace(
    /(?:^|\n)(\d)\s*\n\s*(\d)\s*\n\s*(\d)\s*\n\s*(\d)([.,;:)\s]|$)/g,
    (match, a, b, c, d, after) => {
      const year = `${a}${b}${c}${d}`;
      return /^20[0-9]{2}$/.test(year) ? `\n${year}${after}` : match;
    }
  );
  s = s.replace(
    /(?:^|\n)(\d)\s*\n\s*(\d)\s*\n\s*(\d)\s*\n\s*(\d)\s*(?=\n)/g,
    (match, a, b, c, d) => {
      const year = `${a}${b}${c}${d}`;
      return /^20[0-9]{2}$/.test(year) ? `\n${year}` : match;
    }
  );
  return s;
}

function mergeOrphanYearWithPreviousLine(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length >= 4 && /^20\d{2}/.test(trimmed)) {
      const year = trimmed.slice(0, 4);
      const prev = out[out.length - 1];
      if (prev && !prev.trim().endsWith(year)) {
        out[out.length - 1] = `${prev} ${trimmed}`;
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

const INLINE_SUBSECTION_LOOKAHEAD =
  /(?=[1-4]\.\s+(?:Chiffres clés|Ce trimestre|Acquisitions))/g;

function expandInlineNumberedSections(line: string): string[] {
  const fixed = fixGluedYearSubsection(line);
  if (!INLINE_SUBSECTION_LOOKAHEAD.test(fixed)) return [fixed];
  INLINE_SUBSECTION_LOOKAHEAD.lastIndex = 0;
  const parts = fixed
    .split(INLINE_SUBSECTION_LOOKAHEAD)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [fixed];
}

function isSubsectionHeadingLine(trimmed: string): boolean {
  const m = trimmed.match(/^([1-3])\.\s+(.+)$/i);
  if (!m) return false;
  return canonicalSubsectionTitle(m[2]!) !== null;
}

function subsectionHeadingCanonical(trimmed: string): (typeof SUBSECTION_TITLES)[number] | null {
  const m = trimmed.match(/^([1-3])\.\s+(.+)$/i);
  if (!m) return null;
  return canonicalSubsectionTitle(m[2]!);
}

function isAcquisitionContentLine(trimmed: string): boolean {
  if (!trimmed || /^[-*]\s+/.test(trimmed)) return false;
  if (isSubsectionHeadingLine(trimmed)) return false;
  if (trimmed.startsWith("## ") || isProductTitleLine(trimmed)) return false;
  if (/^---+$/.test(trimmed)) return false;
  return /^[^:\n]+,\s+[^:\n]+:\s+.+/.test(trimmed);
}

function prefixAcquisitionBullets(lines: string[]): string[] {
  const out: string[] = [];
  let inAcquisitions = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const section = subsectionHeadingCanonical(trimmed);
    if (section) {
      inAcquisitions = section === "Acquisitions";
      out.push(line);
      continue;
    }
    if (trimmed.startsWith("## ") || isProductTitleLine(trimmed)) {
      inAcquisitions = false;
      out.push(line);
      continue;
    }
    if (inAcquisitions && isAcquisitionContentLine(trimmed)) {
      out.push(`- ${trimmed}`);
      continue;
    }
    out.push(line);
  }
  return out;
}

function renderProductTitleHtml(title: string): string {
  return lineDiv(
    `<strong style="font-size:1.1em">${inlineMarkdownToHtml(title)}</strong>`,
    "margin-top:14px"
  );
}

function canonicalizeTitleLinesForRender(lines: string[], periode: string): string[] {
  return lines.map((line) => {
    const t = line.trim();
    if (!t || t === "---") return line;
    if (isProductTitleLine(t)) {
      return formatProductTitleLine(t, "", periode);
    }
    return line;
  });
}

function bulletinLinesForRender(
  markdown: string,
  prepared = false,
  periode = ""
): string[] {
  const raw = prepared
    ? markdown.replace(/\r\n/g, "\n").split("\n")
    : normalizeBulletinMarkdown(markdown);
  return prefixAcquisitionBullets(
    canonicalizeTitleLinesForRender(
      stripTrailingProductTitleLines(dedupeProductTitleLines(raw, periode)),
      periode
    )
  );
}

function normalizeBulletinMarkdown(markdown: string): string[] {
  const normalized = normalizeScpiBulletinDigest(markdown);
  const lines: string[] = [];
  for (const raw of normalized.replace(/\r\n/g, "\n").split("\n")) {
    for (const segment of expandInlineNumberedSections(raw)) {
      const normalizedLine = normalizeSubsectionLine(segment);
      if (normalizedLine.trim()) lines.push(normalizedLine);
    }
  }
  return lines;
}

export function bulletinMarkdownToHtml(
  markdown: string,
  prepared = false,
  periode = ""
): string {
  const lines = bulletinLinesForRender(markdown, prepared, periode);
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i]?.trim() ?? "";

    if (!trimmed) {
      blocks.push(blankLine());
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push(
        '<div style="line-height:1.5;margin:0;padding:0;border-top:1px solid #e5e7eb;margin-top:14px;margin-bottom:14px"></div>'
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push(renderProductTitleHtml(trimmed.slice(3)));
      i += 1;
      continue;
    }

    if (isProductTitleLine(trimmed) && !isSubsectionHeadingLine(trimmed)) {
      blocks.push(renderProductTitleHtml(productTitleDetectionLine(trimmed)));
      i += 1;
      continue;
    }

    if (isSubsectionHeadingLine(trimmed)) {
      blocks.push(
        lineDiv(`<strong>${inlineMarkdownToHtml(trimmed)}</strong>`, "margin-top:10px")
      );
      i += 1;
      continue;
    }

    if (/^\*\*.+\*\*$/.test(trimmed)) {
      blocks.push(lineDiv(inlineMarkdownToHtml(trimmed), "font-weight:700;margin-top:10px"));
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed) || isAcquisitionContentLine(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const row = (lines[i] ?? "").trim();
        if (!row) break;
        if (/^[-*]\s+/.test(row)) {
          items.push(
            `<li style="margin:0;padding:0;line-height:1.5">${inlineMarkdownToHtml(row.replace(/^[-*]\s+/, ""))}</li>`
          );
          i += 1;
          continue;
        }
        if (isAcquisitionContentLine(row)) {
          items.push(
            `<li style="margin:0;padding:0;line-height:1.5">${inlineMarkdownToHtml(row)}</li>`
          );
          i += 1;
          continue;
        }
        break;
      }
      blocks.push(
        `<ul style="margin:4px 0;padding-left:1.25em;line-height:1.5">${items.join("")}</ul>`
      );
      continue;
    }

    blocks.push(lineDiv(inlineMarkdownToHtml(trimmed)));
    i += 1;
  }

  return blocks.join("");
}

export function bulletinMarkdownToPlainEmail(
  markdown: string,
  prepared = false,
  periode = ""
): string {
  const lines = bulletinLinesForRender(markdown, prepared, periode);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = (lines[i] ?? "").trim();
    if (!trimmed) {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      i += 1;
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      out.push("", "—", "");
      i += 1;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      out.push("", trimmed.slice(3).replace(/\*\*(.+?)\*\*/g, "$1"), "");
      i += 1;
      continue;
    }
    if (isProductTitleLine(trimmed) && !isSubsectionHeadingLine(trimmed)) {
      out.push("", productTitleDetectionLine(trimmed), "");
      i += 1;
      continue;
    }
    if (isSubsectionHeadingLine(trimmed)) {
      out.push(trimmed.replace(/\*\*(.+?)\*\*/g, "$1"));
      i += 1;
      continue;
    }
    if (/^[-*]\s+/.test(trimmed) || isAcquisitionContentLine(trimmed)) {
      while (i < lines.length) {
        const row = (lines[i] ?? "").trim();
        if (!row) break;
        if (/^[-*]\s+/.test(row) || isAcquisitionContentLine(row)) {
          out.push(`• ${row.replace(/^[-*]\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1")}`);
          i += 1;
          continue;
        }
        break;
      }
      continue;
    }
    out.push(trimmed.replace(/\*\*(.+?)\*\*/g, "$1"));
    i += 1;
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdownToHtml(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return out;
}
