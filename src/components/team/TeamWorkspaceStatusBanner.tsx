import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeamWorkspace } from "@/components/team/TeamWorkspaceProvider";

export function TeamWorkspaceStatusBanner({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const { teamConfigured, authorityError, syncError } = useTeamWorkspace();
  const message = authorityError ?? syncError;
  if (!teamConfigured || !message) return null;

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
      role="alert"
    >
      <span className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {message}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onOpenSettings}>
        Ouvrir les paramètres équipe
      </Button>
    </div>
  );
}
