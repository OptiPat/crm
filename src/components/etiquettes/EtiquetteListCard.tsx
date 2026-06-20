import { Button } from "@/components/ui/button";
import { getContrastColor, type EtiquetteWithCount } from "@/lib/api/tauri-etiquettes";
import {
  formatEtiquetteAutoBadgeLabel,
  formatEtiquetteRuleHint,
  type SegmentLookup,
} from "@/lib/etiquettes/etiquette-card-summary";
import { etiquetteHasAutoRule } from "@/lib/etiquettes/etiquette-auto-rule";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Copy,
  Edit,
  Mail,
  Tag,
  Trash2,
  Users,
  Zap,
} from "lucide-react";

export function EtiquetteListCard({
  etiquette,
  segments,
  selected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  etiquette: EtiquetteWithCount;
  segments: SegmentLookup;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const hasContacts = etiquette.contact_count > 0;
  const isAuto = etiquetteHasAutoRule(etiquette);
  const autoLabel = formatEtiquetteAutoBadgeLabel(etiquette, segments);
  const ruleHint = formatEtiquetteRuleHint(etiquette, segments);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "p-4 border rounded-xl bg-card transition-all text-left w-full",
        "hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected && "border-primary ring-2 ring-primary/20 shadow-sm",
        etiquette.actif === false && "opacity-65 bg-muted/20"
      )}
    >
      <div className="flex items-start gap-2 mb-2">
        <span
          className="flex-1 min-w-0 px-3 py-1.5 rounded-xl text-sm font-medium shadow-sm leading-snug break-words"
          style={{
            backgroundColor: etiquette.couleur,
            color: getContrastColor(etiquette.couleur),
          }}
        >
          {etiquette.nom}
        </span>
        <div
          className="flex gap-0.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onEdit}
            aria-label="Modifier"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onDuplicate}
            aria-label="Dupliquer"
            title="Dupliquer (même règle, nouveau nom)"
          >
            <Copy className="h-4 w-4" />
          </Button>
          {!etiquette.is_default && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onDelete}
              aria-label="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {etiquette.description && (
        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
          {etiquette.description}
        </p>
      )}

      {ruleHint && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed" title={ruleHint}>
          {ruleHint}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium",
            hasContacts
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Users className="h-3 w-3 shrink-0" />
          {etiquette.contact_count} contact
          {etiquette.contact_count > 1 ? "s" : ""}
        </span>

        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted">
          {isAuto ? (
            <>
              <Zap className="h-3 w-3 text-amber-600" />
              {autoLabel}
            </>
          ) : (
            <>
              <Tag className="h-3 w-3" />
              Manuel
            </>
          )}
        </span>

        {etiquette.priorite > 0 && (
          <span className="px-2 py-1 rounded-full bg-muted">
            Priorité {etiquette.priorite}
          </span>
        )}

        {etiquette.is_default && (
          <span
            className="px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80"
            title="Étiquette système : modifiable et désactivable, mais pas supprimable"
          >
            Préinstallée
          </span>
        )}

        {etiquette.actif === false && (
          <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600">
            Désactivée
          </span>
        )}

        {etiquette.email_actif && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200/70">
            <Mail className="h-3 w-3 shrink-0" />
            {etiquette.email_envoi_prevu
              ? new Date(etiquette.email_envoi_prevu * 1000).toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Email"}
          </span>
        )}
      </div>

      <p
        className={cn(
          "mt-3 text-[11px] flex items-center gap-1",
          selected ? "text-primary font-medium" : "text-muted-foreground"
        )}
      >
        {hasContacts ? "Voir les contacts" : "Liste vide"}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            selected && "translate-x-0.5 text-primary"
          )}
        />
      </p>
    </div>
  );
}
