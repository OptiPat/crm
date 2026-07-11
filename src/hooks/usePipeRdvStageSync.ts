import { useEffect, useRef } from "react";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { applyDueRdvStageAdvance } from "@/lib/pipe/pipe-rdv-stage";

/** Applique les passages d'étape dus via RDV planifiés (jour J ou passé). */
export function usePipeRdvStageSync(
  pipe: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null,
  entries: PipeTimelineEntryRecord[],
  loading: boolean
) {
  const lastAppliedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!pipe || loading || pipe.pipe_type !== "AFFAIRE") return;

    const due = entries
      .filter((e) => e.entry_type === "RDV")
      .map((e) => `${e.id}:${e.occurred_at}:${e.titre ?? ""}`)
      .join("|");
    const key = `${pipe.id}:${pipe.stage}:${due}`;
    if (lastAppliedKey.current === key) return;

    void applyDueRdvStageAdvance(pipe, entries).then((updated) => {
      if (updated) lastAppliedKey.current = `${updated.id}:${updated.stage}:${due}`;
      else lastAppliedKey.current = key;
    });
  }, [pipe, entries, loading]);
}
