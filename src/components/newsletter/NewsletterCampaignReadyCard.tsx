import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BrevoTemplateSummary } from "@/lib/api/tauri-newsletter";
import {
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  MoreHorizontal,
  Send,
  Undo2,
} from "lucide-react";

type NewsletterCampaignReadyCardProps = {
  preparedEditionQueuedCount: number;
  preparedQueueCount: number | null;
  audienceDrift: boolean;
  audienceEligible: number;
  sendDelayMs: number;
  brevoConfigured: boolean;
  brevoTemplates: BrevoTemplateSummary[];
  selectedBrevoTemplateId: string;
  onSelectedBrevoTemplateIdChange: (value: string) => void;
  loadingBrevoTemplates: boolean;
  brevoPushing: boolean;
  brevoCampaignListUrl: string | null;
  brevoCampaignName: string | null;
  activeEditionBrevoCampaignId: number | null;
  batchSending: boolean;
  batchProgress: { sent: number; total: number } | null;
  emailConnected: boolean;
  hasPlainBody: boolean;
  onCopyBrevoText: () => void;
  onPushToBrevo: () => void;
  onOpenBrevoList: () => void;
  onReviewPrepared: () => void;
  onCancelPreparation: () => void;
  onSendGmail: () => void;
  onCancelBatchSend: () => void;
};

export function NewsletterCampaignReadyCard({
  preparedEditionQueuedCount,
  preparedQueueCount,
  audienceDrift,
  audienceEligible,
  sendDelayMs,
  brevoConfigured,
  brevoTemplates,
  selectedBrevoTemplateId,
  onSelectedBrevoTemplateIdChange,
  loadingBrevoTemplates,
  brevoPushing,
  brevoCampaignListUrl,
  brevoCampaignName,
  activeEditionBrevoCampaignId,
  batchSending,
  batchProgress,
  emailConnected,
  hasPlainBody,
  onCopyBrevoText,
  onPushToBrevo,
  onOpenBrevoList,
  onReviewPrepared,
  onCancelPreparation,
  onSendGmail,
  onCancelBatchSend,
}: NewsletterCampaignReadyCardProps) {
  const brevoPrimary = brevoConfigured;
  const gmailQueueReady = preparedQueueCount != null && preparedQueueCount > 0;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-4 flex flex-col gap-4">
        <div className="min-w-0 text-sm space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">
                Campagne prête — {preparedEditionQueuedCount} destinataire
                {preparedEditionQueuedCount !== 1 ? "s" : ""} figé
                {preparedEditionQueuedCount !== 1 ? "s" : ""}
              </p>
              {activeEditionBrevoCampaignId != null ?
                <p className="text-xs text-muted-foreground mt-0.5">
                  Brouillon Brevo #{activeEditionBrevoCampaignId}
                  {brevoCampaignName ? ` · ${brevoCampaignName}` : ""}
                </p>
              : brevoConfigured ?
                <p className="text-xs text-muted-foreground mt-0.5">
                  Contacts pas encore synchronisés vers Brevo
                </p>
              : null}
              {gmailQueueReady ?
                <p className="text-xs text-muted-foreground mt-0.5">
                  {preparedQueueCount} email{preparedQueueCount !== 1 ? "s" : ""} encore en file Gmail
                </p>
              : null}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions campagne</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={onReviewPrepared}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Revoir le contenu
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={onCancelPreparation}
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Annuler la préparation
                </Button>
                {emailConnected && gmailQueueReady ?
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={onSendGmail}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Envoyer via Gmail
                  </Button>
                : null}
              </PopoverContent>
            </Popover>
          </div>

          {audienceDrift ?
            <p className="text-amber-700 dark:text-amber-400 text-xs">
              L&apos;audience affichée ({audienceEligible} sélectionné
              {audienceEligible !== 1 ? "s" : ""}) ne correspond plus — recliquez sur « Préparer la
              campagne ».
            </p>
          : null}

          {batchProgress ?
            <p className="text-muted-foreground flex items-center gap-2">
              {batchSending ?
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              : null}
              Envoi Gmail… {batchProgress.sent}/{batchProgress.total}
            </p>
          : null}

          {brevoConfigured ?
            <div className="rounded-md border bg-background/80 p-3 space-y-3">
              <p className="text-xs font-medium">Prochaine étape Brevo</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Pousser les contacts (liste + brouillon campagne)</li>
                <li>Copier le texte ci-dessous</li>
                <li>Brouillon → Modifier le design → coller → Aperçu et test → Envoyer</li>
              </ol>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={selectedBrevoTemplateId}
                  onChange={(e) => onSelectedBrevoTemplateIdChange(e.target.value)}
                  disabled={loadingBrevoTemplates || brevoTemplates.length === 0}
                >
                  <option value="">Template Brevo…</option>
                  {brevoTemplates.map((template) => (
                    <option key={template.id} value={String(template.id)}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  disabled={brevoPushing || loadingBrevoTemplates || audienceDrift}
                  onClick={onPushToBrevo}
                >
                  {brevoPushing ?
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <ExternalLink className="h-4 w-4 mr-2" />}
                  Pousser vers Brevo
                </Button>
                {hasPlainBody ?
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={onCopyBrevoText}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copier le texte
                  </Button>
                : null}
              </div>
              {brevoCampaignListUrl ?
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={onOpenBrevoList}
                >
                  Ouvrir les brouillons Brevo
                </Button>
              : null}
            </div>
          : batchSending ?
            <Button type="button" variant="destructive" onClick={onCancelBatchSend}>
              Annuler l&apos;envoi Gmail
            </Button>
          : emailConnected && gmailQueueReady && !brevoPrimary ?
            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="button" onClick={onSendGmail}>
                <Send className="h-4 w-4 mr-2" />
                Envoyer la campagne (Gmail)
              </Button>
              <p className="text-xs text-muted-foreground self-center">
                Délai {Math.round(sendDelayMs / 1000)} s entre chaque envoi
              </p>
            </div>
          : null}
        </div>
      </CardContent>
    </Card>
  );
}
