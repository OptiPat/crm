import { openExternalUrl } from "@/lib/api/tauri-system";
import { toast } from "sonner";

const HTTP_LINK = /^https?:\/\//i;
const MAILTO_LINK = /^mailto:/i;

export function isNoteExternalHref(href: string): boolean {
  const url = href.trim();
  return HTTP_LINK.test(url) || MAILTO_LINK.test(url);
}

export async function openNoteLink(href: string): Promise<void> {
  const url = href.trim();
  if (!isNoteExternalHref(url)) return;
  await openExternalUrl(url);
}

/** Ouvre https/mailto dans le navigateur ou client mail système (pas dans le WebView CRM). */
export function handleNoteLinkClick(event: React.MouseEvent<HTMLElement>): void {
  const anchor = (event.target as HTMLElement).closest("a[href]");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (!href || !isNoteExternalHref(href)) return;
  event.preventDefault();
  void openNoteLink(href).catch((err) => toast.error(String(err)));
}
