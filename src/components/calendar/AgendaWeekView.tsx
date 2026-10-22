import { useMemo } from "react";
import type { GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";
import { openExternalUrl } from "@/lib/api/tauri-system";
import {
  agendaGridHeightPx,
  agendaGridHourCount,
  agendaGridRangeForEvents,
  agendaHourLineTopPx,
  agendaSlotStartUnixFromClick,
  AGENDA_HOUR_HEIGHT_PX,
  AGENDA_SLOT_SNAP_MINUTES,
  eventDayIndex,
  eventLayoutHeightPx,
  eventLayoutTopPx,
  formatWeekdayHeader,
  hourLabels,
  isTodayInWeek,
  layoutOverlappingEvents,
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

const TIME_FMT = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const DAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;

function formatEventTime(startAt: number, endAt: number, allDay: boolean): string {
  if (allDay) return "Journée";
  return `${TIME_FMT.format(new Date(startAt * 1000))}–${TIME_FMT.format(new Date(endAt * 1000))}`;
}

/** En dessous, titre et heure tiennent sur une seule ligne. */
const EVENT_TWO_LINES_MIN_HEIGHT_PX = 32;

export function AgendaWeekView({
  weekStartAt,
  events,
  loading = false,
  highlightStartAt = null,
  highlightEndAt = null,
  onSlotClick,
  onPipeEventClick,
}: AgendaWeekViewProps) {
  const days = weekdayLabels().map((_, dayIndex) => dayIndex);
  const timedEvents = useMemo(() => events.filter((ev) => !ev.all_day), [events]);
  const allDayEvents = events.filter((ev) => ev.all_day);

  const range = useMemo(() => {
    const intervals: { start_at: number; end_at: number }[] = [...timedEvents];
    if (highlightStartAt != null && highlightEndAt != null) {
      intervals.push({ start_at: highlightStartAt, end_at: highlightEndAt });
    }
    return agendaGridRangeForEvents(weekStartAt, intervals);
  }, [timedEvents, highlightStartAt, highlightEndAt, weekStartAt]);
  const hours = hourLabels(range);
  const gridHeight = agendaGridHeightPx(range);
  const hourSlots = Array.from({ length: agendaGridHourCount(range) }, (_, i) => i);

  const eventsByDay = useMemo(
    () =>
      DAY_INDEXES.map((dayIndex) => {
        const dayEvents = timedEvents.filter(
          (ev) => eventDayIndex(ev.start_at, weekStartAt) === dayIndex
        );
        const layout = layoutOverlappingEvents(dayEvents);
        return dayEvents.map((ev, i) => ({ ev, ...layout[i] }));
      }),
    [timedEvents, weekStartAt]
  );

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
              <div className="px-2 py-1 text-[11px] text-muted-foreground">Journée</div>
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
                          "w-full truncate rounded px-1.5 py-0.5 text-left text-[11px]",
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
                  className="absolute left-0 right-0 text-[11px] text-muted-foreground px-1 -translate-y-1/2 text-right pointer-events-none tabular-nums"
                  style={{ top: agendaHourLineTopPx(index) }}
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
                          gridHeight,
                          AGENDA_SLOT_SNAP_MINUTES,
                          range
                        );
                        const endAt = startAt + DEFAULT_RDV_DURATION_MINUTES * 60;
                        onSlotClick({ startAt, endAt, dayIndex });
                      }
                    : undefined
                }
              >
                {hourSlots.map((slotIndex) => (
                  <div
                    key={slotIndex}
                    className={cn(
                      "absolute left-0 right-0 border-b border-border/50 pointer-events-none",
                      slotIndex % 2 === 0 && "bg-muted/[0.04]"
                    )}
                    style={{
                      top: agendaHourLineTopPx(slotIndex),
                      height: AGENDA_HOUR_HEIGHT_PX,
                    }}
                  >
                    <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-border/30" />
                  </div>
                ))}

                {highlightDayIndex === dayIndex &&
                  highlightStartAt != null &&
                  highlightEndAt != null && (
                    <div
                      className="absolute left-1 right-1 rounded border border-primary/50 bg-primary/15 z-10 pointer-events-none"
                      style={{
                        top: eventLayoutTopPx(highlightStartAt, weekStartAt, dayIndex, range),
                        height: eventLayoutHeightPx(highlightStartAt, highlightEndAt),
                      }}
                    />
                  )}

                {eventsByDay[dayIndex].map(({ ev, column, columnCount }) => {
                  const top = eventLayoutTopPx(ev.start_at, weekStartAt, dayIndex, range);
                  if (top >= gridHeight) return null;
                  const height = Math.max(
                    18,
                    Math.min(eventLayoutHeightPx(ev.start_at, ev.end_at), gridHeight - top)
                  );
                  const timeLabel = formatEventTime(ev.start_at, ev.end_at, ev.all_day);
                  const twoLines = height >= EVENT_TWO_LINES_MIN_HEIGHT_PX;
                  return (
                    <button
                      key={ev.google_event_id}
                      type="button"
                      className={cn(
                        "absolute z-20 m-0 overflow-hidden rounded-sm border px-1 py-0.5 text-left text-[11px] leading-tight box-border",
                        isPipeLinkedEvent(ev)
                          ? "border-emerald-400/80 bg-emerald-100/90 hover:bg-emerald-200/90"
                          : "border-blue-200/80 bg-blue-100/90 hover:bg-blue-200/90"
                      )}
                      style={{
                        top,
                        height,
                        left: `calc(${(column / columnCount) * 100}% + 2px)`,
                        width: `calc(${100 / columnCount}% - 4px)`,
                      }}
                      title={`${ev.title}\n${timeLabel}${
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
                      {twoLines ? (
                        <>
                          <span className="block font-medium truncate">{ev.title}</span>
                          <span className="block text-muted-foreground tabular-nums">
                            {timeLabel}
                          </span>
                        </>
                      ) : (
                        <span className="block truncate">
                          <span className="tabular-nums text-muted-foreground">
                            {TIME_FMT.format(new Date(ev.start_at * 1000))}
                          </span>{" "}
                          <span className="font-medium">{ev.title}</span>
                        </span>
                      )}
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
        Affichage {range.startHour}h–{range.endHour}h
        {onSlotClick ? " · clic créneau libre = planifier" : ""}
        {onPipeEventClick ? " · vert = RDV Pipe (décaler / annuler)" : ""}
        {!onPipeEventClick && !onSlotClick ? " · clic = ouvrir dans Google Agenda" : ""}
      </p>
    </div>
  );
}
