import { Badge } from "@/components/ui/badge";
import { ContactInitialsAvatar } from "@/components/dashboard/dashboard-ui";
import { FileText } from "lucide-react";
import {
  formatInteractionDateTime,
  getInteractionOrigin,
  getInteractionTypeLabel,
  interactionContactName,
  INTERACTION_TYPE_ICONS,
} from "@/lib/interactions/interaction-display";
import type { InteractionWithContact } from "@/lib/api/tauri-interactions";
import { cn } from "@/lib/utils";

export function InteractionListRow({
  item,
  selected,
  compact,
  onClick,
}: {
  item: InteractionWithContact;
  selected?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const Icon = INTERACTION_TYPE_ICONS[item.type_interaction] || FileText;
  const name = interactionContactName(item.contact_prenom, item.contact_nom);
  const isCampaignTrace = getInteractionOrigin(item) === "campaign_response";

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
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <span className="font-medium text-sm truncate">{name}</span>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
              {getInteractionTypeLabel(item.type_interaction)}
            </Badge>
            {isCampaignTrace && (
              <Badge
                variant="outline"
                className="text-[10px] h-5 px-1.5 shrink-0 border-sky-200 text-sky-800"
              >
                CRM
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {formatInteractionDateTime(item.date_interaction)}
          </p>
          {item.sujet && (
            <p className="text-sm text-foreground/90 mt-1 line-clamp-2">{item.sujet}</p>
          )}
          {!item.sujet && item.contenu && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {item.contenu}
            </p>
          )}
        </div>
        {!compact && (
          <ContactInitialsAvatar
            prenom={item.contact_prenom}
            nom={item.contact_nom}
            className="h-9 w-9 text-xs hidden sm:flex"
          />
        )}
      </div>
    </button>
  );
}
