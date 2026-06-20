/** Markdown court (résumés n8n SCPI) → HTML Gmail-safe pour {{bulletin_resume_html}}. */

const GMAIL_LINE = "line-height:1.5;margin:0;padding:0";

function lineDiv(inner: string, extraStyle = ""): string {
  const style = extraStyle ? `${GMAIL_LINE};${extraStyle}` : GMAIL_LINE;
  return `<div style="${style}">${inner}</div>`;
}

function blankLine(): string {
  return `<div style="${GMAIL_LINE}"><br></div>`;
}

/** Mistral colle parfois « 20262. Chiffres » — on repère les sous-sections numérotées. */
function expandInlineNumberedSections(line: string): string[] {
  if (!/\d+\.\s+/.test(line)) return [line];
  const parts = line.split(/(?=\d+\.\s+)/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [line];
}

function normalizeBulletinMarkdown(markdown: string): string[] {
  const lines: string[] = [];
  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    for (const segment of expandInlineNumberedSections(raw)) {
      lines.push(segment);
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
