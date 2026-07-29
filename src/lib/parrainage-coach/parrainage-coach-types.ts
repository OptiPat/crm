export type ParrainageScriptCanal = "APPEL" | "SMS";

export interface ParrainageScriptContent {
  accroche: string;
  corps: string;
  questionClosing: string;
  varianteSms?: string | null;
  siObjection?: string | null;
}

export interface ParrainageCoachChatTurn {
  role: "user" | "assistant" | string;
  content: string;
}

export const PARRAINAGE_SCRIPT_CANAL_LABELS: Record<ParrainageScriptCanal, string> = {
  APPEL: "Appel téléphonique",
  SMS: "SMS / message court",
};

export const PARRAINAGE_COACH_QUICK_PROMPTS = [
  "Plus court et direct",
  "Ton plus chaleureux",
  "Moins commercial",
  "Insiste sur la curiosité, pas la vente",
  "Version SMS uniquement",
  "Réponse si la personne hésite",
] as const;

export const PARRAINAGE_COACH_PRIVACY_ACK_KEY = "crm_parrainage_coach_privacy_ack";

export function formatParrainageScriptAsNote(script: ParrainageScriptContent): string {
  const lines = [
    `Accroche : ${script.accroche}`,
    "",
    script.corps,
    "",
    `Question : ${script.questionClosing}`,
  ];
  if (script.varianteSms?.trim()) {
    lines.push("", `SMS : ${script.varianteSms.trim()}`);
  }
  if (script.siObjection?.trim()) {
    lines.push("", `Si objection : ${script.siObjection.trim()}`);
  }
  return lines.join("\n");
}
