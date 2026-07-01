import type { CgpConfig } from "@/lib/api/tauri-settings";
import { replaceTemplateVariables } from "@/lib/api/tauri-templates-email";
import { buildSendEmailBodies, plainTextContainsEmailSignature, normalizePlainForSignatureCompare, signaturePlainFingerprint } from "@/lib/emails/email-signature";

/** Clé JSON dans `templates_email.variables` (compatible newsletter_html). */
export const TEMPLATE_CORPS_HTML_KEY = "corps_html";

export function parseTemplateEmailMeta(
  variables: string | null | undefined
): Record<string, unknown> {
  if (!variables?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(variables);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function getTemplateCorpsHtml(
  variables: string | null | undefined
): string | null {
  const meta = parseTemplateEmailMeta(variables);
  const raw = meta[TEMPLATE_CORPS_HTML_KEY];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function setTemplateCorpsHtmlInMeta(
  variables: string | null | undefined,
  corpsHtml: string | null | undefined
): string | null {
  const meta = parseTemplateEmailMeta(variables);
  const trimmed = corpsHtml?.trim();
  if (trimmed) {
    meta[TEMPLATE_CORPS_HTML_KEY] = trimmed;
  } else {
    delete meta[TEMPLATE_CORPS_HTML_KEY];
  }
  return Object.keys(meta).length === 0 ? null : JSON.stringify(meta);
}

export function looksLikeHtml(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return /<[a-z][\s\S]*>/i.test(text);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GMAIL_LINE_STYLE = "line-height:1.5;margin:0;padding:0";
const GMAIL_LIST_STYLE = "margin:0;padding-left:1.25em;line-height:1.5";
const GMAIL_LIST_ITEM_STYLE = "margin:0;padding:0;line-height:1.5";

function gmailBlankLineHtml(): string {
  return `<div style="${GMAIL_LINE_STYLE}"><br></div>`;
}

function gmailTextLineHtml(innerHtml: string): string {
  return `<div style="${GMAIL_LINE_STYLE}">${innerHtml}</div>`;
}

function wrapGmailHtmlBody(inner: string): string {
  return `<div dir="ltr">${inner}</div>`;
}

function isBlankLineContent(innerHtml: string): boolean {
  return !innerHtml
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/** Retire les `<br>` finaux (artefact contentEditable) qui doublent l'espacement à l'envoi Gmail. */
function stripEditorTrailingBrFromLineInner(innerHtml: string): string {
  let s = innerHtml.trim();
  if (isBlankLineContent(s)) return s;
  while (/<br\s*\/?>\s*$/i.test(s)) {
    s = s.replace(/<br\s*\/?>\s*$/i, "").trimEnd();
  }
  return s;
}

function collapseConsecutiveGmailBlankLines(lines: string[]): string[] {
  const blank = gmailBlankLineHtml();
  const out: string[] = [];
  for (const line of lines) {
    if (line === blank && out.at(-1) === blank) continue;
    out.push(line);
  }
  return out;
}

function isGmailBlankLineEntry(line: string): boolean {
  return line === gmailBlankLineHtml();
}

function isListBlockLine(line: string): boolean {
  return /^<(ul|ol)\b/i.test(line.trim());
}

function isTextBlockLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('<div style="line-height:1.5') && !isGmailBlankLineEntry(t);
}

/** Retire une ligne vide Gmail entre un paragraphe et une liste (ou l'inverse). */
function compactBlankLinesAroundLists(lines: string[]): string[] {
  const out = [...lines];
  let i = 0;
  while (i < out.length) {
    if (
      i + 2 < out.length &&
      isTextBlockLine(out[i]!) &&
      isGmailBlankLineEntry(out[i + 1]!) &&
      isListBlockLine(out[i + 2]!)
    ) {
      out.splice(i + 1, 1);
      continue;
    }
    if (
      i + 2 < out.length &&
      isListBlockLine(out[i]!) &&
      isGmailBlankLineEntry(out[i + 1]!) &&
      isTextBlockLine(out[i + 2]!)
    ) {
      out.splice(i + 1, 1);
      continue;
    }
    i += 1;
  }
  return out;
}

function finalizeGmailLineBlocks(lines: string[]): string[] {
  return compactBlankLinesAroundLists(collapseConsecutiveGmailBlankLines(lines));
}

function flattenListItemInnerHtml(innerHtml: string): string {
  let s = innerHtml.trim();
  for (let pass = 0; pass < 3; pass++) {
    const wrapped = s.match(/^<(div|p)(?:\s[^>]*)?>([\s\S]*)<\/\1>$/i);
    if (!wrapped) break;
    const inner = wrapped[2]!.trim();
    if (/<(?:ul|ol|table|img)\b/i.test(inner)) break;
    s = inner;
  }
  return stripEditorTrailingBrFromLineInner(s);
}

/** Aplatit les `<div>` / `<p>` imbriqués (artefacts contentEditable, surtout dans les puces). */
function flattenRichEditorHtmlDom(root: Element): void {
  for (const li of root.querySelectorAll("li")) {
    li.innerHTML = flattenListItemInnerHtml(li.innerHTML);
  }
  for (const block of root.querySelectorAll("div, p")) {
    const only = block.firstElementChild;
    if (
      block.childElementCount === 1 &&
      only &&
      /^(DIV|P)$/i.test(only.tagName) &&
      !only.querySelector("ul, ol, table, img")
    ) {
      block.innerHTML = only.innerHTML;
    }
  }
}

function endsWithGmailBlankLine(html: string): boolean {
  return /<div style="line-height:1\.5;margin:0;padding:0"><br><\/div>\s*$/i.test(
    html.trimEnd()
  );
}

function styleListElement(el: Element): void {
  el.setAttribute("style", GMAIL_LIST_STYLE);
  for (const li of el.querySelectorAll("li")) {
    li.setAttribute("style", GMAIL_LIST_ITEM_STYLE);
    li.innerHTML = flattenListItemInnerHtml(li.innerHTML);
  }
}

const GMAIL_SAFE_STYLE_VALUES: Record<string, RegExp> = {
  "line-height": /^[\d.]+$/,
  margin: /^0$/,
  padding: /^0$/,
  "padding-left": /^1\.25em$/,
  "font-weight": /^(700|bold)$/,
  "font-style": /^italic$/,
  "text-decoration": /^underline$/,
  color: /^inherit$/,
  "font-size": /^(\d+(\.\d+)?px|\d+(\.\d+)?em)$/,
};

function isGmailSafeStyle(style: string): boolean {
  const s = style.replace(/\s/g, "").toLowerCase();
  if (s === "line-height:1.5;margin:0;padding:0") return true;
  if (s === "margin:0;padding-left:1.25em;line-height:1.5") return true;
  if (s === "margin:0;padding:0;line-height:1.5") return true;

  const decls = style.split(";").map((d) => d.trim()).filter(Boolean);
  if (decls.length === 0) return false;
  return decls.every((decl) => {
    const colon = decl.indexOf(":");
    if (colon === -1) return false;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const val = decl.slice(colon + 1).trim().toLowerCase();
    const pattern = GMAIL_SAFE_STYLE_VALUES[prop];
    if (!pattern?.test(val)) return false;
    if (prop === "font-size" && val.endsWith("px")) {
      const px = parseFloat(val);
      return px >= 10 && px <= 48;
    }
    return true;
  });
}

/** Une ligne Gmail par Entrée ; ligne vide = `<div><br></div>` (comme la rédaction Gmail). */
function normalizeTemplateEmailHtmlLikeGmailWithDom(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  flattenRichEditorHtmlDom(doc.body);
  const lines: string[] = [];

  const appendBlock = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      styleListElement(el);
      lines.push(el.outerHTML);
      return;
    }
    if (tag !== "p" && tag !== "div") {
      lines.push(gmailTextLineHtml(el.outerHTML));
      return;
    }
    if (el.querySelector(":scope > ul, :scope > ol")) {
      for (const child of [...el.children]) {
        appendBlock(child);
      }
      return;
    }
    if (el.querySelector(":scope > div, :scope > p")) {
      for (const child of [...el.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child.textContent?.trim();
          if (t) lines.push(gmailTextLineHtml(escapeHtml(t)));
          continue;
        }
        if (child.nodeType === Node.ELEMENT_NODE) {
          appendBlock(child as Element);
        }
      }
      return;
    }
    const inner = stripEditorTrailingBrFromLineInner(el.innerHTML.trim());
    if (isBlankLineContent(inner)) {
      lines.push(gmailBlankLineHtml());
    } else {
      lines.push(gmailTextLineHtml(inner));
    }
  };

  const walk = (parent: Element) => {
    for (const node of [...parent.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent?.trim();
        if (t) lines.push(gmailTextLineHtml(escapeHtml(t)));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === "br") {
        lines.push(gmailBlankLineHtml());
        continue;
      }
      appendBlock(el);
    }
  };

  walk(doc.body);
  return wrapGmailHtmlBody(finalizeGmailLineBlocks(lines).join(""));
}

function normalizeTemplateEmailHtmlLikeGmailWithRegex(html: string): string {
  let rest = html.trim().replace(/<script[\s\S]*?<\/script>/gi, "");
  const wrap = rest.match(/^<div[^>]*dir=["']ltr["'][^>]*>([\s\S]*)<\/div>$/i);
  if (wrap) rest = wrap[1].trim();

  const lines: string[] = [];
  while (rest.length > 0) {
    rest = rest.replace(/^\s+/, "");
    if (!rest) break;

    const listMatch = rest.match(/^<(ul|ol)(?:\s[^>]*)?>[\s\S]*?<\/\1>/i);
    if (listMatch) {
      let block = listMatch[0];
      block = block.replace(/<ul(?:\s[^>]*)?>/i, `<ul style="${GMAIL_LIST_STYLE}">`);
      block = block.replace(/<ol(?:\s[^>]*)?>/i, `<ol style="${GMAIL_LIST_STYLE}">`);
      block = block.replace(/<li(?:\s[^>]*)?>/gi, `<li style="${GMAIL_LIST_ITEM_STYLE}">`);
      block = block.replace(
        /<li([^>]*)>([\s\S]*?)<\/li>/gi,
        (_match, attrs: string, inner: string) =>
          `<li${attrs}>${flattenListItemInnerHtml(inner)}</li>`
      );
      lines.push(block);
      rest = rest.slice(listMatch[0].length);
      continue;
    }

    const blockMatch = rest.match(/^<(p|div)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/i);
    if (blockMatch) {
      const inner = stripEditorTrailingBrFromLineInner(blockMatch[2].trim());
      lines.push(isBlankLineContent(inner) ? gmailBlankLineHtml() : gmailTextLineHtml(inner));
      rest = rest.slice(blockMatch[0].length);
      continue;
    }

    const brMatch = rest.match(/^<br\s*\/?>/i);
    if (brMatch) {
      lines.push(gmailBlankLineHtml());
      rest = rest.slice(brMatch[0].length);
      continue;
    }
    break;
  }

  return wrapGmailHtmlBody(finalizeGmailLineBlocks(lines).join(""));
}

/** HTML éditeur → format Gmail canonique (aperçu, test, enregistrement). */
export function canonicalizeTemplateCorpsHtml(html: string): string {
  const sanitized = sanitizeTemplateEmailHtml(html.trim());
  if (!sanitized) return "";
  return normalizeTemplateEmailHtmlLikeGmail(sanitized).replace(
    /^<div dir="ltr">([\s\S]*)<\/div>$/i,
    "$1"
  );
}

/** @deprecated alias — préparation envoi Gmail */
export function normalizeTemplateEmailHtmlLikeGmail(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  if (typeof DOMParser !== "undefined") {
    return normalizeTemplateEmailHtmlLikeGmailWithDom(trimmed);
  }
  return normalizeTemplateEmailHtmlLikeGmailWithRegex(trimmed);
}

/** @deprecated alias — préparation envoi Gmail */
export function prepareTemplateEmailHtmlForSend(html: string): string {
  return normalizeTemplateEmailHtmlLikeGmail(html);
}

/** Convertit un corps texte brut en HTML Gmail (une ligne = un div). */
export function plainTextToTemplateHtml(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line.trim() === "" ? gmailBlankLineHtml() : gmailTextLineHtml(escapeHtml(line))
    )
    .join("");
}

/** HTML → texte brut (aperçu, champ corps, clients sans HTML). */
export function htmlToPlainEmail(html: string): string {
  let s = html;
  for (const tag of ["style", "script", "head", "noscript"]) {
    s = s.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi"), "");
  }
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  const lines = s
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
  return lines.join("\n").trim();
}

/** La signature HTML contient-elle une image (logo) ? */
function signatureHtmlHasImage(signatureHtml: string | null | undefined): boolean {
  return /<img[\s>]/i.test(signatureHtml ?? "");
}

/** Extrait les src des balises img (signature ou corps). */
function extractHtmlImageSrcs(html: string): string[] {
  const srcs: string[] = [];
  const re = /\ssrc=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    srcs.push(m[1]!);
  }
  return srcs;
}

/** Le corps HTML inclut-il l'image de la signature (data URL ou https) ? */
function htmlContainsSignatureImage(html: string, signatureHtml: string): boolean {
  if (!signatureHtmlHasImage(signatureHtml)) return true;
  const sigSrcs = extractHtmlImageSrcs(signatureHtml).filter(isSafeEmailImageSrc);
  if (sigSrcs.length === 0) return false;
  return sigSrcs.some((src) => html.includes(src));
}

function isSafeEmailImageSrc(src: string): boolean {
  const s = src.trim();
  return /^data:image\//i.test(s) || /^https?:\/\//i.test(s);
}

/** Balises img de la signature (bannière / logo) pour réparation sans dupliquer le texte. */
function extractSignatureImageMarkup(signatureHtml: string): string {
  if (typeof DOMParser === "undefined") {
    return (signatureHtml.match(/<img[\s\S]*?>/gi) ?? [])
      .filter((tag) => {
        const m = tag.match(/\ssrc=["']([^"']+)["']/i);
        return m != null && isSafeEmailImageSrc(m[1]!);
      })
      .join("<br>");
  }
  const doc = new DOMParser().parseFromString(signatureHtml, "text/html");
  const parts: string[] = [];
  for (const img of doc.body.querySelectorAll("img")) {
    const src = img.getAttribute("src")?.trim() ?? "";
    if (isSafeEmailImageSrc(src)) {
      parts.push(img.outerHTML);
    }
  }
  return parts.join("<br>");
}

function signatureTextPresentInHtml(
  html: string,
  plainSignature?: string | null,
  signatureHtml?: string | null
): boolean {
  const htmlPlain = htmlToPlainEmail(html);
  if (!htmlPlain.trim()) return false;
  if (plainSignature?.trim() && plainTextContainsEmailSignature(htmlPlain, plainSignature)) {
    return true;
  }
  const sig = signatureHtml?.trim();
  return sig ? plainTextContainsEmailSignature(htmlPlain, htmlToPlainEmail(sig)) : false;
}

/** Insère la bannière/logo avant le bloc texte déjà présent (sans recoller tout le HTML signature). */
function prependSignatureImagesToExistingText(
  html: string,
  imgMarkup: string,
  plainSignature: string | null | undefined,
  signatureHtml: string
): string {
  if (!imgMarkup.trim()) return html;

  const msgBefore = messagePlainWithoutSignature(html, plainSignature, signatureHtml);
  const withoutSig = stripTrailingEmailSignatureBlocks(html, plainSignature, signatureHtml);
  if (withoutSig.length < html.length && msgBefore.trim()) {
    const msgAfter = messagePlainWithoutSignature(withoutSig, plainSignature, signatureHtml);
    if (msgAfter.trim().length >= msgBefore.trim().length * 0.5) {
      return `${withoutSig}${gmailBlankLineHtml()}${signatureHtml}`;
    }
  }

  const refSig = plainSignature?.trim() || htmlToPlainEmail(signatureHtml);
  const anchorLine =
    refSig
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length >= 8) ?? signaturePlainFingerprint(refSig);
  if (anchorLine.length >= 8) {
    const needle = anchorLine.slice(0, Math.min(24, anchorLine.length));
    const idx = html.indexOf(needle);
    if (idx >= 0) {
      const divStart = html.lastIndexOf("<div", idx);
      const insertAt = divStart >= 0 ? divStart : idx;
      return `${html.slice(0, insertAt)}${imgMarkup}${gmailBlankLineHtml()}${html.slice(insertAt)}`;
    }
  }

  return `${html}${gmailBlankLineHtml()}${imgMarkup}`;
}

/** Retire une signature texte/HTML incomplète (sans logo) en fin de message. */
function stripTrailingEmailSignatureBlocks(
  html: string,
  plainSignature?: string | null,
  signatureHtml?: string | null
): string {
  const refSig = plainSignature?.trim() || htmlToPlainEmail(signatureHtml ?? "");
  if (!refSig.trim()) return html;

  let out = html.trimEnd();
  const sigHtml = signatureHtml?.trim();
  if (sigHtml && out.includes(sigHtml)) {
    const idx = out.lastIndexOf(sigHtml);
    if (idx >= 0) {
      out = out.slice(0, idx).trimEnd();
      out = out.replace(
        /(<div style="line-height:1\.5;margin:0;padding:0"><br><\/div>\s*)$/i,
        ""
      );
      return out;
    }
  }

  const divTail =
    /(<div style="line-height:1\.5;margin:0;padding:0">[\s\S]*?<\/div>\s*)+$/i;
  let plain = htmlToPlainEmail(out);
  while (plainTextContainsEmailSignature(plain, refSig)) {
    const next = out.replace(divTail, "").trimEnd();
    if (next === out) break;
    out = next;
    plain = htmlToPlainEmail(out);
  }
  return out
    .replace(/(<div style="line-height:1\.5;margin:0;padding:0"><br><\/div>\s*)$/i, "")
    .trimEnd();
}

/** Texte du message sans la signature (pour ne pas effacer le corps à la réparation logo). */
function messagePlainWithoutSignature(
  html: string,
  plainSignature?: string | null,
  signatureHtml?: string | null
): string {
  const plain = htmlToPlainEmail(html).trim();
  const sigPlain = (plainSignature?.trim() || htmlToPlainEmail(signatureHtml ?? "")).trim();
  if (!plain || !sigPlain) return plain;
  const norm = normalizePlainForSignatureCompare(plain);
  const normSig = normalizePlainForSignatureCompare(sigPlain);
  if (normSig.length >= 8 && norm.endsWith(normSig)) {
    return norm.slice(0, norm.length - normSig.length).trim();
  }
  const fp = normSig.split("\n").slice(0, 2).join("\n");
  if (fp.length >= 8 && norm.includes(fp)) {
    const idx = norm.lastIndexOf(fp);
    if (idx > 0) return norm.slice(0, idx).trim();
  }
  return plain;
}

function stripTrailingSignaturePreservingMessage(
  html: string,
  plainSignature?: string | null,
  signatureHtml?: string | null
): string {
  const stripped = stripTrailingEmailSignatureBlocks(html, plainSignature, signatureHtml);
  const before = messagePlainWithoutSignature(html, plainSignature, signatureHtml);
  const after = messagePlainWithoutSignature(stripped, plainSignature, signatureHtml);
  if (before.trim() && !after.trim()) return html;
  if (before.trim().length >= 8 && after.trim().length < before.trim().length * 0.5) {
    return html;
  }
  return stripped;
}

/** Retire la signature CGP du HTML complet (éditeur « Confirmer l'envoi » — corps seul). */
export function extractMessageHtmlWithoutSignature(
  html: string,
  cgp: CgpConfig | null | undefined
): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  const sigHtml = cgp?.email_signature_html?.trim();
  const plainSig = cgp?.email_signature?.trim();
  if (!sigHtml && !plainSig) return trimmed;
  return stripTrailingSignaturePreservingMessage(trimmed, plainSig, sigHtml);
}

/** Détecte une signature déjà présente (y compris après sanitize / normalisation Gmail). */
export function htmlAlreadyContainsEmailSignature(
  html: string,
  signatureHtml: string | null | undefined,
  plainSignature?: string | null
): boolean {
  const sig = signatureHtml?.trim();
  if (!sig && !plainSignature?.trim()) return false;
  if (sig && html.includes(sig)) return true;

  const htmlPlain = htmlToPlainEmail(html).trim();
  if (!htmlPlain) return false;

  const textPresent =
    plainTextContainsEmailSignature(htmlPlain, plainSignature) ||
    (sig ? plainTextContainsEmailSignature(htmlPlain, htmlToPlainEmail(sig)) : false);

  if (!textPresent) return false;

  if (sig && signatureHtmlHasImage(sig) && !htmlContainsSignatureImage(html, sig)) {
    return false;
  }

  return true;
}

export function injectTemplateSignatureHtml(
  html: string,
  signatureHtml: string | null | undefined,
  plainSignature?: string | null
): string {
  const sig = signatureHtml?.trim();
  if (!sig) return html;

  const needsImageRepair =
    signatureHtmlHasImage(sig) && !htmlContainsSignatureImage(html, sig);

  if (htmlAlreadyContainsEmailSignature(html, signatureHtml, plainSignature) && !needsImageRepair) {
    return html;
  }

  if (needsImageRepair && signatureTextPresentInHtml(html, plainSignature, sig)) {
    const imgMarkup = extractSignatureImageMarkup(sig);
    if (imgMarkup) {
      return prependSignatureImagesToExistingText(html, imgMarkup, plainSignature, sig);
    }
    return html;
  }

  const base = needsImageRepair
    ? stripTrailingSignaturePreservingMessage(html, plainSignature, sig)
    : html;

  return endsWithGmailBlankLine(base)
    ? `${base}${sig}`
    : `${base}${gmailBlankLineHtml()}${sig}`;
}

/** Slot temporaire : le normaliseur Gmail ne doit pas repasser sur le HTML bulletin / perf (blocs multiples). */
export const BULLETIN_RESUME_HTML_PLACEHOLDER = "___CRM_BULLETIN_RESUME_HTML___";
export const PERF_RESUME_HTML_PLACEHOLDER = "___CRM_PERF_RESUME_HTML___";

const PERF_HTML_SLOT_KEYS = [
  "perf_resume_html",
  "perf_resume_html_tu",
  "perf_detail_html",
  "perf_detail_html_tu",
] as const;

/** Remplace les variables, normalise le gabarit, puis injecte le HTML bulletin/perf sans le tronquer. */
export function prepareTemplateHtmlForSend(
  corpsHtml: string,
  vars: Record<string, string>
): string {
  const bulletinHtml = vars.bulletin_resume_html ?? "";
  const slotVars: Record<string, string> = {
    ...vars,
    bulletin_resume_html: bulletinHtml ? BULLETIN_RESUME_HTML_PLACEHOLDER : "",
  };
  const perfSlots: { key: (typeof PERF_HTML_SLOT_KEYS)[number]; html: string }[] = [];

  for (const key of PERF_HTML_SLOT_KEYS) {
    const html = vars[key] ?? "";
    if (html) {
      perfSlots.push({ key, html });
      slotVars[key] = `${PERF_RESUME_HTML_PLACEHOLDER}__${key}`;
    }
  }

  let html = replaceTemplateVariables(corpsHtml, slotVars);
  html = normalizeTemplateEmailHtmlLikeGmail(html);
  if (bulletinHtml) {
    html = html.split(BULLETIN_RESUME_HTML_PLACEHOLDER).join(bulletinHtml);
  }
  for (const { key, html: perfHtml } of perfSlots) {
    html = html.split(`${PERF_RESUME_HTML_PLACEHOLDER}__${key}`).join(perfHtml);
  }
  return html;
}

/** Corps final pour l'envoi OAuth (texte + HTML optionnel du modèle). */
export function buildTemplateSendBodies(
  plainWithSignature: string,
  messageHtml: string | null | undefined,
  cgp: CgpConfig | null | undefined,
  options?: { htmlAlreadyNormalized?: boolean }
): { body: string; body_html: string | null } {
  const trimmedHtml = messageHtml?.trim();
  if (!trimmedHtml) {
    return buildSendEmailBodies(plainWithSignature, cgp);
  }
  const normalized = options?.htmlAlreadyNormalized
    ? trimmedHtml
    : normalizeTemplateEmailHtmlLikeGmail(trimmedHtml);
  const body_html = injectTemplateSignatureHtml(
    normalized,
    cgp?.email_signature_html,
    cgp?.email_signature
  );
  return { body: plainWithSignature, body_html };
}

const ALLOWED_EMAIL_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "div",
  "span",
  "img",
]);

function sanitizeEmailHtmlNode(el: Element): void {
  const children = [...el.children];
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (tag === "img") {
      const src = child.getAttribute("src")?.trim() ?? "";
      if (!isSafeEmailImageSrc(src)) {
        child.remove();
        continue;
      }
      for (const attr of [...child.attributes]) {
        if (
          attr.name === "src" ||
          attr.name === "alt" ||
          attr.name === "width" ||
          attr.name === "height"
        ) {
          continue;
        }
        if (attr.name === "style" && isGmailSafeStyle(attr.value)) {
          continue;
        }
        child.removeAttribute(attr.name);
      }
      continue;
    }
    if (!ALLOWED_EMAIL_TAGS.has(tag)) {
      while (child.firstChild) {
        el.insertBefore(child.firstChild, child);
      }
      el.removeChild(child);
      continue;
    }
    for (const attr of [...child.attributes]) {
      if (tag === "a" && attr.name === "href") {
        const href = attr.value.trim();
        if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) {
          child.removeAttribute("href");
        }
        continue;
      }
      if (tag === "div" && attr.name === "dir" && attr.value === "ltr") {
        continue;
      }
      if (attr.name === "style" && isGmailSafeStyle(attr.value)) {
        continue;
      }
      child.removeAttribute(attr.name);
    }
    sanitizeEmailHtmlNode(child);
  }
}

/** Retire scripts / styles Word et ne garde que les balises utiles pour l’envoi. */
export function sanitizeTemplateEmailHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  if (typeof DOMParser === "undefined") {
    return trimmed
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/\sstyle="([^"]*)"/gi, (full, style: string) =>
        isGmailSafeStyle(style) ? full : ""
      )
      .replace(/\sstyle='([^']*)'/gi, (full, style: string) =>
        isGmailSafeStyle(style) ? full : ""
      );
  }
  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  sanitizeEmailHtmlNode(doc.body);
  return doc.body.innerHTML.trim();
}
