import { X } from "lucide-react";
import { getContrastColor } from "@/lib/api/tauri-etiquettes";
import { cn } from "@/lib/utils";

interface EtiquetteBadgeProps {
  nom: string;
  couleur: string;
  /** "AUTO" ou "MANUEL" — affiché en sous-texte si présent */
  attribuePar?: string;
  onRemove?: () => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  clickable?: boolean;
  onClick?: () => void;
}

/**
 * Composant EtiquetteBadge - Affiche une étiquette sous forme de pill coloré
 * 
 * Usage:
 * ```tsx
 * <EtiquetteBadge nom="VIP" couleur="#EF4444" />
 * <EtiquetteBadge nom="Urgent" couleur="#F97316" onRemove={() => handleRemove()} />
 * ```
 */
export function EtiquetteBadge({
  nom,
  couleur,
  attribuePar,
  onRemove,
  size = "md",
  className,
  clickable = false,
  onClick,
}: EtiquetteBadgeProps) {
  const textColor = getContrastColor(couleur);
  
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-3 py-1 text-sm gap-1.5",
    lg: "px-4 py-1.5 text-base gap-2",
  };

  const removeButtonSizes = {
    sm: "h-3 w-3 -mr-0.5",
    md: "h-3.5 w-3.5 -mr-1",
    lg: "h-4 w-4 -mr-1",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xl font-medium shadow-sm transition-all max-w-full min-w-0",
        sizeClasses[size],
        clickable && "cursor-pointer",
        onRemove && "pr-1.5",
        className
      )}
      style={{
        backgroundColor: couleur,
        color: textColor,
      }}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={nom}
    >
      <span className="min-w-0 whitespace-normal break-words text-left leading-snug">
        {nom}
        {attribuePar && (
          <span className="opacity-75 font-normal text-[10px] ml-1">
            {attribuePar === "AUTO" ? "· auto" : "· manuel"}
          </span>
        )}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={cn(
            "ml-1 rounded-full p-0.5 transition-colors",
            "hover:bg-black/20 focus:outline-hidden focus:ring-1 focus:ring-white/50",
            removeButtonSizes[size]
          )}
          style={{ color: textColor }}
          aria-label={`Retirer l'étiquette ${nom}`}
        >
          <X className="h-full w-full" />
        </button>
      )}
    </span>
  );
}

/**
 * Composant pour afficher plusieurs étiquettes
 */
interface EtiquetteListProps {
  etiquettes: Array<{
    id: number;
    nom: string;
    couleur: string;
    attribue_par?: string;
  }>;
  onRemove?: (id: number) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  maxVisible?: number;
}

export function EtiquetteList({
  etiquettes,
  onRemove,
  size = "sm",
  className,
  maxVisible,
}: EtiquetteListProps) {
  const visibleEtiquettes = maxVisible ? etiquettes.slice(0, maxVisible) : etiquettes;
  const hiddenCount = maxVisible ? Math.max(0, etiquettes.length - maxVisible) : 0;

  if (etiquettes.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {visibleEtiquettes.map((etiquette) => (
        <EtiquetteBadge
          key={etiquette.id}
          nom={etiquette.nom}
          couleur={etiquette.couleur}
          attribuePar={etiquette.attribue_par}
          size={size}
          onRemove={onRemove ? () => onRemove(etiquette.id) : undefined}
        />
      ))}
      {hiddenCount > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}
