/** Libellés et styles des types d'alerte (partagés Suivi / Dashboard). */

export function getTypeAlerteLabel(type: string): string {
  switch (type) {
    case "SUIVI_CLIENT_1AN":
    case "SUIVI_CLIENT_ANNUEL":
      return "Suivi client +1 an";
    case "CLIENT_JAMAIS_SUIVI":
      return "Client jamais suivi";
    case "LEAD_SUIVI_6MOIS":
    case "SUIVI_PROSPECT_6MOIS":
      return "Suivi prospect +6 mois";
    case "LEAD_JAMAIS_CONTACTE":
      return "Prospect jamais contacté";
    case "SUIVI_FILLEUL_1AN":
      return "Filleul suivi +1 an";
    case "FILLEUL_SUIVI_6MOIS":
      return "Filleul suivi +6 mois";
    case "FILLEUL_JAMAIS_CONTACTE":
      return "Filleul jamais contacté";
    case "FIN_DEMEMBREMENT":
      return "Fin démembrement";
    case "ANNIVERSAIRE":
      return "Anniversaire";
    default:
      return type.replace(/_/g, " ").toLowerCase();
  }
}

export function getTypeAlerteBadgeClass(type: string): string {
  switch (type) {
    case "SUIVI_CLIENT_1AN":
    case "SUIVI_CLIENT_ANNUEL":
    case "CLIENT_JAMAIS_SUIVI":
      return "bg-red-100 text-red-800 border-red-200";
    case "LEAD_SUIVI_6MOIS":
    case "SUIVI_PROSPECT_6MOIS":
    case "LEAD_JAMAIS_CONTACTE":
    case "FILLEUL_SUIVI_6MOIS":
    case "FILLEUL_JAMAIS_CONTACTE":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "FIN_DEMEMBREMENT":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "ANNIVERSAIRE":
      return "bg-purple-100 text-purple-800 border-purple-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}
