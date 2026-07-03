import { Badge } from "@/components/ui/badge";
import { ContactInitialsAvatar } from "@/components/dashboard/dashboard-ui";
import { Mail, FileText } from "lucide-react";
import {
  exchangeContactName,
  exchangeListSubtitle,
  exchangeListTitle,
  getMessagingRelanceChannelLabel,
  isEmailCampaignEntry,
  isMessagingRelanceEntry,
} from "@/lib/interactions/exchange-history-display";
import { SmsBrandIcon, WhatsAppBrandIcon } from "@/components/icons/MessagingBrandIcons";
import { getInteractionTypeLabel } from "@/lib/interactions/interaction-display";
import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";
import { cn } from "@/lib/utils";

export function ExchangeHistoryListRow({
  entry,
  selected,
  compact,
  onClick,
}: {
  entry: ExchangeHistoryEntry;
  selected?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const isEmail = isEmailCampaignEntry(entry);
  const isMessaging = isMessagingRelanceEntry(entry);
  const name = exchangeContactName(entry);
  const typeLabel = isMessaging
    ? getMessagingRelanceChannelLabel(entry.relance_canal)
    : isEmail
    ? "Email"
    : getInteractionTypeLabel(entry.type_interaction ?? "AUTRE");

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border transition-all",
        compact ? "p-3" : "p-4",
        selected
          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/25"
          : "border-border/70 bg-card hover:bg-muted/40 hover:border-primary/20"
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={cn(
            "p-2 rounded-lg shrink-0",
            selected ? "bg-primary/10" : "bg-muted"
          )}
        >
          {isMessaging ? (
            entry.relance_canal === "whatsapp" ? (
              <WhatsAppBrandIcon className="h-4 w-4" />
            ) : (
              <SmsBrandIcon className="h-4 w-4" />
            )
          ) : isEmail ? (
            <Mail className="h-4 w-4 text-primary" />
          ) : (
            <FileText className="h-4 w-4 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <span className="font-medium text-sm truncate">{name}</span>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
              {typeLabel}
            </Badge>
            {isEmail && entry.email_reponse_at && (
              <Badge
                variant="outline"
                className="text-[10px] h-5 px-1.5 shrink-0 border-emerald-200 text-emerald-800"
              >
                Répondu
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {exchangeListSubtitle(entry)}
          </p>
          <p className="text-sm text-foreground/90 mt-1 line-clamp-2">
            {exchangeListTitle(entry)}
          </p>
        </div>
        {!compact && (
          <ContactInitialsAvatar
            prenom={entry.contact_prenom}
            nom={entry.contact_nom}
            className="h-9 w-9 text-xs hidden sm:flex"
          />
        )}
      </div>
    </button>
  );
}
