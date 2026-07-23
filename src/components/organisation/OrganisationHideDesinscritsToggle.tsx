import { UserX } from "lucide-react";

import { Button } from "@/components/ui/button";

type OrganisationHideDesinscritsToggleProps = {
  desinscritCount: number;
  hideDesinscrits: boolean;
  onHideDesinscritsChange?: (hide: boolean) => void;
  className?: string;
};

export function OrganisationHideDesinscritsToggle({
  desinscritCount,
  hideDesinscrits,
  onHideDesinscritsChange,
  className,
}: OrganisationHideDesinscritsToggleProps) {
  if (desinscritCount <= 0) return null;

  return (
    <Button
      type="button"
      variant={hideDesinscrits ? "ghost" : "secondary"}
      size="sm"
      className={className ?? "h-7 gap-1 text-xs"}
      onClick={() => onHideDesinscritsChange?.(!hideDesinscrits)}
    >
      <UserX className="h-3.5 w-3.5" aria-hidden />
      {hideDesinscrits ? "Afficher désinscrits" : "Masquer désinscrits"}
      {` (${desinscritCount})`}
    </Button>
  );
}
