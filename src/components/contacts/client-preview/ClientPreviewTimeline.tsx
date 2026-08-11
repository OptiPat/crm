import type { PatrimoineTimelineEvent } from "@/lib/patrimoine/timeline";
import { getPatrimoineTimelineEventColor } from "@/lib/patrimoine/patrimoine-palette";
import { CP, TIMELINE_KIND_STYLE, formatDaysUntil } from "./client-preview-theme";

function TimelineSkeleton() {
  return (
    <div className={`${CP.card} mt-4 divide-y divide-[var(--cp-line-soft)]`}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="grid grid-cols-[4.5rem_1fr] items-start gap-4 px-4 py-3.5"
          aria-hidden
        >
          <div className="space-y-2">
            <div className="h-3 w-12 animate-pulse rounded bg-[var(--cp-surface-raised)]" />
            <div className="h-3 w-10 animate-pulse rounded bg-[var(--cp-surface-raised)]" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--cp-surface-raised)]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-3/4 animate-pulse rounded bg-[var(--cp-surface-raised)]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--cp-surface-raised)]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export interface ClientPreviewTimelineProps {
  timeline: PatrimoineTimelineEvent[];
  loading?: boolean;
  lastSyncLabel?: string | null;
}

export function ClientPreviewTimeline({
  timeline,
  loading = false,
  lastSyncLabel,
}: ClientPreviewTimelineProps) {
  return (
    <section className={`${CP.sectionGap} ${CP.padX} pb-8`}>
      <h3 className={CP.sectionTitle}>Échéances à venir</h3>

      {loading ? (
        <TimelineSkeleton />
      ) : timeline.length === 0 ? (
        <p className={`${CP.meta} mt-3`}>Rien de prévu pour le moment</p>
      ) : (
        <div className={`${CP.card} mt-4 divide-y divide-[var(--cp-line-soft)]`}>
          {timeline.map((ev) => {
            const daysLabel = formatDaysUntil(ev.date);
            const { Icon } = TIMELINE_KIND_STYLE[ev.kind];
            const color = getPatrimoineTimelineEventColor(ev);

            return (
              <div
                key={ev.id}
                className="grid grid-cols-[4.5rem_1fr] items-start gap-4 px-4 py-3.5"
              >
                <div>
                  <time className={`${CP.caption} block`}>
                    {new Date(ev.date * 1000).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                    })}
                  </time>
                  <span className={`${CP.caption} block`}>
                    {new Date(ev.date * 1000).getFullYear()}
                  </span>
                  {daysLabel ? (
                    <span className={`${CP.badge} mt-1 inline-block`}>
                      {daysLabel}
                    </span>
                  ) : null}
                </div>

                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${color}22` }}
                  >
                    <Icon
                      className="h-4 w-4"
                      style={{ color }}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0">
                    <p className={CP.body}>{ev.label}</p>
                    {ev.detail ? (
                      <p className={`${CP.meta} mt-0.5 line-clamp-2`}>
                        {ev.detail}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className={`${CP.caption} mt-6 text-center`}>
        Montants indicatifs — ne remplacent pas les relevés des établissements
        {lastSyncLabel ? (
          <>
            <br />
            Mis à jour le {lastSyncLabel}
          </>
        ) : null}
      </p>
    </section>
  );
}
