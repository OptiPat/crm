import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgendaWeekView } from "@/components/calendar/AgendaWeekView";
import {
  RdvPlanifierDialog,
  type RdvPlanifierContext,
} from "@/components/calendar/RdvPlanifierDialog";
import { useAgendaWeek } from "@/hooks/useAgendaWeek";
import {
  consumeAgendaNavigationHighlight,
  consumeAgendaNavigationWeekStart,
  consumeAgendaRdvPipeDraft,
} from "@/lib/navigation/agenda-navigation";
import {
  formatAgendaWeekRange,
  googleCalendarDayUrl,
  isCurrentWeek,
  startOfWeekMonday,
} from "@/lib/calendar/agenda-week";
import { openExternalUrl } from "@/lib/api/tauri-system";
import { requestOpenParametres } from "@/lib/navigation/app-navigation";
import { cn } from "@/lib/utils";

interface AgendaProps {
  onNavigate?: (page: string) => void;
}

export function Agenda({ onNavigate }: AgendaProps) {
  const initialWeek = consumeAgendaNavigationWeekStart();
  const initialHighlight = consumeAgendaNavigationHighlight();
  const {
    weekStartAt,
    events,
    loading,
    error,
    connected,
    goPrevWeek,
    goNextWeek,
    goToday,
    refreshWeek,
  } = useAgendaWeek(initialWeek ?? undefined);

  const [refreshing, setRefreshing] = useState(false);
  const [planifierOpen, setPlanifierOpen] = useState(false);
  const [planifierContext, setPlanifierContext] = useState<RdvPlanifierContext>({ kind: "agenda" });
  const [slotDefaults, setSlotDefaults] = useState<{
    startAt?: number;
    endAt?: number;
  }>({});

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshWeek();
    } finally {
      setRefreshing(false);
    }
  };

  if (connected === false) {
    return (
      <div className="max-w-lg mx-auto rounded-xl border border-dashed p-8 text-center space-y-4">
        <h2 className="text-lg font-semibold">Google Agenda non connecté</h2>
        <p className="text-sm text-muted-foreground">
          Connectez Google Agenda dans Paramètres → Emails &amp; envois → Connexion pour afficher
          votre semaine et détecter les chevauchements lors des RDV Pipe.
        </p>
        {onNavigate && (
          <Button
            type="button"
            onClick={() =>
              requestOpenParametres("email-connexion", {
                currentPage: "agenda",
                setCurrentPage: onNavigate,
                scrollToId: "email-oauth",
              })
            }
          >
            Ouvrir Paramètres
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{formatAgendaWeekRange(weekStartAt)}</h2>
          <p className="text-sm text-muted-foreground">
            Semaine du {startOfWeekMonday(new Date(weekStartAt * 1000)).toLocaleDateString("fr-FR")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={goPrevWeek} aria-label="Semaine précédente">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={isCurrentWeek(weekStartAt) ? "secondary" : "outline"}
            size="sm"
            onClick={goToday}
          >
            Aujourd&apos;hui
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={goNextWeek} aria-label="Semaine suivante">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void handleRefresh()}
            disabled={refreshing || loading}
            aria-label="Actualiser"
          >
            <RefreshCw className={cn("h-4 w-4", (refreshing || loading) && "animate-spin")} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => void openExternalUrl(googleCalendarDayUrl(new Date()))}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Google Agenda
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {error}
        </div>
      )}

      <AgendaWeekView
        weekStartAt={weekStartAt}
        events={events}
        loading={loading}
        highlightStartAt={initialHighlight?.startAt ?? null}
        highlightEndAt={initialHighlight?.endAt ?? null}
        onSlotClick={({ startAt, endAt }) => {
          const draft = consumeAgendaRdvPipeDraft();
          setPlanifierContext(
            draft
              ? {
                  kind: "pipe",
                  pipe: draft.pipe,
                  rdvStage: draft.rdvStage,
                  contenu: draft.contenu,
                }
              : { kind: "agenda" }
          );
          setSlotDefaults({ startAt, endAt });
          setPlanifierOpen(true);
        }}
      />

      <RdvPlanifierDialog
        open={planifierOpen}
        onOpenChange={setPlanifierOpen}
        context={planifierContext}
        defaultStartUnix={slotDefaults.startAt}
        defaultEndUnix={slotDefaults.endAt}
        onCreated={() => void refreshWeek()}
      />
    </div>
  );
}
