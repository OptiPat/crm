import type { Contact } from "@/lib/api/tauri-contacts";

export type ContactsPipelineStage = "suspects" | "prospects" | "clients";

export const CONTACTS_PIPELINE_STAGE_LABELS: Record<ContactsPipelineStage, string> = {
  suspects: "Pipeline : Suspects",
  prospects: "Pipeline : Prospects",
  clients: "Pipeline : Clients",
};

/** Aligné sur `get_pipeline_stats` (dashboard_stats.rs). */
export function contactMatchesPipelineStage(
  contact: Pick<Contact, "categorie" | "filleul_categorie">,
  stage: ContactsPipelineStage
): boolean {
  switch (stage) {
    case "suspects":
      return (
        contact.categorie === "SUSPECT_CLIENT" ||
        contact.filleul_categorie === "SUSPECT_FILLEUL" ||
        (contact.filleul_categorie == null && contact.categorie === "SUSPECT_FILLEUL")
      );
    case "prospects":
      return (
        contact.categorie === "PROSPECT_CLIENT" ||
        contact.filleul_categorie === "PROSPECT_FILLEUL" ||
        (contact.filleul_categorie == null && contact.categorie === "PROSPECT_FILLEUL")
      );
    case "clients":
      return contact.categorie === "CLIENT";
    default:
      return false;
  }
}
