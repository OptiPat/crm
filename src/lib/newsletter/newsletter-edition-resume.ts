import type { NewsletterEditionSummary } from "@/lib/api/tauri-newsletter";

/** Édition encore enviable (y compris « Terminée » à 0/N par bug d'envoi). */
export function isResumableNewsletterEdition(edition: NewsletterEditionSummary): boolean {
  return (
    edition.status === "prepared" ||
    edition.status === "partial" ||
    edition.status === "sending" ||
    (edition.status === "completed" && edition.sentCount < edition.queuedCount)
  );
}

export function newsletterEditionStatusLabel(edition: NewsletterEditionSummary): string {
  if (edition.status === "completed" && edition.sentCount < edition.queuedCount) {
    return "Envoi à relancer";
  }
  switch (edition.status) {
    case "prepared":
      return "Préparée";
    case "sending":
      return "Envoi en cours";
    case "completed":
      return "Terminée";
    case "partial":
      return "Partielle";
    case "cancelled":
      return "Annulée";
    default:
      return edition.status;
  }
}
