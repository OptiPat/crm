import type { IdentityExtractResult } from "@/lib/identity/parse-identity-document";
import { resolveIdentityUserMessage } from "@/lib/identity/identity-status-messages";

/** Traitement 100 % local — aucun envoi réseau (RGPD / minimisation). */
export const IDENTITY_LOCAL_PROCESSING_NOTICE =
  "Traitement entièrement local : l'image n'est pas envoyée à un service externe.";

export type IdentityApplyRequirements = {
  statusMessage: string;
  canSuggestApply: boolean;
};

export function getIdentityApplyRequirements(
  extracted: IdentityExtractResult | null
): IdentityApplyRequirements {
  if (!extracted) {
    return {
      statusMessage: "Aucune donnée extraite.",
      canSuggestApply: false,
    };
  }

  return {
    statusMessage: resolveIdentityUserMessage(extracted),
    canSuggestApply: true,
  };
}

export { summarizeMrzTrust } from "@/lib/identity/identity-status-messages";
