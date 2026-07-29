import type { ParrainagePipeRecord } from "@/lib/api/tauri-parrainage-pipe";
import {
  PARRAINAGE_PIPE_BOARD_STAGES,
  type ParrainagePipeStage,
} from "@/lib/parrainage-pipe/parrainage-pipe-types";

export function groupParrainagePipesByStage(
  pipes: ParrainagePipeRecord[]
): Record<ParrainagePipeStage, ParrainagePipeRecord[]> {
  const grouped = Object.fromEntries(
    PARRAINAGE_PIPE_BOARD_STAGES.map((stage) => [stage, [] as ParrainagePipeRecord[]])
  ) as Record<ParrainagePipeStage, ParrainagePipeRecord[]>;

  for (const pipe of pipes) {
    const stage = pipe.stage as ParrainagePipeStage;
    if (grouped[stage]) {
      grouped[stage].push(pipe);
    }
  }
  return grouped;
}
