import type { GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";
import { openExternalUrl } from "@/lib/api/tauri-system";
import {
  agendaGridHeightPx,
  agendaHourLineTopPx,
  agendaSlotStartUnixFromClick,
  AGENDA_GRID_END_HOUR,
  AGENDA_GRID_HOUR_COUNT,
  AGENDA_GRID_START_HOUR,
  AGENDA_HOUR_HEIGHT_PX,
  eventDayIndex,
  eventLayoutHeightPx,
  eventLayoutTopPx,
  formatWeekdayHeader,
  hourLabels,
  isTodayInWeek,
  weekdayLabels,
} from "@/lib/calendar/agenda-week";
import { DEFAULT_RDV_DURATION_MINUTES } from "@/lib/calendar/rdv-duration";
import { cn } from "@/lib/utils";

interface AgendaWeekViewProps {
  weekStartAt: number;
  events: GoogleCalendarWeekEvent[];
  loading?: boolean;
  highlightStartAt?: number | null;
  highlightEndAt?: number | null;
  onSlotClick?: (slot: { startAt: number; endAt: number; dayIndex: number }) => void;
  onPipeEventClick?: (event: GoogleCalendarWeekEvent) => void;
}

function isPipeLinkedEvent(ev: GoogleCalendarWeekEvent): boolean {
  return ev.pipe_timeline_entry_id != null && ev.pipe_id != null;
}

function formatEventTime(startAt: number, endAt: number, allDay: boolean): string {
  if (allDay) return "Journée";
  const fmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${fmt.format(new Date(startAt * 1000))}–${fmt.format(new Date(endAt * 1000))}`;
}

export function AgendaWeekView({
  weekStartAt,
  events,
  loading = false,
  highlightStartAt = null,
  highlightEndAt = null,
  onSlotClick,
  onPipeEventClick,
}: AgendaWeekViewProps) {
  const hours = hourLabels();
  const gridHeight = agendaGridHeightPx();
  const hourLines = Array.from({ length: AGENDA_GRID_HOUR_COUNT + 1 }, (_, i) => i);
  const days = weekdayLabels().map((_, dayIndex) => dayIndex);

  const timedEvents = events.filter((ev) => !ev.all_day);
  const allDayEvents = events.filter((ev) => ev.all_day);

  const highlightDayIndex =
    highlightStartAt != null ? eventDayIndex(highlightStartAt, weekStartAt) : null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[880px]">
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b bg-muted/30">
            <div />
            {days.map((dayIndex) => (
              <div
                key={dayIndex}
                className={cn(
                  "px-2 py-2 text-center text-xs font-medium border-l",
                  isTodayInWeek(weekStartAt, dayIndex) && "bg-primary/5 text-primary"
                )}
              >
                {formatWeekdayHeader(weekStartAt, dayIndex)}
              </div>
            ))}
          </div>

          {allDayEvents.length > 0 && (
            <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b bg-muted/10">
              <div className="px-2 py-1 text-[10px] text-muted-foreground">Journée</div>
              {days.map((dayIndex) => {
                const dayAllDay = allDayEvents.filter(
                  (ev) => eventDayIndex(ev.start_at, weekStartAt) === dayIndex
                );
                return (
                  <div key={dayIndex} className="border-l px-1 py-1 space-y-1 min-h-8">
                    {dayAllDay.map((ev) => (
                      <button
                        key={ev.google_event_id}
                        type="button"
                        className={cn(
                          "w-full truncate rounded px-1.5 py-0.5 text-left text-[10px]",
                          isPipeLinkedEvent(ev)
                            ? "bg-emerald-200/80 hover:bg-emerald-300/80 border border-emerald-400/50"
                            : "bg-slate-200/80 hover:bg-slate-300/80"
                        )}
                        title={ev.title}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isPipeLinkedEvent(ev) && onPipeEventClick) {
                            onPipeEventClick(ev);
                          } else if (ev.html_link) {
                            void openExternalUrl(ev.html_link);
                          }
                        }}
                      >
                        {ev.title}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
            <div className="relative border-r" style={{ height: gridHeight }}>
              {hours.map((label, index) => (
                <div
                  key={label}
                  className="absolute left-0 right-0 text-[10px] text-muted-foreground px-1 -translate-y-1/2 pointer-events-none"
                  style={{ top: agendaHourLineTopPx(index) + AGENDA_HOUR_HEIGHT_PX / 2 }}
                >
                  {label}
                </div>
              ))}
            </div>

            {days.map((dayIndex) => (
              <div
                key={dayIndex}
                className={cn(
                  "relative border-l",
                  isTodayInWeek(weekStartAt, dayIndex) && "bg-primary/[0.03]",
                  onSlotClick && "cursor-cell"
                )}
                style={{ height: gridHeight }}
                onClick={
                  onSlotClick
                    ? (e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const offsetY = e.clientY - rect.top;
                        const startAt = agendaSlotStartUnixFromClick(
                          weekStartAt,
                          dayIndex,
                          offsetY,
                          gridHeight
                        );
                        const endAt = startAt + DEFAULT_RDV_DURATION_MINUTES * 60;
                        onSlotClick({ startAt, endAt, dayIndex });
                      }
                    : undefined
                }
              >
                {hourLines.map((lineIndex) => (
                  <div
                    key={lineIndex}
                    className="absolute left-0 right-0 border-t border-border/50 pointer-events-none"
                    style={{ top: agendaHourLineTopPx(lineIndex) }}
                  />
                ))}

                {highlightDayIndex === dayIndex &&
                  highlightStartAt != null &&
                  highlightEndAt != null && (
                    <div
                      className="absolute left-1 right-1 rounded border border-primary/50 bg-primary/15 z-10 pointer-events-none"
                      style={{
                        top: eventLayoutTopPx(highlightStartAt, weekStartAt, dayIndex),
                        height: eventLayoutHeightPx(highlightStartAt, highlightEndAt),
                      }}
                    />
                  )}

                {timedEvents
                  .filter((ev) => eventDayIndex(ev.start_at, weekStartAt) === dayIndex)
                  .map((ev) => {
                    const top = eventLayoutTopPx(ev.start_at, weekStartAt, dayIndex);
                    const height = eventLayoutHeightPx(ev.start_at, ev.end_at);
                    const clippedTop = top < gridHeight && top + height > 0;
                    if (!clippedTop && top >= gridHeight) return null;
                    return (
                      <button
                        key={ev.google_event_id}
                        type="button"
                        className={cn(
                          "absolute left-1 right-1 z-20 m-0 overflow-hidden rounded border px-1.5 py-0.5 text-left text-[10px] leading-tight box-border",
                          isPipeLinkedEvent(ev)
                            ? "border-emerald-400/80 bg-emerald-100/90 hover:bg-emerald-200/90"
                            : "border-blue-200/80 bg-blue-100/90 hover:bg-blue-200/90"
                        )}
                        style={{
                          top: Math.max(0, top),
                          height: Math.max(18, height),
                        }}
                        title={`${ev.title}\n${formatEventTime(ev.start_at, ev.end_at, ev.all_day)}${
                          isPipeLinkedEvent(ev) ? "\nRDV Pipe — clic pour décaler / annuler" : ""
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isPipeLinkedEvent(ev) && onPipeEventClick) {
                            onPipeEventClick(ev);
                          } else if (ev.html_link) {
                            void openExternalUrl(ev.html_link);
                          }
                        }}
                      >
                        <span className="block font-medium truncate">{ev.title}</span>
                        <span className="block text-[9px] text-muted-foreground tabular-nums">
                          {formatEventTime(ev.start_at, ev.end_at, ev.all_day)}
                        </span>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <p className="px-4 py-2 text-xs text-muted-foreground border-t">
          Chargement de la semaine…
        </p>
      )}

      <p className="px-4 py-2 text-[11px] text-muted-foreground border-t">
        Affichage {AGENDA_GRID_START_HOUR}h–{AGENDA_GRID_END_HOUR}h
        {onSlotClick ? " · clic créneau libre = planifier" : ""}
        {onPipeEventClick ? " · vert = RDV Pipe (décaler / annuler)" : ""}
        {!onPipeEventClick && !onSlotClick ? " · clic = ouvrir dans Google Agenda" : ""}
      </p>
    </div>
  );
}
