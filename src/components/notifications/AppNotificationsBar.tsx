import { useCallback, useEffect, useState } from "react";
import { Bell, ChevronRight, Loader2, Mail, X } from "lucide-react";
import {
  dismissStelliumExceltisSignal,
  notifyStelliumExceltisChanged,
} from "@/lib/api/tauri-stellium-exceltis";
import { cn } from "@/lib/utils";
import {
  fetchAppNotificationsSummary,
  type AppNotificationItem,
  type NotificationSeverity,
} from "@/lib/notifications/app-notifications";
import { navigateToSuivi } from "@/lib/navigation/suivi-navigation";
import { STELLIUM_EXCELTIS_CHANGED_EVENT } from "@/lib/api/tauri-stellium-exceltis";
import { useAppAutoRefresh } from "@/hooks/useAppAutoRefresh";

type AppNotificationsBarProps = {
  onPageChange: (page: string) => void;
  currentPage?: string;
};

const SEVERITY_STYLES: Record<
  NotificationSeverity,
  { pill: string; dot: string }
> = {
  urgent: {
    pill: "bg-red-600 text-white hover:bg-red-700 border-red-700",
    dot: "bg-red-500",
  },
  warning: {
    pill: "bg-amber-100 text-amber-950 hover:bg-amber-200 border-amber-300",
    dot: "bg-amber-500",
  },
  info: {
    pill: "bg-sky-100 text-sky-950 hover:bg-sky-200 border-sky-300",
    dot: "bg-sky-500",
  },
};

export function AppNotificationsBar({
  onPageChange,
  currentPage,
}: AppNotificationsBarProps) {
  const [items, setItems] = useState<AppNotificationItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const summary = await fetchAppNotificationsSummary();
      setItems(summary.items);
      setTotalCount(summary.totalCount);
    } catch (error) {
      console.error("Notifications:", error);
      setItems([]);
      setTotalCount(0);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onStellium = () => void load(true);
    window.addEventListener(STELLIUM_EXCELTIS_CHANGED_EVENT, onStellium);
    return () =>
      window.removeEventListener(STELLIUM_EXCELTIS_CHANGED_EVENT, onStellium);
  }, [load]);

  useAppAutoRefresh(() => load(true));

  const hasUrgent = items.some((i) => i.severity === "urgent");

  if (loading && items.length === 0) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 border-b border-border/80 bg-muted/30 px-6 py-2 text-sm text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Vérification des alertes et emails…
      </div>
    );
  }

  if (totalCount === 0) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Notifications"
      className={cn(
        "border-b px-6 py-2.5",
        hasUrgent
          ? "border-red-200/80 bg-gradient-to-r from-red-50/90 to-orange-50/50"
          : "border-amber-200/60 bg-amber-50/40"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
              hasUrgent ? "bg-red-100" : "bg-amber-100"
            )}
          >
            {hasUrgent ? (
              <Mail className="h-4 w-4 text-red-700" />
            ) : (
              <Bell className="h-4 w-4 text-amber-800" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">
              {totalCount} action{totalCount > 1 ? "s" : ""} en attente
            </p>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Mise à jour automatique
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
          {items.map((item) => (
            <NotificationPill
              key={item.id}
              item={item}
              onClick={() =>
                navigateToSuivi(
                  onPageChange,
                  item.suiviTab,
                  item.envoisSubTab,
                  item.focusContactId,
                  currentPage,
                  item.focusEtiquetteId
                )
              }
              onDismiss={
                item.stelliumMessageId
                  ? async () => {
                      try {
                        await dismissStelliumExceltisSignal(
                          item.stelliumMessageId!
                        );
                        notifyStelliumExceltisChanged();
                        await load(true);
                      } catch (error) {
                        console.error("Dismiss Stellium:", error);
                      }
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationPill({
  item,
  onClick,
  onDismiss,
}: {
  item: AppNotificationItem;
  onClick: () => void;
  onDismiss?: () => void | Promise<void>;
}) {
  const styles = SEVERITY_STYLES[item.severity];
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border text-xs font-medium transition-colors overflow-hidden",
        styles.pill
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-3 py-1 hover:opacity-90"
      >
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", styles.dot)} />
        <span className="tabular-nums font-semibold">{item.count}</span>
        <span>{item.label}</span>
        <ChevronRight className="h-3.5 w-3.5 opacity-70" />
      </button>
      {onDismiss ? (
        <button
          type="button"
          title="Masquer ce signal"
          aria-label="Masquer ce signal Stellium"
          className="px-1.5 py-1 border-l border-current/20 hover:bg-black/10"
          onClick={(e) => {
            e.stopPropagation();
            void onDismiss();
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
