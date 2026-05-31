import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  FileText,
  Mail,
  MessageSquareReply,
  Pencil,
  Phone,
  Trash2,
} from "lucide-react";
import type { Interaction } from "@/lib/api/tauri-interactions";
import {
  emailRelationSubtitle,
  emailRelationTitle,
  type ContactRelationTimelineItem,
} from "@/lib/interactions/contact-relation-timeline";
import { getSentSubjectLabel } from "@/lib/interactions/exchange-history-display";
import { INTERACTION_TYPES } from "@/lib/api/tauri-interactions";

const TYPE_ICONS: Record<string, typeof Phone> = {
  APPEL: Phone,
  EMAIL: Mail,
  RDV: Calendar,
  NOTE: FileText,
  AUTRE: FileText,
};

function formatInteractionDate(ts: number): string {
  try {
    return new Date(ts * 1000).toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function getTypeLabel(value: string): string {
  return INTERACTION_TYPES.find((t) => t.value === value)?.label || value;
}

export function ContactRelationTimelineRow({
  item,
  onEdit,
  onDelete,
  onOpenHistorique,
}: {
  item: ContactRelationTimelineItem;
  onEdit?: (interaction: Interaction) => void;
  onDelete?: (interactionId: number) => void;
  onOpenHistorique?: () => void;
}) {
  if (item.kind === "email") {
    const { entry } = item;
    const reponseBody = entry.email_reponse_body?.trim();
    const sentAt = entry.sent_at ?? entry.sort_date;

    return (
      <li className="relative flex flex-col gap-2 p-3 pl-1 border border-border/80 rounded-lg bg-card text-sm">
        <div className="flex items-start gap-3 min-w-0">
          <span className="p-2 rounded-lg bg-primary/5 shrink-0 h-fit">
            <Mail className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <Badge variant="outline" className="text-xs">
                Email campagne
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatInteractionDate(sentAt)}
              </span>
              {entry.email_reponse_at && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 px-1.5 border-emerald-200 text-emerald-800"
                >
                  Répondu
                </Badge>
              )}
            </div>
            <p className="font-medium leading-snug">{emailRelationTitle(entry)}</p>
            {getSentSubjectLabel(entry) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Objet : {getSentSubjectLabel(entry)}
              </p>
            )}

            {entry.email_reponse_at ? (
              <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Réponse du contact
                  {emailRelationSubtitle(entry)
                    ? ` — ${emailRelationSubtitle(entry)}`
                    : ""}
                  {" · "}
                  <span className="tabular-nums font-normal">
                    {formatInteractionDate(entry.email_reponse_at)}
                  </span>
                </p>
                {entry.email_reponse_type === "mail" && reponseBody ? (
                  <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed text-sm">
                    {reponseBody}
                  </p>
                ) : entry.email_reponse_type === "mail" ? (
                  <p className="text-xs text-muted-foreground italic">
                    Texte non importé — ouvrez Historique des échanges pour importer depuis
                    Gmail.
                  </p>
                ) : entry.email_reponse_type === "rdv" ? (
                  <p className="text-xs text-muted-foreground">
                    Rendez-vous enregistré après cet envoi.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {onOpenHistorique && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start ml-11 gap-1"
            onClick={onOpenHistorique}
          >
            <MessageSquareReply className="h-3.5 w-3.5" />
            Répondre dans Historique
          </Button>
        )}
      </li>
    );
  }

  const { interaction } = item;
  const Icon = TYPE_ICONS[interaction.type_interaction] || FileText;

  return (
    <li className="relative flex items-start justify-between gap-2 p-3 pl-1 border border-border/80 rounded-lg bg-card hover:bg-accent/40 transition-colors text-sm">
      <div className="flex gap-3 min-w-0">
        <span className="p-2 rounded-lg bg-primary/5 shrink-0 h-fit">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <Badge variant="outline" className="text-xs">
              {getTypeLabel(interaction.type_interaction)}
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatInteractionDate(interaction.date_interaction)}
            </span>
          </div>
          {interaction.sujet && <p className="font-medium">{interaction.sujet}</p>}
          {interaction.contenu && (
            <p className="text-muted-foreground mt-1 whitespace-pre-wrap">
              {interaction.contenu}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5">
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(interaction)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => onDelete(interaction.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
}
