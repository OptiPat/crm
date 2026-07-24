import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const docsDir = path.join(rootDir, "docs");
const outputDir = path.join(docsDir, "pdf");

const guides = [
  {
    source: "TUTORIEL_MODE_EQUIPE_ASSISTANTES.md",
    output: "TUTORIEL_MODE_EQUIPE_ASSISTANTES.pdf",
    shortTitle: "Tutoriel mode équipe SharePoint",
  },
  {
    source: "FICHE_CONFIGURATION_MODE_EQUIPE.md",
    output: "FICHE_CONFIGURATION_MODE_EQUIPE.pdf",
    shortTitle: "Fiche de configuration",
  },
  {
    source: "FICHE_BRANCHEMENT_ASSISTANTE.md",
    output: "FICHE_BRANCHEMENT_ASSISTANTE.pdf",
    shortTitle: "Fiche de branchement assistante",
  },
  {
    source: "CHECKLIST_PILOTE_MODE_EQUIPE.md",
    output: "CHECKLIST_PILOTE_MODE_EQUIPE.pdf",
    shortTitle: "Checklist pilote mode équipe",
  },
];

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 17;
const TOP = 18;
const BOTTOM = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const COLORS = {
  primary: [31, 78, 121],
  secondary: [68, 85, 102],
  text: [28, 35, 42],
  muted: [100, 110, 120],
  light: [242, 246, 249],
  border: [205, 215, 224],
};

function cleanInlineMarkdown(value) {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
      href.startsWith("http") ? `${label} (${href})` : label
    )
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/→/g, "->")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/☐/g, "[ ]")
    .replace(/☑/g, "[x]")
    .replace(/\u00a0/g, " ")
    .trim();
}

function isStructuralLine(line) {
  const trimmed = line.trim();
  return (
    trimmed === "" ||
    /^#{1,4}\s/.test(trimmed) ||
    /^[-*]\s/.test(trimmed) ||
    /^\d+\.\s/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^```/.test(trimmed) ||
    /^\|.*\|$/.test(trimmed)
  );
}

function parseMarkdown(markdown) {
  const input = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;
  let inCode = false;
  let codeLines = [];

  while (index < input.length) {
    const raw = input[index];
    const trimmed = raw.trim();

    if (/^```/.test(trimmed)) {
      if (inCode) {
        blocks.push({ type: "code", lines: codeLines });
        codeLines = [];
      }
      inCode = !inCode;
      index += 1;
      continue;
    }

    if (inCode) {
      codeLines.push(raw);
      index += 1;
      continue;
    }

    if (!trimmed) {
      blocks.push({ type: "space" });
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: cleanInlineMarkdown(heading[2]),
      });
      index += 1;
      continue;
    }

    if (/^\|.*\|$/.test(trimmed)) {
      const rows = [];
      while (index < input.length && /^\|.*\|$/.test(input[index].trim())) {
        const row = input[index].trim();
        if (!/^\|(?:\s*:?-+:?\s*\|)+$/.test(row)) {
          rows.push(
            row
              .slice(1, -1)
              .split("|")
              .map((cell) => cleanInlineMarkdown(cell))
          );
        }
        index += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      blocks.push({ type: "list", marker: "•", text: cleanInlineMarkdown(bullet[1]) });
      index += 1;
      continue;
    }

    const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      blocks.push({
        type: "list",
        marker: `${numbered[1]}.`,
        text: cleanInlineMarkdown(numbered[2]),
      });
      index += 1;
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      blocks.push({ type: "quote", text: cleanInlineMarkdown(quote[1]) });
      index += 1;
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (index < input.length && !isStructuralLine(input[index])) {
      paragraph.push(input[index].trim());
      index += 1;
    }
    blocks.push({
      type: "paragraph",
      text: cleanInlineMarkdown(paragraph.join(" ")),
    });
  }

  if (codeLines.length > 0) {
    blocks.push({ type: "code", lines: codeLines });
  }
  return blocks;
}

function renderGuide({ source, output, shortTitle }) {
  const sourcePath = path.join(docsDir, source);
  const outputPath = path.join(outputDir, output);
  const markdown = fs.readFileSync(sourcePath, "utf8");
  const blocks = parseMarkdown(markdown);
  const documentTitle =
    blocks.find((block) => block.type === "heading" && block.level === 1)?.text ?? shortTitle;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  let y = TOP;

  doc.setProperties({
    title: documentTitle,
    subject: "Patrimoine CRM - mode équipe SharePoint",
    author: "Patrimoine CRM",
    creator: "Patrimoine CRM",
  });

  function ensureSpace(height) {
    if (y + height > PAGE_HEIGHT - BOTTOM) {
      doc.addPage();
      y = TOP;
    }
  }

  function drawLines(lines, options = {}) {
    const {
      x = MARGIN_X,
      font = "helvetica",
      style = "normal",
      size = 9.5,
      color = COLORS.text,
      lineHeight = 4.6,
    } = options;
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, x, y);
      y += lineHeight;
    }
  }

  for (const block of blocks) {
    if (block.type === "space") {
      y += 1.8;
      continue;
    }

    if (block.type === "heading") {
      const config = {
        1: { size: 21, height: 9, before: 0, after: 5 },
        2: { size: 15, height: 7, before: 4, after: 3 },
        3: { size: 12, height: 6, before: 3, after: 2 },
        4: { size: 10.5, height: 5, before: 2, after: 1.5 },
      }[block.level];
      ensureSpace(config.height + config.after + 5);
      y += config.before;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(config.size);
      doc.setTextColor(...(block.level === 1 ? COLORS.primary : COLORS.secondary));
      const lines = doc.splitTextToSize(block.text, CONTENT_WIDTH);
      for (const line of lines) {
        ensureSpace(config.height);
        doc.text(line, MARGIN_X, y);
        y += config.height;
      }
      if (block.level <= 2) {
        doc.setDrawColor(...COLORS.border);
        doc.setLineWidth(0.3);
        doc.line(MARGIN_X, y - 1.5, PAGE_WIDTH - MARGIN_X, y - 1.5);
      }
      y += config.after;
      continue;
    }

    if (block.type === "paragraph") {
      const lines = doc.splitTextToSize(block.text, CONTENT_WIDTH);
      drawLines(lines);
      y += 1.2;
      continue;
    }

    if (block.type === "list") {
      const textWidth = CONTENT_WIDTH - 10;
      const lines = doc.splitTextToSize(block.text, textWidth);
      ensureSpace(lines.length * 4.6 + 1);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.3);
      doc.setTextColor(...COLORS.primary);
      doc.text(block.marker, MARGIN_X + 2, y);
      drawLines(lines, { x: MARGIN_X + 10, size: 9.3, lineHeight: 4.6 });
      y += 0.7;
      continue;
    }

    if (block.type === "quote") {
      const lines = doc.splitTextToSize(block.text, CONTENT_WIDTH - 10);
      const height = lines.length * 4.7 + 5;
      ensureSpace(height);
      doc.setFillColor(...COLORS.light);
      doc.setDrawColor(...COLORS.primary);
      doc.roundedRect(MARGIN_X, y - 3.2, CONTENT_WIDTH, height, 1.5, 1.5, "FD");
      drawLines(lines, {
        x: MARGIN_X + 5,
        style: "italic",
        color: COLORS.secondary,
        size: 9.2,
        lineHeight: 4.7,
      });
      y += 2;
      continue;
    }

    if (block.type === "code") {
      const wrapped = block.lines.flatMap((line) =>
        doc.splitTextToSize(line || " ", CONTENT_WIDTH - 8)
      );
      const height = wrapped.length * 4 + 5;
      ensureSpace(Math.min(height, PAGE_HEIGHT - TOP - BOTTOM));
      for (const line of wrapped) {
        ensureSpace(7);
        doc.setFillColor(247, 248, 250);
        doc.rect(MARGIN_X, y - 3, CONTENT_WIDTH, 5, "F");
        drawLines([line], {
          x: MARGIN_X + 4,
          font: "courier",
          size: 7.5,
          lineHeight: 4,
        });
      }
      y += 2;
      continue;
    }

    if (block.type === "table") {
      if (block.rows.length === 0) continue;
      const columns = Math.max(...block.rows.map((row) => row.length));
      const columnWidth = CONTENT_WIDTH / columns;
      for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex += 1) {
        const row = block.rows[rowIndex];
        const cellLines = row.map((cell) =>
          doc.splitTextToSize(cell, columnWidth - 4)
        );
        const rowHeight = Math.max(...cellLines.map((lines) => lines.length)) * 4 + 3;
        ensureSpace(rowHeight);
        doc.setFillColor(...(rowIndex === 0 ? COLORS.light : [255, 255, 255]));
        doc.setDrawColor(...COLORS.border);
        doc.rect(MARGIN_X, y - 3, CONTENT_WIDTH, rowHeight, "FD");
        for (let column = 0; column < columns; column += 1) {
          const x = MARGIN_X + column * columnWidth;
          if (column > 0) {
            doc.line(x, y - 3, x, y - 3 + rowHeight);
          }
          doc.setFont("helvetica", rowIndex === 0 ? "bold" : "normal");
          doc.setFontSize(7.8);
          doc.setTextColor(...COLORS.text);
          doc.text(cellLines[column] ?? [""], x + 2, y, { lineHeightFactor: 1.25 });
        }
        y += rowHeight;
      }
      y += 2;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, PAGE_HEIGHT - 12, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.muted);
    doc.text(shortTitle, MARGIN_X, PAGE_HEIGHT - 7.5);
    doc.text(`Page ${page} / ${pages}`, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 7.5, {
      align: "right",
    });
  }

  fs.writeFileSync(outputPath, Buffer.from(doc.output("arraybuffer")));
  return { outputPath, pages, bytes: fs.statSync(outputPath).size };
}

fs.mkdirSync(outputDir, { recursive: true });
const results = guides.map(renderGuide);
for (const result of results) {
  console.log(
    `${path.relative(rootDir, result.outputPath)} — ${result.pages} page(s), ${result.bytes} octets`
  );
}

