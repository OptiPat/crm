import { useCallback, useEffect, useState } from "react";
import {
  listBirthdaysToday,
  runBirthdayTelegramIfDue,
  type BirthdayContactToday,
} from "@/lib/api/tauri-birthday-telegram";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { formatAgeLabel } from "@/lib/contacts/contact-birthday";
import {
  CONTACT_DISPLAY_CATEGORY_LABELS,
  getDisplayCategorieBadgeClass,
} from "@/lib/contacts/contact-category-display";
import { Badge } from "@/components/ui/badge";
import { ContactInitialsAvatar, DashboardPanel } from "./dashboard-ui";

export function BirthdaysTodayPreview({
  onOpenContact,
}: {
  onOpenContact?: (contactId: number) => void;
}) {
  const [birthdays, setBirthdays] = useState<BirthdayContactToday[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const list = await listBirthdaysToday();
      setBirthdays(list);
      void runBirthdayTelegramIfDue().catch((error) => {
        console.error("Rappels Telegram anniversaires:", error);
      });
    } catch (error) {
      console.error("Erreur anniversaires:", error);
      setBirthdays([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeContactsChanged(() => void load());
  }, [load]);

  const description = loading
    ? "Chargement…"
    : birthdays.length > 0
      ? `${birthdays.length} anniversaire${birthdays.length > 1 ? "s" : ""}`
      : "Aucun anniversaire aujourd'hui";

  return (
    <DashboardPanel title="Anniversaires du jour" description={description} className="h-full">
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : birthdays.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Aucun anniversaire aujourd&apos;hui
        </p>
      ) : (
        <ul className="space-y-2">
          {birthdays.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-background/80 hover:bg-accent/50 transition-colors text-left"
                onClick={() => onOpenContact?.(c.id)}
              >
                <ContactInitialsAvatar prenom={c.prenom} nom={c.nom} className="h-10 w-10" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {c.prenom} {c.nom}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.age != null ? formatAgeLabel(c.age) : "—"}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={`shrink-0 text-[10px] ${getDisplayCategorieBadgeClass(c.categorie)}`}
                >
                  {CONTACT_DISPLAY_CATEGORY_LABELS[c.categorie] ?? c.categorie}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}
