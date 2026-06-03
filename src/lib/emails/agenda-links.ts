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

/** Identifiant stocké sans préfixe redondant `lien_agenda_`. */
export function normalizeAgendaLinkId(raw: string): string {
  const slug = slugifyAgendaLinkId(raw);
  if (slug === "lien_agenda") return "principal";
  const prefix = "lien_agenda_";
  if (slug.startsWith(prefix)) {
    const trimmed = slug.slice(prefix.length).replace(/^_|_$/g, "");
    return trimmed || "principal";
  }
  return slug;
}

/** Clé variable template (`lien_agenda_suivi`) sans double préfixe. */
export function agendaLinkVariableKey(linkId: string): string {
  const id = normalizeAgendaLinkId(linkId);
  if (id === "lien_agenda") return "lien_agenda";
  return `lien_agenda_${id}`;
}

export function agendaLinkVariableToken(linkId: string): string {
  return `{{${agendaLinkVariableKey(linkId)}}}`;
}

/** Liens Google Agenda du profil CGP (migration depuis ancien lien unique). */
export function normalizeAgendaLinks(cgp: CgpConfig | null | undefined): AgendaLink[] {
  const mapLink = (link: AgendaLink): AgendaLink => ({
    ...link,
    id: normalizeAgendaLinkId(link.id),
  });

  if (cgp?.agenda_links?.length) {
    return cgp.agenda_links.filter((l) => l.url.trim()).map(mapLink);
  }
  const legacy = cgp?.lien_agenda ?? cgp?.lien_calendly;
  if (legacy?.trim()) {
    return [{ id: "principal", label: "Principal", url: legacy.trim() }];
  }
  return [];
}

function findAgendaLink(links: AgendaLink[], linkId: string): AgendaLink | undefined {
  const normalized = normalizeAgendaLinkId(linkId);
  return links.find(
    (l) =>
      l.id === linkId ||
      l.id === normalized ||
      normalizeAgendaLinkId(l.id) === normalized
  );
}

export function resolveAgendaUrl(
  cgp: CgpConfig | null | undefined,
  agendaLinkId: string | null | undefined
): string {
  const links = normalizeAgendaLinks(cgp);
  if (!links.length) return "";
  if (agendaLinkId) {
    return findAgendaLink(links, agendaLinkId)?.url ?? "";
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
    vars[agendaLinkVariableKey(link.id)] = link.url;
  }
  return vars;
}

export function createEmptyAgendaLink(): AgendaLink {
  const id = `lien_${Date.now()}`;
  return { id, label: "Nouveau lien", url: "" };
}

/** Corrige les tokens dupliqués (ex. {{lien_agenda_lien_agenda_suivi}}). */
export function normalizeBrokenAgendaTokens(text: string): string {
  return text
    .replace(/\{\{lien_agenda_lien_agenda_([^}]+)\}\}/g, "{{lien_agenda_$1}}")
    .replace(/\{\{lien_agenda_lien_agenda\}\}/g, "{{lien_agenda}}");
}
