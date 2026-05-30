import type { CgpConfig } from "@/lib/api/tauri-settings";

/** Décodage des entités HTML courantes (signature Gmail importée). */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

export function signatureLooksLikeHtml(signature: string | null | undefined): boolean {
  if (!signature?.trim()) return false;
  return /<[a-z][\s\S]*>/i.test(signature);
}

/** Ajoute la signature CGP en fin de message (texte brut). */
export function appendEmailSignature(
  body: string,
  signature: string | null | undefined
): string {
  const sig = signature?.trim();
  if (!sig) return body;
  const decoded = decodeHtmlEntities(sig);
  const trimmedBody = body.trimEnd();
  if (trimmedBody.endsWith(decoded)) return body;
  return `${trimmedBody}\n\n--\n${decoded}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainToHtmlParagraphs(text: string): string {
  return escapeHtml(text)
    .split(/\n/)
    .map((line) => (line.trim() === "" ? "<br>" : `<p style="margin:0 0 0.5em 0">${line}</p>`))
    .join("");
}

/** Corps HTML pour l'envoi (message + signature avec images). */
export function buildEmailHtmlBody(
  messagePlain: string,
  cgp: CgpConfig | null | undefined
): string | null {
  const htmlSig = cgp?.email_signature_html?.trim();
  if (!htmlSig) return null;
  const msg = messagePlain.trimEnd();
  const plainSig = decodeHtmlEntities(cgp?.email_signature?.trim() ?? "");
  let message = msg;
  if (plainSig && message.endsWith(plainSig)) {
    message = message.slice(0, -plainSig.length).trimEnd();
  } else if (plainSig && message.endsWith(`--\n${plainSig}`)) {
    message = message.slice(0, -(plainSig.length + 3)).trimEnd();
  }
  return `${plainToHtmlParagraphs(message)}<br><br>${htmlSig}`;
}

/** Prépare texte brut + HTML optionnel pour l'API d'envoi. */
export function buildSendEmailBodies(
  body: string,
  cgp: CgpConfig | null | undefined
): { body: string; body_html: string | null } {
  const body_html = buildEmailHtmlBody(body, cgp);
  return { body, body_html };
}
