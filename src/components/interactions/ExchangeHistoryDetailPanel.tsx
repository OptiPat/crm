import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ContactInitialsAvatar } from "@/components/dashboard/dashboard-ui";
import { ExchangeEmailReplyForm } from "@/components/interactions/ExchangeEmailReplyForm";
import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";
import {
  exchangeContactName,
  getEmailResponseTypeLabel,
  getSentSubjectLabel,
  getSentTemplateLabel,
  isEmailCampaignEntry,
} from "@/lib/interactions/exchange-history-display";
import {
  formatInteractionDateTime,
  getInteractionTypeLabel,
} from "@/lib/interactions/interaction-display";
import { ExternalLink, Mail, Pencil, Trash2, X, Send } from "lucide-react";

export function ExchangeHistoryDetailPanel({
  entry,
  embedded,
  onClose,
  onEdit,
  onDelete,
  onOpenContact,
  onNavigateSuiviEnvois,
  onRefresh,
}: {
  entry: ExchangeHistoryEntry;
  embedded?: boolean;
  onClose?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpenContact?: () => void;
  onNavigateSuiviEnvois?: () => void;
  onRefresh?: () => void;
}) {
  const name = exchangeContactName(entry);
  const isEmail = isEmailCampaignEntry(entry);

  const templateLabel = getSentTemplateLabel(entry);
  const sentSubject = getSentSubjectLabel(entry);
  const reponseBody = entry.email_reponse_body?.trim();

  return (
    <Card
      className={
        embedded
          ? "flex h-full min-h-0 flex-col overflow-hidden border-border/70 shadow-md"
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
                prenom={entry.contact_prenom}
                nom={entry.contact_nom}
              />
              <div className="min-w-0">
                <p className="font-semibold text-lg leading-tight">{name}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <Badge variant="secondary" className="gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {isEmail
                      ? "Email campagne"
                      : getInteractionTypeLabel(entry.type_interaction ?? "AUTRE")}
                  </Badge>
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
          {isEmail && onNavigateSuiviEnvois && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={onNavigateSuiviEnvois}
            >
              <Send className="h-4 w-4" />
              Suivi → Envois
            </Button>
          )}
          {!isEmail && onEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" />
              Modifier
            </Button>
          )}
          {!isEmail && onDelete && (
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
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-0 pt-4 space-y-5">
        {isEmail ? (
          <>
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Vous avez envoyé
              </p>
              {entry.sent_at != null && entry.sent_at > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatInteractionDateTime(entry.sent_at, "long")}
                </p>
              )}
              <p className="text-sm font-medium text-foreground">{templateLabel}</p>
              {entry.etiquette_nom?.trim() && (
                <p className="text-xs text-muted-foreground">
                  Campagne : {entry.etiquette_nom.trim()}
                </p>
              )}
              {sentSubject && (
                <p className="text-xs text-muted-foreground">
                  Objet envoyé : {sentSubject}
                </p>
              )}
            </section>

            {entry.email_reponse_at ? (
              <section className="space-y-2 border-t border-border/60 pt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Réponse du contact
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatInteractionDateTime(entry.email_reponse_at, "long")}
                </p>
                <p className="text-sm font-medium">
                  {getEmailResponseTypeLabel(entry.email_reponse_type)}
                </p>
                {entry.email_reponse_type === "mail" && reponseBody ? (
                  <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {reponseBody}
                    </p>
                  </div>
                ) : entry.email_reponse_type === "mail" ? (
                  <p className="text-sm text-muted-foreground italic">
                    Réponse détectée — utilisez « Importer la réponse Gmail » ci-dessous
                    pour afficher le texte complet.
                  </p>
                ) : entry.email_reponse_type === "rdv" ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Un rendez-vous a été enregistré (Agenda ou saisie manuelle) après
                    cet envoi.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Un retour client a été enregistré après cet envoi.
                  </p>
                )}
              </section>
            ) : (
              <p className="text-sm text-muted-foreground italic border-t border-dashed border-border/60 pt-4">
                Pas encore de réponse enregistrée pour cet envoi.
              </p>
            )}

            <ExchangeEmailReplyForm
              entry={entry}
              onSent={() => onRefresh?.()}
            />
          </>
        ) : (
          <>
            {entry.sujet ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Sujet
                </p>
                <p className="text-sm font-medium text-foreground">{entry.sujet}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Notes / compte-rendu
              </p>
              {entry.contenu?.trim() ? (
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {entry.contenu}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Aucun détail enregistré.
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatInteractionDateTime(entry.sort_date, "long")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
