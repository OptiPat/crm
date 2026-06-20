/** Markdown court (résumés n8n SCPI) → HTML Gmail-safe pour {{bulletin_resume_html}}. */

const GMAIL_LINE = "line-height:1.5;margin:0;padding:0";

function lineDiv(inner: string, extraStyle = ""): string {
  const style = extraStyle ? `${GMAIL_LINE};${extraStyle}` : GMAIL_LINE;
  return `<div style="${style}">${inner}</div>`;
}

function blankLine(): string {
  return `<div style="${GMAIL_LINE}"><br></div>`;
}

const SUBSECTION_TITLES = ["Chiffres clés", "Ce trimestre", "Acquisitions"] as const;

function isSubsectionTitle(rest: string): boolean {
  const r = rest.trim();
  return SUBSECTION_TITLES.some((title) => r.toLowerCase() === title.toLowerCase());
}

function normalizeSubsectionLine(line: string): string {
  const trimmed = line.trim();
  const dotIdx = trimmed.indexOf(".");
  if (dotIdx <= 0) return line;
  const num = Number.parseInt(trimmed.slice(0, dotIdx).trim(), 10);
  if (!Number.isFinite(num) || num < 2 || num > 9) return line;
  const rest = trimmed.slice(dotIdx + 1).trim();
  if (!isSubsectionTitle(rest)) return line;
  return `**${rest}**`;
}

function fixProductTitleLine(line: string, displayName: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith("1.")) return line;
  const rest = trimmed.slice(2).trim();
  const dashIdx = rest.search(/[–-]/);
  if (dashIdx < 0) return `1. ${displayName.trim()}`;
  const dash = rest[dashIdx];
  const period = rest.slice(dashIdx + 1).trim();
  return `1. ${displayName.trim()} ${dash} ${period}`;
}

/** Nettoie le markdown Mistral/n8n avant rendu email (aligné Rust build_bulletin_resume). */
export function normalizeScpiBulletinMarkdown(
  markdown: string,
  displayName = ""
): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const hasNumberedTitle = lines.some((l) => l.trim().startsWith("1."));
  let start = 0;
  if (hasNumberedTitle) {
    while (start < lines.length && lines[start]?.trim().startsWith("## ")) start += 1;
    while (start < lines.length && !lines[start]?.trim()) start += 1;
  }

  const out: string[] = [];
  let firstContent = true;
  for (const line of lines.slice(start)) {
    if (!line.trim()) {
      if (out.length > 0 && out[out.length - 1]?.trim()) out.push("");
      continue;
    }
    const expanded = fixGluedYearSubsection(line);
    let normalized = normalizeSubsectionLine(expanded);
    if (firstContent && normalized.trim().startsWith("1.") && displayName.trim()) {
      normalized = fixProductTitleLine(normalized, displayName);
    }
    firstContent = false;
    out.push(normalized);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeScpiBulletinDigest(markdown: string): string {
  const blocks = markdown.split(/\n---\n/);
  if (blocks.length <= 1) {
    return normalizeScpiBulletinMarkdown(markdown);
  }
  return blocks
    .map((block) => normalizeScpiBulletinMarkdown(block.trim()))
    .filter(Boolean)
    .join("\n\n---\n\n");
}

/** Mistral colle « 20262. Chiffres » (année + section) sur une seule ligne. */
function fixGluedYearSubsection(line: string): string {
  return line.replace(
    /(\d{4})([2-9]\.\s+(?:Chiffres clés|Ce trimestre|Acquisitions))/g,
    "$1\n$2"
  );
}

/** Mistral colle parfois « 20262. Chiffres » — on repère les sous-sections numérotées. */
function expandInlineNumberedSections(line: string): string[] {
  const fixed = fixGluedYearSubsection(line);
  if (!/\d+\.\s+/.test(fixed)) return [fixed];
  const parts = fixed.split(/(?=\d+\.\s+)/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [fixed];
}

function normalizeBulletinMarkdown(markdown: string): string[] {
  const normalized = normalizeScpiBulletinDigest(markdown);
  const lines: string[] = [];
  for (const raw of normalized.replace(/\r\n/g, "\n").split("\n")) {
    for (const segment of expandInlineNumberedSections(raw)) {
      lines.push(normalizeSubsectionLine(segment));
    }
  }
  return lines;
}

export function bulletinMarkdownToHtml(markdown: string): string {
  const lines = normalizeBulletinMarkdown(markdown);
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
      blocks.push(
        lineDiv(inlineMarkdownToHtml(trimmed.slice(3)), "font-weight:700;margin-top:14px")
      );
      i += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      blocks.push(
        lineDiv(inlineMarkdownToHtml(trimmed), "font-weight:700;margin-top:12px")
      );
      i += 1;
      continue;
    }

    if (/^\*\*.+\*\*$/.test(trimmed)) {
      blocks.push(
        lineDiv(inlineMarkdownToHtml(trimmed), "font-weight:700;margin-top:10px")
      );
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? "").trim())) {
        const bullet = (lines[i] ?? "").trim().replace(/^[-*]\s+/, "");
        items.push(
          `<li style="margin:0;padding:0;line-height:1.5">${inlineMarkdownToHtml(bullet)}</li>`
        );
        i += 1;
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

/** Version lisible pour le corps texte brut ({{bulletin_resume}}). */
export function bulletinMarkdownToPlainEmail(markdown: string): string {
  const lines = normalizeBulletinMarkdown(markdown);
  const out: string[] = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      out.push("", "—", "");
      continue;
    }
    if (trimmed.startsWith("## ")) {
      out.push("", trimmed.slice(3).replace(/\*\*(.+?)\*\*/g, "$1"), "");
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      out.push(`• ${trimmed.replace(/^[-*]\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1")}`);
      continue;
    }
    out.push(trimmed.replace(/\*\*(.+?)\*\*/g, "$1"));
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
