import type {
  NewsletterImagePlacement,
  NewsletterRichBlock,
  NewsletterRichBlockType,
} from "@/lib/api/tauri-newsletter";
import type { ResolvedNewsletterTypography } from "@/lib/newsletter/newsletter-typography";
import { placementMatches } from "@/lib/newsletter/newsletter-placement";

export const RICH_BLOCK_OPTIONS: {
  id: NewsletterRichBlockType;
  label: string;
  hint: string;
}[] = [
  { id: "quote", label: "Citation", hint: "Extrait ou phrase mise en avant" },
  { id: "stat", label: "Chiffre clé", hint: "Statistique ou donnée chiffrée" },
  { id: "takeaway", label: "À retenir", hint: "Encart synthèse / points essentiels" },
  { id: "divider", label: "Séparateur", hint: "Trait visuel entre deux parties" },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function newRichBlockId(): string {
  return `blk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blocksMatching(
  blocks: NewsletterRichBlock[],
  matcher: (placement: NewsletterImagePlacement) => boolean
): NewsletterRichBlock[] {
  return blocks.filter((block) => matcher(block.placement));
}

export function blocksHtmlAt(
  blocks: NewsletterRichBlock[],
  placement: NewsletterImagePlacement,
  accent: string,
  secondary: string,
  typo: ResolvedNewsletterTypography
): string {
  return blocksMatching(blocks, (p) => placementMatches(p, placement))
    .map((block) => buildRichBlockRow(block, accent, secondary, typo))
    .join("");
}

function buildRichBlockRow(
  block: NewsletterRichBlock,
  accent: string,
  secondary: string,
  typo: ResolvedNewsletterTypography
): string {
  const pad = "0 40px 20px 40px";
  switch (block.type) {
    case "quote":
      return buildQuoteRow(block, accent, secondary, typo, pad);
    case "stat":
      return buildStatRow(block, accent, secondary, typo, pad);
    case "takeaway":
      return buildTakeawayRow(block, accent, secondary, typo, pad);
    case "divider":
      return buildDividerRow(secondary, pad);
    default:
      return "";
  }
}

function buildQuoteRow(
  block: NewsletterRichBlock,
  _accent: string,
  secondary: string,
  typo: ResolvedNewsletterTypography,
  pad: string
): string {
  const text = escapeHtml(block.text?.trim() ?? "").replace(/\n/g, "<br>");
  if (!text) return "";
  const attribution = block.attribution?.trim()
    ? `<p class="nl-rich-quote-attr" style="margin:10px 0 0 0;font-family:${typo.titleFontFamily};font-size:12px;color:#8a8a8a;font-style:normal;">— ${escapeHtml(block.attribution.trim())}</p>`
    : "";
  return `<tr><td class="nl-rich-pad nl-rich-quote" style="padding:${pad};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid ${secondary};background:#faf9f7;">
<tr><td class="nl-rich-inner" style="padding:18px 22px;font-family:${typo.bodyFontFamily};font-size:${typo.bodyFontSize};line-height:${typo.lineHeight};color:#2d3748;font-style:italic;">
<p style="margin:0;">${text}</p>${attribution}
</td></tr></table></td></tr>`;
}

function buildStatRow(
  block: NewsletterRichBlock,
  accent: string,
  secondary: string,
  typo: ResolvedNewsletterTypography,
  pad: string
): string {
  const value = escapeHtml(block.value?.trim() ?? "");
  const label = escapeHtml(block.label?.trim() ?? "");
  if (!value && !label) return "";
  return `<tr><td class="nl-rich-pad nl-rich-stat" style="padding:${pad};text-align:center;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;border-top:2px solid ${secondary};border-bottom:2px solid ${secondary};">
<tr><td class="nl-rich-inner" style="padding:22px 24px;">
<p class="nl-rich-stat-value" style="margin:0;font-family:${typo.titleFontFamily};font-size:36px;line-height:1.1;font-weight:300;color:${accent};">${value || "—"}</p>
${label ? `<p style="margin:8px 0 0 0;font-family:${typo.titleFontFamily};font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#8a8a8a;">${label}</p>` : ""}
</td></tr></table></td></tr>`;
}

function buildTakeawayRow(
  block: NewsletterRichBlock,
  accent: string,
  _secondary: string,
  typo: ResolvedNewsletterTypography,
  pad: string
): string {
  const body = escapeHtml(block.text?.trim() ?? "").replace(/\n/g, "<br>");
  if (!body) return "";
  const title = block.title?.trim()
    ? escapeHtml(block.title.trim())
    : "À retenir";
  return `<tr><td class="nl-rich-pad nl-rich-takeaway" style="padding:${pad};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f0;border:1px solid ${accent};border-left:4px solid ${accent};">
<tr><td class="nl-rich-inner" style="padding:20px 24px;">
<p style="margin:0 0 10px 0;font-family:${typo.titleFontFamily};font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${accent};">${title}</p>
<p style="margin:0;font-family:${typo.bodyFontFamily};font-size:${typo.bodyFontSize};line-height:${typo.lineHeight};color:#2d3748;">${body}</p>
</td></tr></table></td></tr>`;
}

function buildDividerRow(secondary: string, pad: string): string {
  return `<tr><td class="nl-rich-pad nl-rich-divider" style="padding:${pad};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="height:1px;background:${secondary};font-size:0;line-height:0;">&nbsp;</td>
</tr></table></td></tr>`;
}

export function normalizeNewsletterBlocks(content: {
  blocks?: NewsletterRichBlock[];
}): NewsletterRichBlock[] {
  if (!Array.isArray(content.blocks)) return [];
  return content.blocks.filter(
    (block) =>
      typeof block.id === "string" &&
      typeof block.type === "string" &&
      block.placement &&
      typeof block.placement.type === "string"
  );
}

export function emptyRichBlock(type: NewsletterRichBlockType): NewsletterRichBlock {
  return {
    id: newRichBlockId(),
    type,
    placement: { type: "after_intro" },
    text: type === "divider" ? undefined : "",
    title: type === "takeaway" ? "À retenir" : undefined,
    value: type === "stat" ? "" : undefined,
    label: type === "stat" ? "" : undefined,
  };
}
