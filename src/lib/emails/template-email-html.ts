import type { CgpConfig } from "@/lib/api/tauri-settings";
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

/** Convertit un corps texte brut en HTML simple (éditeur / anciens modèles). */
export function plainTextToTemplateHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.trim() === "") return "<br>";
      return `<p style="margin:0 0 0.5em 0">${escapeHtml(line)}</p>`;
    })
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
  return `${html}<br><br>${sig}`;
}

/** Corps final pour l'envoi OAuth (texte + HTML optionnel du modèle). */
export function buildTemplateSendBodies(
  plainWithSignature: string,
  messageHtml: string | null | undefined,
  cgp: CgpConfig | null | undefined
): { body: string; body_html: string | null } {
  const trimmedHtml = messageHtml?.trim();
  if (!trimmedHtml) {
    return buildSendEmailBodies(plainWithSignature, cgp);
  }
  const body_html = injectTemplateSignatureHtml(
    trimmedHtml,
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
      .replace(/\sstyle="[^"]*"/gi, "")
      .replace(/\sstyle='[^']*'/gi, "");
  }
  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  sanitizeEmailHtmlNode(doc.body);
  return doc.body.innerHTML.trim();
}
