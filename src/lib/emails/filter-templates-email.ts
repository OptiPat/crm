import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { textMatchesSearch } from "@/lib/search-utils";

export type TemplateCategoryFilter = "all" | string;

export function filterTemplatesEmail(
  templates: TemplateEmail[],
  query: string,
  category: TemplateCategoryFilter
): TemplateEmail[] {
  let list = templates;
  if (category !== "all") {
    list = list.filter((t) => t.categorie === category);
  }
  const q = query.trim();
  if (!q) return [...list].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  return list
    .filter((t) =>
      textMatchesSearch(q, t.nom, t.sujet, t.corps, t.categorie)
    )
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}
