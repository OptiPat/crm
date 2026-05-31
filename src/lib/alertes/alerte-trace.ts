import type { AlerteWithContact } from "@/lib/api/tauri-dashboard";

export type AlerteTraceInfo = {
  source: string;
  rule: string;
  detail: string;
  /** Jours depuis la création de l'alerte (urgence relative). */
  daysOpen: number | null;
};

const SECONDS_PER_DAY = 24 * 60 * 60;

function daysSinceTimestamp(ts: number | null | undefined, nowSec: number): number | null {
  if (ts == null || ts <= 0) return null;
  return Math.floor((nowSec - ts) / SECONDS_PER_DAY);
}

function parseAlerteCreatedAt(dateAlerte: string | number): number | null {
  const ts =
    typeof dateAlerte === "string" ? parseInt(dateAlerte, 10) : dateAlerte;
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

/** Explication métier : pourquoi cette alerte existe (règle CGP + données contact). */
export function getAlerteTraceInfo(alerte: AlerteWithContact): AlerteTraceInfo {
  const nowSec = Math.floor(Date.now() / 1000);
  const createdTs = parseAlerteCreatedAt(alerte.date_alerte);
  const daysOpen = createdTs != null ? daysSinceTimestamp(createdTs, nowSec) : null;
  const lastContact = alerte.date_dernier_contact;
  const daysSinceContact =
    lastContact != null ? daysSinceTimestamp(lastContact, nowSec) : null;

  const source = "Génération automatique au chargement du Suivi ou du tableau de bord";

  switch (alerte.type_alerte) {
    case "SUIVI_CLIENT_1AN":
    case "SUIVI_CLIENT_ANNUEL":
      return {
        source,
        rule: "Client actif — sans contact depuis au moins 12 mois",
        detail:
          daysSinceContact != null
            ? `Dernier contact client il y a ${daysSinceContact} jour${daysSinceContact > 1 ? "s" : ""}.`
            : "Aucune date de dernier contact client enregistrée.",
        daysOpen,
      };
    case "CLIENT_JAMAIS_SUIVI":
      return {
        source,
        rule: "Client — jamais de contact enregistré",
        detail: "La date de dernier contact client est vide.",
        daysOpen,
      };
    case "LEAD_SUIVI_6MOIS":
    case "SUIVI_PROSPECT_6MOIS":
      return {
        source,
        rule: "Prospect / suspect client — sans contact depuis au moins 6 mois",
        detail:
          daysSinceContact != null
            ? `Dernier contact il y a ${daysSinceContact} jour${daysSinceContact > 1 ? "s" : ""}.`
            : "Aucune date de dernier contact.",
        daysOpen,
      };
    case "LEAD_JAMAIS_CONTACTE":
      return {
        source,
        rule: "Prospect / suspect — jamais contacté",
        detail: "Aucune date de dernier contact client.",
        daysOpen,
      };
    case "SUIVI_FILLEUL_1AN":
      return {
        source,
        rule: "Filleul actif — sans suivi filleul depuis au moins 12 mois",
        detail:
          daysSinceContact != null
            ? `Dernier suivi filleul (ou contact) il y a ${daysSinceContact} jour${daysSinceContact > 1 ? "s" : ""}.`
            : "Aucune date de suivi filleul.",
        daysOpen,
      };
    case "FILLEUL_SUIVI_6MOIS":
      return {
        source,
        rule: "Prospect / suspect filleul — sans suivi depuis au moins 6 mois",
        detail:
          daysSinceContact != null
            ? `Dernier suivi il y a ${daysSinceContact} jour${daysSinceContact > 1 ? "s" : ""}.`
            : "Aucune date de suivi filleul.",
        daysOpen,
      };
    case "FILLEUL_JAMAIS_CONTACTE":
      return {
        source,
        rule: "Filleul — jamais de suivi enregistré",
        detail: "Aucune date de dernier contact filleul.",
        daysOpen,
      };
    case "FIN_DEMEMBREMENT":
      return {
        source,
        rule: "Patrimoine — fin de démembrement SCPI à échéance",
        detail:
          alerte.message.trim() ||
          "Vérifiez les investissements SCPI à démembrement du contact ou de son foyer.",
        daysOpen,
      };
    case "ANNIVERSAIRE":
      return {
        source,
        rule: "Date d'anniversaire approchante",
        detail: alerte.message.trim() || "Date de naissance dans la fenêtre d'alerte.",
        daysOpen,
      };
    default:
      return {
        source,
        rule: "Règle automatique",
        detail: alerte.message.trim() || alerte.type_alerte,
        daysOpen,
      };
  }
}
