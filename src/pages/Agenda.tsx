import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgendaWeekView } from "@/components/calendar/AgendaWeekView";
import { AgendaPipeRdvManageDialog } from "@/components/calendar/AgendaPipeRdvManageDialog";
import {
  RdvPlanifierDialog,
  type RdvPlanifierContext,
} from "@/components/calendar/RdvPlanifierDialog";
import { useAgendaWeek } from "@/hooks/useAgendaWeek";
import {
  consumeAgendaNavigationHighlight,
  consumeAgendaNavigationWeekStart,
  consumeAgendaRdvPipeDraft,
  peekAgendaRdvPipeDraft,
  subscribeAgendaNavigationWeek,
  type AgendaRdvPipeDraft,
} from "@/lib/navigation/agenda-navigation";
import {
  formatAgendaWeekRange,
  googleCalendarDayUrl,
  isCurrentWeek,
  startOfWeekMonday,
} from "@/lib/calendar/agenda-week";
import type { GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";
import { openExternalUrl } from "@/lib/api/tauri-system";
import { requestOpenParametres } from "@/lib/navigation/app-navigation";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";
import { notifyPipeChanged } from "@/lib/pipe/pipe-events";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
    lastSync,
    goToWeek,
    goPrevWeek,
    goNextWeek,
    goToday,
    refreshWeek,
  } = useAgendaWeek(initialWeek ?? undefined);

  const [navHighlight, setNavHighlight] = useState(initialHighlight);

  const [refreshing, setRefreshing] = useState(false);
  const [planifierOpen, setPlanifierOpen] = useState(false);
  const [planifierContext, setPlanifierContext] = useState<RdvPlanifierContext>({ kind: "agenda" });
  const [pipeManageOpen, setPipeManageOpen] = useState(false);
  const [selectedPipeEvent, setSelectedPipeEvent] = useState<GoogleCalendarWeekEvent | null>(null);
  const [slotDefaults, setSlotDefaults] = useState<{
    startAt?: number;
    endAt?: number;
  }>({});

  const openPlanifierFromPipeDraft = useCallback(
    (draft: AgendaRdvPipeDraft, startAt: number, endAt: number) => {
      setPlanifierContext({
        kind: "pipe",
        pipe: draft.pipe,
        rdvStage: draft.rdvStage,
        contenu: draft.contenu,
      });
      setSlotDefaults({ startAt, endAt });
      setPlanifierOpen(true);
      consumeAgendaRdvPipeDraft();
    },
    []
  );

  useEffect(() => {
    const draft = peekAgendaRdvPipeDraft();
    if (draft && initialHighlight) {
      openPlanifierFromPipeDraft(
        draft,
        initialHighlight.startAt,
        initialHighlight.endAt
      );
    }
  }, [initialHighlight, openPlanifierFromPipeDraft]);

  useEffect(() => {
    return subscribeAgendaNavigationWeek(({ weekStartAt: targetWeek, highlight }) => {
      goToWeek(targetWeek);
      setNavHighlight(highlight ?? null);
      const draft = peekAgendaRdvPipeDraft();
      if (draft && highlight) {
        openPlanifierFromPipeDraft(draft, highlight.startAt, highlight.endAt);
      }
    });
  }, [goToWeek, openPlanifierFromPipeDraft]);

  useEffect(() => {
    if (!lastSync) return;
    if (lastSync.rescheduled > 0) {
      toast.success(
        lastSync.rescheduled === 1
          ? "1 RDV Pipe mis à jour depuis Google Agenda"
          : `${lastSync.rescheduled} RDV Pipe mis à jour depuis Google Agenda`
      );
    }
    if (lastSync.rescheduled > 0 || lastSync.cancelled > 0) {
      notifyContactsChanged();
      notifyPipeChanged();
    }
    if (lastSync.cancelled > 0) {
      toast.success(
        lastSync.cancelled === 1
          ? "1 RDV annulé dans Google — Pipe mis à jour"
          : `${lastSync.cancelled} RDV annulés dans Google — Pipe mis à jour`
      );
    }
  }, [lastSync]);

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
        highlightStartAt={navHighlight?.startAt ?? null}
        highlightEndAt={navHighlight?.endAt ?? null}
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
        onPipeEventClick={(ev) => {
          setSelectedPipeEvent(ev);
          setPipeManageOpen(true);
        }}
      />

      <AgendaPipeRdvManageDialog
        open={pipeManageOpen}
        onOpenChange={setPipeManageOpen}
        event={selectedPipeEvent}
        onChanged={() => void refreshWeek()}
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
