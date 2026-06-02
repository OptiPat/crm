import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTemplateCategoryMeta } from "@/lib/emails/template-email-meta";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { ChevronDown, Copy, Mail, Pencil, Trash2 } from "lucide-react";

export function TemplatesEmailHelp() {
  return (
    <details className="group rounded-xl border bg-muted/20 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        <Mail className="h-4 w-4 text-primary shrink-0" />
        À quoi servent les modèles ?
        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 space-y-2 text-xs text-muted-foreground leading-relaxed border-t pt-3">
        <p>
          <strong className="text-foreground">1. Créer</strong> un modèle ici (objet + message avec{" "}
          {"{{prenom}}"}, etc.).
        </p>
        <p>
          <strong className="text-foreground">2. Déclencheur</strong> (onglet du modèle) : événement
          ex. nouvelle souscription + délai/heure — <em>sans créer d&apos;étiquette</em>.
        </p>
        <p>
          <strong className="text-foreground">3. Étiquettes</strong> (optionnel) : liez le modèle
          pour les campagnes classiques par étiquette.
        </p>
        <p>
          <strong className="text-foreground">4. Envoyer</strong> depuis Suivi → Envois (CRM ouvert,
          compte email connecté).
        </p>
      </div>
    </details>
  );
}

export function TemplateCategoryFilters({
  categories,
  active,
  counts,
  onChange,
}: {
  categories: { id: string; label: string }[];
  active: string;
  counts: Record<string, number>;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={cn(
          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          active === "all"
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-muted/50"
        )}
      >
        Tous
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            active === c.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted/50"
          )}
        >
          {c.label}
          {counts[c.id] != null && counts[c.id] > 0 ? ` (${counts[c.id]})` : ""}
        </button>
      ))}
    </div>
  );
}

export function TemplateListRow({
  template,
  selected,
  linkedCount,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: TemplateEmail;
  selected: boolean;
  linkedCount?: number;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const meta = getTemplateCategoryMeta(template.categorie);
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
        "p-3 border rounded-xl transition-all text-left w-full",
        "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/15 shadow-sm" : "bg-card"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium truncate">{template.nom}</span>
            <Badge className={cn("text-[10px]", meta.badgeClass)}>{meta.label}</Badge>
            {linkedCount != null && linkedCount > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {linkedCount} étiquette{linkedCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">{template.sujet || "—"}</p>
        </div>
        <div
          className="flex gap-0.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Modifier">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onDuplicate} aria-label="Dupliquer">
            <Copy className="h-4 w-4" />
          </Button>
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
        </div>
      </div>
    </div>
  );
}

export function TemplatePreviewActions({
  onEdit,
  onDuplicate,
  children,
}: {
  onEdit: () => void;
  onDuplicate: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="gap-1.5" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Modifier
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
          Dupliquer
        </Button>
      </div>
      {children}
    </div>
  );
}
