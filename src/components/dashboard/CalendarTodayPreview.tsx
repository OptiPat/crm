import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import {
  getCalendarEventsToday,
  markCalendarRdvEffectue,
  type CalendarEventEntry,
  type GoogleCalendarWeekEvent,
} from "@/lib/api/tauri-calendar";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { openExternalUrl } from "@/lib/api/tauri-system";
import { buildAgendaTodayRows, loadAgendaEventsToday, type AgendaTodayRow } from "@/lib/calendar/agenda-today";
import {
  notifyRelationChanged,
  subscribeRelationChanged,
} from "@/lib/etiquettes/etiquette-events";
import type { DashboardDrillDownOpenContact } from "@/lib/dashboard/dashboard-drill-down";
import { DashboardPanel } from "./dashboard-ui";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatTime(unix: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(unix * 1000));
}

function formatRowTime(row: AgendaTodayRow): string {
  if (row.kind === "crm_only") return formatTime(row.crm.start_at);
  if (row.google.all_day) return "Journée";
  return formatTime(row.google.start_at);
}

function isPipeLinkedRow(row: AgendaTodayRow): boolean {
  if (row.kind !== "google") return false;
  return row.google.pipe_timeline_entry_id != null && row.google.pipe_id != null;
}

function rowLabel(row: AgendaTodayRow): string {
  if (row.kind === "crm_only") {
    const crm = row.crm;
    return crm.contact_prenom && crm.contact_nom
      ? `${crm.contact_prenom} ${crm.contact_nom}`
      : crm.title;
  }
  const crm = row.crm;
  return crm?.contact_prenom && crm?.contact_nom
    ? `${crm.contact_prenom} ${crm.contact_nom}`
    : row.google.title;
}

function rowCrm(row: AgendaTodayRow): CalendarEventEntry | undefined {
  return row.kind === "crm_only" ? row.crm : row.crm;
}

export function CalendarTodayPreview({
  onOpenContact,
  onNavigate,
}: {
  onOpenContact?: DashboardDrillDownOpenContact;
  onNavigate?: (page: string) => void;
}) {
  const [agendaEvents, setAgendaEvents] = useState<GoogleCalendarWeekEvent[]>([]);
  const [crmEvents, setCrmEvents] = useState<CalendarEventEntry[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [agendaLoadFailed, setAgendaLoadFailed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setAgendaLoadFailed(false);

    let calendarConnected = false;
    try {
      const status = await getEmailConnectionStatus();
      calendarConnected = status.google_calendar_connected;
      setConnected(calendarConnected);
    } catch (e) {
      console.error(e);
      setConnected(null);
    }

    let crm: CalendarEventEntry[] = [];
    try {
      crm = await getCalendarEventsToday();
      setCrmEvents(crm);
    } catch (e) {
      console.error(e);
      setCrmEvents([]);
      setLoadError("Impossible de charger les RDV CRM.");
    }

    if (calendarConnected) {
      try {
        setAgendaEvents(await loadAgendaEventsToday());
      } catch (e) {
        console.error(e);
        setAgendaEvents([]);
        setAgendaLoadFailed(true);
        setLoadError((prev) => prev ?? "Impossible de charger Google Agenda.");
      }
    } else {
      setAgendaEvents([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    return subscribeRelationChanged(() => void load());
  }, [load]);

  const visibleRows = useMemo(
    () => buildAgendaTodayRows(agendaEvents, crmEvents),
    [agendaEvents, crmEvents]
  );

  const pendingContactIds = useMemo(
    () =>
      visibleRows
        .map((row) => rowCrm(row)?.contact_id)
        .filter((id): id is number => id != null),
    [visibleRows]
  );

  const markDone = async (crm: CalendarEventEntry) => {
    try {
      await markCalendarRdvEffectue(crm.id, crm.contact_id);
      toast.success("RDV marqué effectué");
      notifyRelationChanged(crm.contact_id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const openRow = async (row: AgendaTodayRow) => {
    const crm = rowCrm(row);
    if (crm && onOpenContact) {
      onOpenContact(crm.contact_id, pendingContactIds);
      return;
    }
    if (row.kind === "google" && row.google.html_link) {
      await openExternalUrl(row.google.html_link);
    }
  };

  const description = loading
    ? "Chargement…"
    : visibleRows.length > 0
      ? `${visibleRows.length} événement${visibleRows.length > 1 ? "s" : ""}`
      : connected === false
        ? "Google Agenda non connecté"
        : "Rien à l'agenda aujourd'hui";

  const panelAction =
    onNavigate != null ? (
      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onNavigate("agenda")}>
        Voir l&apos;agenda
      </Button>
    ) : null;

  return (
    <DashboardPanel
      title="Agenda du jour"
      description={description}
      className="h-full"
      action={panelAction}
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : visibleRows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {connected === false
            ? "Connectez Google Agenda dans Paramètres, ou planifiez un RDV depuis le CRM."
            : "Rien à l'agenda aujourd'hui"}
        </p>
      ) : (
        <div className="space-y-2">
          {loadError ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2">
              {loadError}
              {agendaLoadFailed ? " Les RDV CRM restent affichés." : ""}
            </p>
          ) : null}
          <ul className="space-y-2">
            {visibleRows.map((row) => {
              const crm = rowCrm(row);
              const pipe = isPipeLinkedRow(row);
              return (
                <li
                  key={row.key}
                  className={cn(
                    "flex items-center gap-2 text-sm rounded-lg border px-3 py-2 bg-card",
                    pipe && "border-emerald-300/60 bg-emerald-50/40",
                    row.kind === "crm_only" && "border-primary/20"
                  )}
                >
                  <span className="tabular-nums text-muted-foreground shrink-0 w-[4.5rem]">
                    {formatRowTime(row)}
                  </span>
                  <button
                    type="button"
                    className="flex-1 text-left truncate hover:underline min-w-0"
                    onClick={() => void openRow(row)}
                  >
                    {rowLabel(row)}
                  </button>
                  {row.kind === "crm_only" ? (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      CRM
                    </Badge>
                  ) : null}
                  {pipe ? (
                    <Badge variant="outline" className="text-[10px] shrink-0 border-emerald-400/60">
                      Pipe
                    </Badge>
                  ) : null}
                  {crm?.attendee_status === "accepted" && (
                    <span className="text-xs text-green-700 shrink-0">Confirmé</span>
                  )}
                  {crm ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      title="RDV effectué"
                      onClick={() => void markDone(crm)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </DashboardPanel>
  );
}
