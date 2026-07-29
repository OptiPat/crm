import { invoke } from "@tauri-apps/api/core";
import type {
  ParrainageCoachChatTurn,
  ParrainageScriptCanal,
  ParrainageScriptContent,
} from "@/lib/parrainage-coach/parrainage-coach-types";

export type { ParrainageScriptContent, ParrainageCoachChatTurn };

export async function generateParrainageScript(input: {
  parrainagePipeId: number;
  canal: ParrainageScriptCanal;
}): Promise<ParrainageScriptContent> {
  return invoke<ParrainageScriptContent>("generate_parrainage_script", {
    input: {
      parrainagePipeId: input.parrainagePipeId,
      canal: input.canal,
    },
  });
}

export async function refineParrainageScript(input: {
  current: ParrainageScriptContent;
  message: string;
  history: ParrainageCoachChatTurn[];
}): Promise<ParrainageScriptContent> {
  return invoke<ParrainageScriptContent>("refine_parrainage_script", { input });
}
