import { useCallback, useEffect, useState } from "react";
import { SmsBrandIcon, WhatsAppBrandIcon } from "@/components/icons/MessagingBrandIcons";
import { toast } from "sonner";
import {
  generateBirthdayMessageDraft,
  listBirthdaysToday,
  runBirthdayTelegramIfDue,
  type BirthdayContactToday,
} from "@/lib/api/tauri-birthday-telegram";
import { openExternalUrl } from "@/lib/api/tauri-system";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { formatAgeLabel } from "@/lib/contacts/contact-birthday";
import {
  buildSmsUrl,
  buildWhatsAppUrl,
  hasMessagingPhone,
} from "@/lib/contacts/birthday-outreach";
import {
  CONTACT_DISPLAY_CATEGORY_LABELS,
  getDisplayCategorieBadgeClass,
} from "@/lib/contacts/contact-category-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactInitialsAvatar, DashboardPanel } from "./dashboard-ui";

async function openBirthdayMessage(
  contact: BirthdayContactToday,
  channel: "sms" | "whatsapp"
): Promise<void> {
  if (!hasMessagingPhone(contact.telephone)) {
    toast.error("Aucun numéro compatible SMS/WhatsApp sur cette fiche.");
    return;
  }

  try {
    const draft = await generateBirthdayMessageDraft(contact.id);
    const url =
      channel === "sms"
        ? buildSmsUrl(contact.telephone!, draft.message)
        : buildWhatsAppUrl(contact.telephone!, draft.message);

    if (!url) {
      toast.error("Numéro incompatible avec SMS/WhatsApp.");
      return;
    }

    await openExternalUrl(url);
  } catch (error) {
    toast.error(
      channel === "sms"
        ? `Impossible d'ouvrir le SMS : ${String(error)}`
        : `Impossible d'ouvrir WhatsApp : ${String(error)}`
    );
  }
}

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
          {birthdays.map((c) => {
            const canMessage = hasMessagingPhone(c.telephone);
            const disabledTitle = "Numéro absent ou incompatible (fixe FR, format invalide)";
            return (
              <li
                key={c.id}
                className="flex items-center gap-1 rounded-xl border border-border/70 bg-background/80"
              >
                <button
                  type="button"
                  className="flex flex-1 min-w-0 items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors rounded-l-xl"
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
                </button>
                <div className="flex items-center gap-0.5 pr-2 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={!canMessage}
                    title={canMessage ? "Préparer un SMS" : disabledTitle}
                    aria-label={canMessage ? "Préparer un SMS" : disabledTitle}
                    onClick={(e) => {
                      e.stopPropagation();
                      void openBirthdayMessage(c, "sms");
                    }}
                  >
                    <SmsBrandIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={!canMessage}
                    title={canMessage ? "Préparer WhatsApp" : disabledTitle}
                    aria-label={canMessage ? "Préparer WhatsApp" : disabledTitle}
                    onClick={(e) => {
                      e.stopPropagation();
                      void openBirthdayMessage(c, "whatsapp");
                    }}
                  >
                    <WhatsAppBrandIcon />
                  </Button>
                  <Badge
                    variant="secondary"
                    className={`shrink-0 text-[10px] ${getDisplayCategorieBadgeClass(c.categorie)}`}
                  >
                    {CONTACT_DISPLAY_CATEGORY_LABELS[c.categorie] ?? c.categorie}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPanel>
  );
}
