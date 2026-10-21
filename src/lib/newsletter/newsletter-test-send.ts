import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import type { CgpConfig } from "@/lib/api/tauri-settings";

/**
 * Ligne de file fictive adressée au conseiller : l'email de test passe par le même rendu
 * que l'envoi réel (`renderEtiquetteEmailPreview`), avec le contenu enregistré sur l'édition.
 */
export function buildNewsletterTestQueueItem(input: {
  subject: string;
  plainBody: string;
  htmlMeta: string;
  cgp: Pick<CgpConfig, "prenom" | "nom" | "email"> | null;
}): EtiquetteEmailQueueItem {
  return {
    queue_row_kind: "etiquette",
    contact_etiquette_id: 0,
    contact_id: 0,
    contact_nom: input.cgp?.nom ?? "",
    contact_prenom: input.cgp?.prenom ?? "",
    contact_email: input.cgp?.email ?? null,
    contact_telephone: null,
    etiquette_id: 0,
    etiquette_nom: "Newsletter",
    etiquette_couleur: "",
    email_date_prevue: null,
    email_date_envoi: null,
    template_sujet: input.subject.trim(),
    template_corps: input.plainBody.trim(),
    template_agenda_link_id: null,
    template_variables: input.htmlMeta,
    template_categorie: "NEWSLETTER",
    queue_issue: null,
  };
}
