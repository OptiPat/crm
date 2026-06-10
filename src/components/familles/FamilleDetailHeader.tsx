import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Home, UserPlus, Users, X } from "lucide-react";
import type { FamilleGroup } from "@/lib/familles/famille-types";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";

type FamilleDetailHeaderProps = {
  famille: FamilleGroup;
  memberCount: number;
  onClose: () => void;
  onAddMember?: () => void;
};

export function FamilleDetailHeader({
  famille,
  memberCount,
  onClose,
  onAddMember,
}: FamilleDetailHeaderProps) {
  return (
    <div className="shrink-0 border-b border-border/60 bg-muted/30 px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Famille
          </p>
          <h3 className="text-xl font-serif font-bold text-primary truncate">
            {famille.nom}
          </h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 -mr-1"
          onClick={onClose}
          title="Fermer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="gap-1 font-normal">
          <Users className="h-3 w-3" />
          {memberCount} membre{memberCount > 1 ? "s" : ""}
        </Badge>
        {famille.foyers.length > 0 && (
          <Badge variant="outline" className="gap-1 font-normal">
            <Home className="h-3 w-3" />
            {famille.foyers.map((f) => f.nom).join(", ")}
          </Badge>
        )}
        {famille.isManual && (
          <Badge variant="outline" className="font-normal">
            Créée manuellement
          </Badge>
        )}
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200/80 font-normal tabular-nums">
          {formatEuroCentimes(famille.patrimoineAvecMoi)} avec moi
        </Badge>
      </div>
      {onAddMember && (
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onAddMember}>
          <UserPlus className="h-4 w-4" />
          Ajouter un membre
        </Button>
      )}
    </div>
  );
}
