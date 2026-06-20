import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { emailEnvoiJoursSemaineLabel } from "@/lib/emails/email-envoi-schedule";
import { getTemplateCategoryMeta } from "@/lib/emails/template-email-meta";
import { isExceltisEtiquetteNom } from "@/lib/etiquettes/exceltis";

export type EmailEnvoiMode = "eligibility" | "fixed";

export interface EmailCampaignSummaryInput {
  active: boolean;
  template: TemplateEmail | null;
  mode: EmailEnvoiMode;
  envoiHeure: string;
  envoiLocal: string;
  emailDelaiJours: number;
  emailEnvoiJoursSemaine?: string | null;
  hasAutoRule: boolean;
  etiquetteNom: string;
  isEventSouscription?: boolean;
  /** Déduit du nom si omis. */
  isExceltisEtiquette?: boolean;
}

function isExceltisCampaign(input: EmailCampaignSummaryInput): boolean {
  return input.isExceltisEtiquette ?? isExceltisEtiquetteNom(input.etiquetteNom);
}

export function formatEmailCampaignSummary(input: EmailCampaignSummaryInput): string {
  if (!input.active) {
    return "Campagne désactivée — aucun email ne sera proposé dans Suivi → Envois.";
  }

  if (!input.template) {
    return "Choisissez un modèle d'email pour activer la file d'envoi.";
  }

  const tpl = `${input.template.nom} (${getTemplateCategoryMeta(input.template.categorie).label})`;

  if (isExceltisCampaign(input)) {
    if (input.envoiLocal.trim()) {
      const dateLabel = new Date(input.envoiLocal).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `Modèle : ${tpl}. Date fixe forcée le ${dateLabel} (ignore le mail Stellium).`;
    }
    return `Modèle : ${tpl}. Envoi proposé dès réception du mail Stellium « Remboursement Exceltis » pour ce millésime — aucune date à saisir.`;
  }

  if (input.mode === "eligibility") {
    const heure = input.envoiHeure.trim() || "09:00";
    if (!input.hasAutoRule) {
      return `Modèle : ${tpl}. Mode « à l'éligibilité » nécessite une règle auto sur l'onglet Règle.`;
    }
    const delai = input.emailDelaiJours;
    const delaiLabel =
      delai > 0
        ? `${delai} jour${delai > 1 ? "s" : ""} après ${
            input.isEventSouscription ? "la souscription" : "l'attribution de l'étiquette"
          }, puis `
        : "";
    const jourLabel = emailEnvoiJoursSemaineLabel(input.emailEnvoiJoursSemaine);
    const jourPart = jourLabel ? `, ${jourLabel.toLowerCase()}` : "";
    return `Modèle : ${tpl}. Dès qu'un contact reçoit l'étiquette « ${input.etiquetteNom || "…"} », email proposé ${delaiLabel}à ${heure}${jourPart} (Suivi → Envois).`;
  }

  const dateLabel = input.envoiLocal.trim()
    ? new Date(input.envoiLocal).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "date à définir";

  return `Modèle : ${tpl}. Envoi groupé le ${dateLabel} pour tous les contacts portant l'étiquette.`;
}
