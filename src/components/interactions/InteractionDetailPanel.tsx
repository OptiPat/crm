import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ContactInitialsAvatar } from "@/components/dashboard/dashboard-ui";
import {
  formatInteractionDateTime,
  formatTemplatePreview,
  getInteractionOrigin,
  getInteractionOriginLabel,
  getInteractionTypeLabel,
  interactionContactName,
  INTERACTION_TYPE_ICONS,
  parseCampaignNameFromSujet,
  parseSentTemplateFromContenu,
} from "@/lib/interactions/interaction-display";
import type { InteractionWithContact } from "@/lib/api/tauri-interactions";
import { ExternalLink, Info, Pencil, Trash2, X } from "lucide-react";

export function InteractionDetailPanel({
  item,
  embedded,
  onClose,
  onEdit,
  onDelete,
  onOpenContact,
}: {
  item: InteractionWithContact;
  embedded?: boolean;
  onClose?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenContact?: () => void;
}) {
  const Icon = INTERACTION_TYPE_ICONS[item.type_interaction] || INTERACTION_TYPE_ICONS.AUTRE;
  const name = interactionContactName(item.contact_prenom, item.contact_nom);
  const origin = getInteractionOrigin(item);
  const campaignName = item.sujet ? parseCampaignNameFromSujet(item.sujet) : null;
  const sentTemplate = item.contenu ? parseSentTemplateFromContenu(item.contenu) : null;
  const isCampaignTrace = origin === "campaign_response";

  return (
    <Card
      className={
        embedded
          ? "border-border/70 shadow-md overflow-hidden flex flex-col max-h-[calc(100vh-10rem)]"
          : "border-border/70 shadow-lg"
      }
    >
      <CardHeader className="pb-3 border-b border-border/60 bg-muted/20 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Détail de l&apos;échange
            </p>
            <div className="flex items-start gap-3">
              <ContactInitialsAvatar
                prenom={item.contact_prenom}
                nom={item.contact_nom}
              />
              <div className="min-w-0">
                <p className="font-semibold text-lg leading-tight">{name}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <Badge variant="secondary" className="gap-1">
                    <Icon className="h-3.5 w-3.5" />
                    {getInteractionTypeLabel(item.type_interaction)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      isCampaignTrace
                        ? "border-sky-200 bg-sky-50 text-sky-900"
                        : ""
                    }
                  >
                    {getInteractionOriginLabel(origin)}
                  </Badge>
                  <span className="text-xs text-muted-foreground w-full sm:w-auto">
                    {formatInteractionDateTime(item.date_interaction, "long")}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={onClose}
              aria-label="Fermer le détail"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {onOpenContact && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={onOpenContact}
            >
              <ExternalLink className="h-4 w-4" />
              Fiche contact
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Modifier
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-destructive hover:text-destructive hover:bg-red-50"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-0 pt-4 space-y-4">
        {isCampaignTrace ? (
          <>
            <div className="rounded-lg border border-sky-200/80 bg-sky-50/80 px-3 py-3 text-sm text-sky-950 flex gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Ce n&apos;est <strong>pas</strong> le texte d&apos;un email reçu du contact.
                Le CRM ajoute cette ligne quand une <strong>réponse client</strong> est
                enregistrée (manuellement ou via Gmail/Agenda) après l&apos;envoi d&apos;une
                campagne étiquette — pour garder une trace dans le journal.
              </p>
            </div>
            {campaignName && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Campagne étiquette
                </p>
                <p className="text-sm font-medium">{campaignName}</p>
              </div>
            )}
            {item.sujet && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Libellé enregistré
                </p>
                <p className="text-sm text-foreground">{item.sujet}</p>
              </div>
            )}
            {sentTemplate && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Objet de l&apos;email envoyé au contact
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap rounded-md bg-muted/40 border border-border/60 px-3 py-2">
                  {formatTemplatePreview(sentTemplate, item.contact_prenom)}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Rappel du template utilisé pour l&apos;envoi (variables comme{" "}
                  <code className="text-[11px]">{"{{prenom}}"}</code> remplacées à l&apos;envoi).
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {item.sujet ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Sujet
                </p>
                <p className="text-sm font-medium text-foreground">{item.sujet}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Notes / compte-rendu
              </p>
              {item.contenu?.trim() ? (
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {item.contenu}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Aucun détail enregistré.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
