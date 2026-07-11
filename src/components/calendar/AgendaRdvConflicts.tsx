import { useEffect, useMemo, useState } from "react";
import { listGoogleCalendarWeek, type GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  findAgendaConflicts,
  formatConflictTime,
} from "@/lib/calendar/agenda-conflicts";
import { datetimeLocalToUnix } from "@/lib/calendar/rdv-duration";
import {
  googleCalendarDayUrl,
  weekStartFromDatetimeLocal,
} from "@/lib/calendar/agenda-week";
import { openExternalUrl } from "@/lib/api/tauri-system";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink } from "lucide-react";
import {
  navigateToAgendaWeekWithHighlight,
  type AgendaRdvPipeDraft,
} from "@/lib/navigation/agenda-navigation";
import { dispatchAppNavigation } from "@/lib/navigation/app-navigation";

interface AgendaRdvConflictsProps {
  occurredAt: string;
  endAt?: string;
  enabled?: boolean;
  pipeDraft?: AgendaRdvPipeDraft | null;
}

export function AgendaRdvConflicts({
  occurredAt,
  endAt,
  enabled = true,
  pipeDraft,
}: AgendaRdvConflictsProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [events, setEvents] = useState<GoogleCalendarWeekEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotStart = occurredAt ? datetimeLocalToUnix(occurredAt) : null;
  const slotEnd =
    endAt && endAt.trim()
      ? datetimeLocalToUnix(endAt)
      : slotStart != null
        ? slotStart + 3600
        : null;
  const weekStart = weekStartFromDatetimeLocal(occurredAt);

  useEffect(() => {
    if (!enabled || !occurredAt || !weekStart) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const status = await getEmailConnectionStatus();
          if (cancelled) return;
          setConnected(status.google_calendar_connected);
          if (!status.google_calendar_connected) {
            setEvents([]);
            return;
          }
          const { events: items } = await listGoogleCalendarWeek(weekStart, {
            syncPipe: false,
          });
          if (!cancelled) setEvents(items);
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : String(e));
            setEvents([]);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, occurredAt, weekStart]);

  const conflicts = useMemo(() => {
    if (slotStart == null || slotEnd == null) return [];
    return findAgendaConflicts(events, slotStart, slotEnd);
  }, [events, slotEnd, slotStart]);

  const dayEvents = useMemo(() => {
    if (slotStart == null) return [];
    const dayStart = new Date(slotStart * 1000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = dayStart.getTime() / 1000 + 86_400;
    return events.filter((ev) => ev.start_at < dayEnd && ev.end_at > dayStart.getTime() / 1000);
  }, [events, slotStart]);

  if (!enabled || connected === false) return null;

  const dayDate = occurredAt ? new Date(occurredAt) : new Date();

  return (
    <div className="rounded-md border bg-muted/15 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Google Agenda — journée</p>
        <div className="flex gap-1">
          {weekStart != null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (weekStart == null || slotStart == null || slotEnd == null) return;
                navigateToAgendaWeekWithHighlight(
                  (page) => dispatchAppNavigation({ type: "page", page }),
                  weekStart,
                  slotStart,
                  slotEnd,
                  undefined,
                  pipeDraft
                );
              }}
            >
              Voir la semaine
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => void openExternalUrl(googleCalendarDayUrl(dayDate))}
          >
            <ExternalLink className="h-3 w-3" />
            Google
          </Button>
        </div>
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground">Chargement de la journée…</p>
      )}
      {error && <p className="text-xs text-amber-700">{error}</p>}

      {!loading && !error && dayEvents.length === 0 && (
        <p className="text-xs text-muted-foreground">Aucun autre événement ce jour-là.</p>
      )}

      {!loading && dayEvents.length > 0 && (
        <ul className="space-y-1">
          {dayEvents.map((ev) => (
            <li key={ev.google_event_id} className="text-xs flex gap-2">
              <span className="tabular-nums text-muted-foreground shrink-0">
                {ev.all_day
                  ? "Journée"
                  : `${formatConflictTime(ev.start_at)}–${formatConflictTime(ev.end_at)}`}
              </span>
              <span className="truncate">{ev.title}</span>
            </li>
          ))}
        </ul>
      )}

      {conflicts.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-300/80 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Chevauchement avec {conflicts.length} événement(s)</p>
            <ul className="mt-1 space-y-0.5">
              {conflicts.map((ev) => (
                <li key={ev.google_event_id}>
                  {ev.title} ({formatConflictTime(ev.start_at)}–{formatConflictTime(ev.end_at)})
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
