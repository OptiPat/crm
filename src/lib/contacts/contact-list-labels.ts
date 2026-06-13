import { getFilleulRoleBadgeClass } from "@/lib/contacts/contact-category-display";

export function getClientCategorieLabel(categorie: string): string | null {
  switch (categorie) {
    case "CLIENT":
      return "Client";
    case "PROSPECT_CLIENT":
      return "Prospect";
    case "SUSPECT_CLIENT":
      return "Suspect";
    case "AUCUN":
      return null;
    default:
      return categorie;
  }
}

export function getFilleulCategorieLabel(filleulCategorie: string): string {
  switch (filleulCategorie) {
    case "FILLEUL":
      return "Filleul inscrit";
    case "PROSPECT_FILLEUL":
      return "Prospect filleul";
    case "SUSPECT_FILLEUL":
      return "Suspect filleul";
    case "FILLEUL_DESINSCRIT":
      return "Filleul désinscrit";
    default:
      return filleulCategorie;
  }
}

export function getFilleulCategorieBadgeClass(filleulCategorie: string): string {
  return getFilleulRoleBadgeClass(filleulCategorie);
}

export function getFoyerRoleLabel(role: string): string {
  switch (role) {
    case "DECLARANT_1":
      return "Déclarant 1";
    case "DECLARANT_2":
      return "Déclarant 2";
    case "ENFANT":
      return "Enfant";
    default:
      return "Autre";
  }
}
