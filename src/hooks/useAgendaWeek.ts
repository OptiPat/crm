import { useCallback, useEffect, useRef, useState } from "react";
import { listGoogleCalendarWeek, type GoogleCalendarWeekEvent } from "@/lib/api/tauri-calendar";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { addWeeks, weekKey, weekStartUnix } from "@/lib/calendar/agenda-week";

type WeekCache = Map<string, GoogleCalendarWeekEvent[]>;

async function fetchWeek(weekStartAt: number): Promise<GoogleCalendarWeekEvent[]> {
  return listGoogleCalendarWeek(weekStartAt);
}

export function useAgendaWeek(initialWeekStartAt?: number) {
  const cacheRef = useRef<WeekCache>(new Map());
  const activeWeekRef = useRef(initialWeekStartAt ?? weekStartUnix());
  const [weekStartAt, setWeekStartAt] = useState(
    () => initialWeekStartAt ?? weekStartUnix()
  );
  const [events, setEvents] = useState<GoogleCalendarWeekEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  const prefetchWeek = useCallback((targetWeekStartAt: number) => {
    const key = weekKey(targetWeekStartAt);
    if (cacheRef.current.has(key)) return;
    void fetchWeek(targetWeekStartAt)
      .then((items) => {
        cacheRef.current.set(key, items);
      })
      .catch(() => {
        /* prefetch silencieux */
      });
  }, []);

  const loadWeek = useCallback(
    async (targetWeekStartAt: number, options?: { silent?: boolean }) => {
      const key = weekKey(targetWeekStartAt);
      const cached = cacheRef.current.get(key);
      if (cached) {
        setEvents(cached);
        setError(null);
        setLoading(false);
        prefetchWeek(addWeeks(targetWeekStartAt, -1));
        prefetchWeek(addWeeks(targetWeekStartAt, 1));
        return;
      }

      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const items = await fetchWeek(targetWeekStartAt);
        cacheRef.current.set(key, items);
        if (activeWeekRef.current === targetWeekStartAt) {
          setEvents(items);
        }
        prefetchWeek(addWeeks(targetWeekStartAt, -1));
        prefetchWeek(addWeeks(targetWeekStartAt, 1));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [prefetchWeek]
  );

  useEffect(() => {
    void (async () => {
      try {
        const status = await getEmailConnectionStatus();
        setConnected(status.google_calendar_connected);
        if (!status.google_calendar_connected) {
          setLoading(false);
          setEvents([]);
          return;
        }
        await loadWeek(weekStartAt);
      } catch (e) {
        setConnected(false);
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
  }, [weekStartAt, loadWeek]);

  const goToWeek = useCallback((targetWeekStartAt: number) => {
    activeWeekRef.current = targetWeekStartAt;
    setWeekStartAt(targetWeekStartAt);
  }, []);

  const goPrevWeek = useCallback(() => {
    setWeekStartAt((current) => {
      const next = addWeeks(current, -1);
      activeWeekRef.current = next;
      return next;
    });
  }, []);

  const goNextWeek = useCallback(() => {
    setWeekStartAt((current) => {
      const next = addWeeks(current, 1);
      activeWeekRef.current = next;
      return next;
    });
  }, []);

  const goToday = useCallback(() => {
    const next = weekStartUnix();
    activeWeekRef.current = next;
    setWeekStartAt(next);
  }, []);

  const refreshWeek = useCallback(async () => {
    cacheRef.current.delete(weekKey(weekStartAt));
    await loadWeek(weekStartAt);
  }, [loadWeek, weekStartAt]);

  const getWeekEvents = useCallback((targetWeekStartAt: number) => {
    return cacheRef.current.get(weekKey(targetWeekStartAt));
  }, []);

  return {
    weekStartAt,
    events,
    loading,
    error,
    connected,
    goToWeek,
    goPrevWeek,
    goNextWeek,
    goToday,
    refreshWeek,
    getWeekEvents,
    loadWeek,
  };
}
