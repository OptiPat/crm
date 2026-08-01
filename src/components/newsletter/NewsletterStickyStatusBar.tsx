import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NewsletterComposerStep } from "@/lib/newsletter/newsletter-composer-steps";
import { AlertTriangle, Users } from "lucide-react";

type NewsletterStickyStatusBarProps = {
  activeStep: NewsletterComposerStep | null;
  recipientLabel: string;
  checklistIncomplete: boolean;
  audienceDrift: boolean;
  onScrollToAudience: () => void;
};

export function NewsletterStickyStatusBar({
  activeStep,
  recipientLabel,
  checklistIncomplete,
  audienceDrift,
  onScrollToAudience,
}: NewsletterStickyStatusBarProps) {
  return (
    <div className="sticky top-0 z-20 -mx-6 px-6 py-2 mb-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {activeStep ?
          <Badge variant="outline" className="font-normal">
            Étape : {activeStep.label}
          </Badge>
        : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5"
          onClick={onScrollToAudience}
        >
          <Users className="h-3.5 w-3.5" />
          {recipientLabel}
        </Button>
        {audienceDrift ?
          <Badge variant="destructive" className="font-normal gap-1">
            <AlertTriangle className="h-3 w-3" />
            Audience modifiée
          </Badge>
        : null}
        {checklistIncomplete && !audienceDrift ?
          <span className="text-xs text-amber-700 dark:text-amber-400">Éléments manquants</span>
        : null}
      </div>
    </div>
  );
}
