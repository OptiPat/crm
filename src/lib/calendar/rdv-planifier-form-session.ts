/**
 * Clé d'initialisation du formulaire « Planifier un RDV ».
 * Ignore l'identité de l'objet : un re-render parent ne doit pas remettre la date du jour.
 */
export function rdvPlanifierFormSessionKey(context: {
  kind: string;
  pipe?: { id: number };
  rdvPlanOption?: string;
  rdvStage?: string;
  contactId?: number;
  alerteId?: number | null;
  tacheId?: number | null;
}): string {
  if (context.kind === "pipe" && context.pipe) {
    return `pipe:${context.pipe.id}:${context.rdvPlanOption ?? ""}:${context.rdvStage ?? ""}`;
  }
  if (context.kind === "linked") {
    return `linked:${context.contactId ?? 0}:${context.alerteId ?? ""}:${context.tacheId ?? ""}`;
  }
  return "agenda";
}
