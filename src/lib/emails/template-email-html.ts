import type { CgpConfig } from "@/lib/api/tauri-settings";
import { replaceTemplateVariables } from "@/lib/api/tauri-templates-email";
import { buildSendEmailBodies } from "@/lib/emails/email-signature";

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

function styleListElement(el: Element): void {
  el.setAttribute("style", GMAIL_LIST_STYLE);
  for (const li of el.querySelectorAll("li")) {
    li.setAttribute("style", GMAIL_LIST_ITEM_STYLE);
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
    const inner = el.innerHTML.trim();
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
  return wrapGmailHtmlBody(lines.join(""));
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
      lines.push(block);
      rest = rest.slice(listMatch[0].length);
      continue;
    }

    const blockMatch = rest.match(/^<(p|div)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/i);
    if (blockMatch) {
      const inner = blockMatch[2].trim();
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

  return wrapGmailHtmlBody(lines.join(""));
}

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

export function injectTemplateSignatureHtml(
  html: string,
  signatureHtml: string | null | undefined
): string {
  const sig = signatureHtml?.trim();
  if (!sig || html.includes(sig)) {
    return html;
  }
  return `${html}${gmailBlankLineHtml()}${sig}`;
}

/** Slot temporaire : le normaliseur Gmail ne doit pas repasser sur le HTML bulletin (blocs multiples). */
export const BULLETIN_RESUME_HTML_PLACEHOLDER = "___CRM_BULLETIN_RESUME_HTML___";

/** Remplace les variables, normalise le gabarit, puis injecte le HTML bulletin sans le tronquer. */
export function prepareTemplateHtmlForSend(
  corpsHtml: string,
  vars: Record<string, string>
): string {
  const bulletinHtml = vars.bulletin_resume_html ?? "";
  const slotVars = bulletinHtml
    ? { ...vars, bulletin_resume_html: BULLETIN_RESUME_HTML_PLACEHOLDER }
    : vars;
  let html = replaceTemplateVariables(corpsHtml, slotVars);
  html = normalizeTemplateEmailHtmlLikeGmail(html);
  if (bulletinHtml) {
    html = html.split(BULLETIN_RESUME_HTML_PLACEHOLDER).join(bulletinHtml);
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
    cgp?.email_signature_html
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
]);

function sanitizeEmailHtmlNode(el: Element): void {
  const children = [...el.children];
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
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
