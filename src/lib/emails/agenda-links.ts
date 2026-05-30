import type { CgpConfig } from "@/lib/api/tauri-settings";

export type AgendaLink = {
  id: string;
  label: string;
  url: string;
};

export function slugifyAgendaLinkId(label: string): string {
  const base = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return base || `lien_${Date.now()}`;
}

/** Liens Google Agenda du profil CGP (migration depuis ancien lien unique). */
export function normalizeAgendaLinks(cgp: CgpConfig | null | undefined): AgendaLink[] {
  if (cgp?.agenda_links?.length) {
    return cgp.agenda_links.filter((l) => l.url.trim());
  }
  const legacy = cgp?.lien_agenda ?? cgp?.lien_calendly;
  if (legacy?.trim()) {
    return [{ id: "principal", label: "Principal", url: legacy.trim() }];
  }
  return [];
}

export function resolveAgendaUrl(
  cgp: CgpConfig | null | undefined,
  agendaLinkId: string | null | undefined
): string {
  const links = normalizeAgendaLinks(cgp);
  if (!links.length) return "";
  if (agendaLinkId) {
    return links.find((l) => l.id === agendaLinkId)?.url ?? "";
  }
  return links[0]?.url ?? "";
}

/** Variables template : {{lien_agenda}} + {{lien_agenda_<id>}} pour chaque lien. */
export function buildAgendaTemplateVariables(
  cgp: CgpConfig | null | undefined,
  templateAgendaLinkId?: string | null
): Record<string, string> {
  const links = normalizeAgendaLinks(cgp);
  const vars: Record<string, string> = {
    lien_agenda: resolveAgendaUrl(cgp, templateAgendaLinkId),
    lien_calendly: resolveAgendaUrl(cgp, templateAgendaLinkId),
  };
  for (const link of links) {
    vars[`lien_agenda_${link.id}`] = link.url;
  }
  return vars;
}

export function createEmptyAgendaLink(): AgendaLink {
  const id = `lien_${Date.now()}`;
  return { id, label: "Nouveau lien", url: "" };
}
