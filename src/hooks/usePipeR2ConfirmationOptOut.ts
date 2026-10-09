import { useEffect, useState } from "react";
import {
  listPipeTimelineEntries,
  type PipeTimelineEntryRecord,
} from "@/lib/api/tauri-pipe-timeline";
import { offerSkipR2ConfirmationEmail } from "@/lib/pipe/pipe-r2-confirmation-opt-out";
import type { PipeRdvPlanOption } from "@/lib/pipe/pipe-rdv-plan-option";

/** Case cochée par défaut : le mail part, sauf si l'utilisateur la décoche pour un 2e R2. */
export function usePipeR2ConfirmationOptOut(
  pipeId: number | null | undefined,
  planOption: PipeRdvPlanOption,
  active: boolean
) {
  const [entries, setEntries] = useState<PipeTimelineEntryRecord[]>([]);
  const [sendConfirmationEmail, setSendConfirmationEmail] = useState(true);

  useEffect(() => {
    if (active) setSendConfirmationEmail(true);
  }, [active, pipeId]);

  useEffect(() => {
    if (!active || pipeId == null || pipeId <= 0) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    setEntries([]);
    void listPipeTimelineEntries(pipeId)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [active, pipeId]);

  const offer = active && offerSkipR2ConfirmationEmail(entries, planOption);

  return {
    offer,
    sendConfirmationEmail: offer ? sendConfirmationEmail : true,
    setSendConfirmationEmail,
  };
}
