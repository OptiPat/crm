import { Mail, Tag, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EtiquetteCreationIntent = "manual" | "auto" | "campaign";

const OPTIONS: {
  id: EtiquetteCreationIntent;
  title: string;
  description: string;
  icon: typeof Tag;
}[] = [
  {
    id: "manual",
    title: "Manuelle",
    description: "Poser le badge à la main sur chaque fiche contact.",
    icon: Tag,
  },
  {
    id: "auto",
    title: "Automatique",
    description: "Le CRM pose le badge quand vos critères sont remplis (délai, dates…).",
    icon: Zap,
  },
  {
    id: "campaign",
    title: "Campagne email",
    description: "Règle auto + envoi planifié (Suivi → Envois).",
    icon: Mail,
  },
];

export function EtiquetteCreationPicker({
  value,
  onChange,
  onReset,
  showExpanded = false,
  className,
  requiredHint,
}: {
  value: EtiquetteCreationIntent | null;
  onChange: (intent: EtiquetteCreationIntent) => void;
  /** Réaffiche les 3 cartes (création uniquement). */
  onReset?: () => void;
  /** true = grille des 3 cartes ; false = bandeau compact si type connu. */
  showExpanded?: boolean;
  className?: string;
  /** Affiche « choisissez pour continuer » tant qu’aucun type n’est sélectionné. */
  requiredHint?: boolean;
}) {
  const selected = value ? OPTIONS.find((o) => o.id === value) : null;

  if (selected && onReset && !showExpanded) {
    const Icon = selected.icon;
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/25 px-3 py-2",
          className
        )}
      >
        <span className="text-sm inline-flex items-center gap-2 min-w-0">
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              value === "auto" && "text-amber-600",
              value === "campaign" && "text-blue-600"
            )}
          />
          <span className="text-muted-foreground">Type :</span>
          <span className="font-medium truncate">{selected.title}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={onReset}>
          Changer
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div>
        <p className="text-sm font-medium">Type d&apos;étiquette</p>
        {requiredHint && !value && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Choisissez une option pour afficher le formulaire.
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map(({ id, title, description, icon: Icon }) => {
          const isSelected = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                "hover:border-primary/40 hover:bg-muted/40",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isSelected && "border-primary bg-primary/5 ring-1 ring-primary/20"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 mb-2",
                  id === "auto" && "text-amber-600",
                  id === "campaign" && "text-blue-600"
                )}
              />
              <p className="text-sm font-medium">{title}</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
