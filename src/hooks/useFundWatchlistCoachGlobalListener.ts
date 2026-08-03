import { useEffect } from "react";
import { toast } from "sonner";
import { fundWatchlistCoachReportInProgress } from "@/lib/api/tauri-fund-watchlist";
import {
  subscribeFundWatchlistCoachReportDone,
  subscribeFundWatchlistCoachReportProgress,
  FUND_WATCHLIST_COACH_TOAST_ID,
} from "@/lib/fund-watchlist/fund-watchlist-coach-events";
import { formatCoachProgressToast } from "@/lib/fund-watchlist/fund-watchlist-coach-progress";
import {
  clearCoachGenerationPending,
  isCoachGenerationPending,
  requestCoachOpenDialog,
  saveCoachGenerating,
  saveCoachProgress,
  saveCoachReport,
} from "@/lib/fund-watchlist/fund-watchlist-coach-store";

const POLL_MS = 5_000;

/** Toast + sessionStorage : le rapport Coach survit à la navigation hors Veille fonds. */
export function useFundWatchlistCoachGlobalListener(
  enabled: boolean,
  onNavigateToVeilleFonds?: () => void
): void {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const syncGenerating = async () => {
      const inProgress = await fundWatchlistCoachReportInProgress();
      if (cancelled) return;
      if (inProgress) {
        saveCoachGenerating(true);
      } else if (!isCoachGenerationPending()) {
        saveCoachGenerating(false);
      }
    };

    void syncGenerating();
    const poll = window.setInterval(() => void syncGenerating(), POLL_MS);

    const unsubProgress = subscribeFundWatchlistCoachReportProgress((progress) => {
      saveCoachProgress(progress);
      toast.loading(formatCoachProgressToast(progress), {
        id: FUND_WATCHLIST_COACH_TOAST_ID,
      });
    });

    const unsub = subscribeFundWatchlistCoachReportDone((event) => {
      clearCoachGenerationPending();
      saveCoachGenerating(false);
      saveCoachProgress(null);
      if (event.ok && event.report) {
        saveCoachReport(event.report);
        const warningCount = event.report.warnings.length;
        toast.success("Rapport Coach prêt.", {
          id: FUND_WATCHLIST_COACH_TOAST_ID,
          description:
            warningCount > 0
              ? `${warningCount} avertissement(s) — cliquez pour ouvrir.`
              : "Cliquez pour ouvrir le rapport.",
          action: {
            label: "Ouvrir",
            onClick: () => {
              requestCoachOpenDialog();
              onNavigateToVeilleFonds?.();
            },
          },
        });
      } else {
        toast.error(event.error ?? "Échec génération rapport Coach.", {
          id: FUND_WATCHLIST_COACH_TOAST_ID,
        });
      }
    });

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      unsubProgress();
      unsub();
    };
  }, [enabled, onNavigateToVeilleFonds]);
}
