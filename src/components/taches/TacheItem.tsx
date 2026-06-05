import { Pencil, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { TacheChainMenu } from "@/components/taches/TacheChainMenu";
import type { Tache, TacheWithContact } from "@/lib/api/tauri-taches";
import {
  ECHEANCE_TONE_CLASS,
  PRIORITE_META,
  echeanceLabel,
  echeanceState,
} from "@/lib/taches/tache-display";

interface TacheItemProps {
  tache: Tache | TacheWithContact;
  /** Affiche le contact lié (page globale). */
  showContact?: boolean;
  onToggle: (tache: Tache | TacheWithContact) => void;
  onEdit: (tache: Tache | TacheWithContact) => void;
  onDelete: (tache: Tache | TacheWithContact) => void;
  onOpenContact?: (contactId: number) => void;
}

export function TacheItem({
  tache,
  showContact = false,
  onToggle,
  onEdit,
  onDelete,
  onOpenContact,
}: TacheItemProps) {
  const done = tache.statut === "FAIT";
  const state = echeanceState(tache.date_echeance, tache.statut);
  const contacts = tache.contacts ?? [];
  const priorite = PRIORITE_META[tache.priorite];

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <Checkbox
        checked={done}
        onCheckedChange={() => onToggle(tache)}
        className="mt-1"
        aria-label={done ? "Marquer à faire" : "Marquer comme faite"}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-sm", done && "text-muted-foreground line-through")}>
          {tache.titre}
        </span>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={cn(ECHEANCE_TONE_CLASS[state])}>
            {echeanceLabel(tache.date_echeance, tache.statut)}
          </span>

          {tache.priorite !== "NORMALE" && (
            <span className={cn("rounded px-1.5 py-0.5", priorite.className)}>
              {priorite.label}
            </span>
          )}

          {showContact &&
            contacts.map((c) => (
              <button
                key={c.contact_id}
                type="button"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => onOpenContact?.(c.contact_id)}
              >
                <User className="h-3 w-3" />
                {c.prenom} {c.nom}
              </button>
            ))}
        </div>

        {tache.description && (
          <p className="truncate text-xs text-muted-foreground">{tache.description}</p>
        )}
      </div>

      <div className="flex shrink-0 gap-1">
        <TacheChainMenu tache={tache} />
        <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(tache)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(tache)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
