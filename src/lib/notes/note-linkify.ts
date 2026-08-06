/** Détecte http(s)://… et www.… dans du texte brut (hors balise <a>). */
const NOTE_PLAIN_URL_RE =
  /(?:https?:\/\/|www\.)[\w\-._~:/?#[\]@!$&'()*+,;=%]+/gi;

const TRAILING_URL_PUNCTUATION_RE = /[.,;:!?)}\]"»']+$/u;

export function trimTrailingUrlPunctuation(url: string): string {
  return url.replace(TRAILING_URL_PUNCTUATION_RE, "");
}

/** Normalise une URL de note : http(s), www. ou mailto. */
export function normalizeNoteHref(href: string): string | null {
  const trimmed = trimTrailingUrlPunctuation(href.trim());
  if (!trimmed) return null;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function linkifyPlainTextSegment(text: string): string {
  NOTE_PLAIN_URL_RE.lastIndex = 0;
  return text.replace(NOTE_PLAIN_URL_RE, (raw) => {
    const href = normalizeNoteHref(raw);
    return href ? `<a href="${href}">${raw}</a>` : raw;
  });
}

function normalizeAnchorOpenTag(tag: string): string {
  return tag.replace(/\bhref=(["'])([^"']+)\1/i, (_match, quote: string, href: string) => {
    const normalized = normalizeNoteHref(href);
    return normalized ? `href=${quote}${normalized}${quote}` : "";
  });
}

/** Linkifie le texte brut et normalise les href existants (sans DOM). */
export function linkifyPlainUrlsInHtmlString(html: string): string {
  const parts = html.split(/(<[^>]+>)/g);
  let insideAnchor = false;
  const result: string[] = [];
  for (const part of parts) {
    if (part.startsWith("<")) {
      if (/^<\s*a\b/i.test(part)) insideAnchor = true;
      if (/^<\s*\/\s*a\s*>/i.test(part)) insideAnchor = false;
      result.push(/^<\s*a\b/i.test(part) ? normalizeAnchorOpenTag(part) : part);
      continue;
    }
    result.push(insideAnchor ? part : linkifyPlainTextSegment(part));
  }
  return result.join("");
}

function hasPlainUrl(text: string): boolean {
  NOTE_PLAIN_URL_RE.lastIndex = 0;
  return NOTE_PLAIN_URL_RE.test(text);
}

/** Transforme les URL en texte brut en balises <a href="…">. */
export function linkifyPlainUrlsInElement(root: Element): void {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest("a")) continue;
    textNodes.push(node as Text);
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? "";
    if (!hasPlainUrl(text)) continue;

    const fragment = doc.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    NOTE_PLAIN_URL_RE.lastIndex = 0;
    while ((match = NOTE_PLAIN_URL_RE.exec(text)) !== null) {
      const raw = match[0];
      const href = normalizeNoteHref(raw);
      if (!href) continue;
      if (match.index > lastIndex) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
      }
      const anchor = doc.createElement("a");
      anchor.setAttribute("href", href);
      anchor.textContent = raw;
      fragment.appendChild(anchor);
      lastIndex = match.index + raw.length;
    }
    if (lastIndex === 0) continue;
    if (lastIndex < text.length) {
      fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}
