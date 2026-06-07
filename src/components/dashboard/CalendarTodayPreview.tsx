import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import {
  getCalendarEventsToday,
  markCalendarRdvEffectue,
  type CalendarEventEntry,
} from "@/lib/api/tauri-calendar";
import {
  notifyRelationChanged,
  subscribeRelationChanged,
} from "@/lib/etiquettes/etiquette-events";
import { DashboardPanel } from "./dashboard-ui";
import { toast } from "sonner";

function formatTime(unix: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(unix * 1000));
}

export function CalendarTodayPreview({
  onOpenContact,
}: {
  onOpenContact?: (contactId: number) => void;
}) {
  const [events, setEvents] = useState<CalendarEventEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setEvents(await getCalendarEventsToday());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeRelationChanged(() => void load());
  }, [load]);

  const markDone = async (ev: CalendarEventEntry) => {
    try {
      await markCalendarRdvEffectue(ev.id, ev.contact_id);
      toast.success("RDV marqué effectué");
      notifyRelationChanged(ev.contact_id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const pending = events.filter((e) => !e.rdv_effectue);

  const description = loading
    ? "Chargement…"
    : pending.length > 0
      ? `${pending.length} rendez-vous`
      : "Aucun RDV aujourd'hui";

  return (
    <DashboardPanel title="RDV du jour" description={description} className="h-full">
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Aucun RDV aujourd&apos;hui</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((ev) => {
            const name =
              ev.contact_prenom && ev.contact_nom
                ? `${ev.contact_prenom} ${ev.contact_nom}`
                : ev.title;
            return (
              <li
                key={ev.id}
                className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2 bg-card"
              >
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {formatTime(ev.start_at)}
                </span>
                <button
                  type="button"
                  className="flex-1 text-left truncate hover:underline"
                  onClick={() => onOpenContact?.(ev.contact_id)}
                >
                  {name}
                </button>
                {ev.attendee_status === "accepted" && (
                  <span className="text-xs text-green-700 shrink-0">Confirmé</span>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  title="RDV effectué"
                  onClick={() => void markDone(ev)}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPanel>
  );
}
