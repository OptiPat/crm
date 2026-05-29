import { isFilleulStatut } from "@/lib/contacts/contact-form-utils";

/** Badges catégorie « affichage » (dashboard alertes, liste filtrée). */
export const CONTACT_DISPLAY_CATEGORY_BADGE_CLASS: Record<string, string> = {
  CLIENT: "bg-green-100 text-green-800 border-green-200",
  PROSPECT_CLIENT: "bg-blue-100 text-blue-800 border-blue-200",
  PROSPECT_FILLEUL: "bg-purple-100 text-purple-800 border-purple-200",
  SUSPECT_CLIENT: "bg-slate-100 text-slate-800 border-slate-200",
  SUSPECT_FILLEUL: "bg-amber-100 text-amber-800 border-amber-200",
};

export const CONTACT_DISPLAY_CATEGORY_LABELS: Record<string, string> = {
  CLIENT: "Client",
  PROSPECT_CLIENT: "Prospect client",
  PROSPECT_FILLEUL: "Prospect filleul",
  SUSPECT_CLIENT: "Suspect client",
  SUSPECT_FILLEUL: "Suspect filleul",
};

export function getDisplayCategorieBadgeClass(displayCategorie: string): string {
  return (
    CONTACT_DISPLAY_CATEGORY_BADGE_CLASS[displayCategorie] ?? "bg-muted"
  );
}

/** Classe Tailwind badge selon catégorie client + filleul (fiche contact, liste contacts). */
export function getContactCategorieBadgeClass(
  categorie: string,
  filleulCategorie?: string | null
): string {
  const fc =
    filleulCategorie || (isFilleulStatut(categorie) ? categorie : null);
  if (fc) {
    switch (fc) {
      case "FILLEUL":
        return "bg-indigo-100 text-indigo-800";
      case "PROSPECT_FILLEUL":
        return "bg-purple-100 text-purple-800";
      case "SUSPECT_FILLEUL":
        return "bg-amber-100 text-amber-800";
      case "FILLEUL_DESINSCRIT":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }
  switch (categorie) {
    case "CLIENT":
      return "bg-green-100 text-green-800";
    case "PROSPECT_CLIENT":
      return "bg-blue-100 text-blue-800";
    case "SUSPECT_CLIENT":
      return "bg-slate-100 text-slate-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}
