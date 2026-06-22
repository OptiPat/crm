import { Calendar, Clock, Pencil, Trash2, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TacheChainMenu } from "@/components/taches/TacheChainMenu";
import type { Tache, TacheWithContact } from "@/lib/api/tauri-taches";
import {
  ECHEANCE_TONE_CLASS,
  PRIORITE_META,
  echeanceLabel,
  echeanceState,
} from "@/lib/taches/tache-display";
import { TACHE_POSTPONE_OPTIONS } from "@/lib/taches/postpone-tache";
import { formatRecurrenceLabel, isActiveRecurrence } from "@/lib/taches/tache-recurrence";

interface TacheItemProps {
  tache: Tache | TacheWithContact;
  /** Affiche le contact lié (page globale). */
  showContact?: boolean;
  /** Vue compacte (encart « aujourd'hui »). */
  compact?: boolean;
  bulkMode?: boolean;
  bulkSelected?: boolean;
  onBulkSelect?: (tache: Tache | TacheWithContact) => void;
  onToggle: (tache: Tache | TacheWithContact) => void;
  onEdit: (tache: Tache | TacheWithContact) => void;
  onDelete?: (tache: Tache | TacheWithContact) => void;
  onOpenContact?: (contactId: number) => void;
  onPlanifierRdv?: (tache: Tache | TacheWithContact) => void;
  onPostpone?: (tache: Tache | TacheWithContact, days: number) => void;
  onAttachContact?: (tache: Tache | TacheWithContact) => void;
}

export function TacheItem({
  tache,
  showContact = false,
  compact = false,
  bulkMode = false,
  bulkSelected = false,
  onBulkSelect,
  onToggle,
  onEdit,
  onDelete,
  onOpenContact,
  onPlanifierRdv,
  onPostpone,
  onAttachContact,
}: TacheItemProps) {
  const done = tache.statut === "FAIT";
  const state = echeanceState(tache.date_echeance, tache.statut);
  const contacts = tache.contacts ?? [];
  const priorite = PRIORITE_META[tache.priorite];
  const showActions = !compact;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
      {bulkMode && !done && onBulkSelect ? (
        <Checkbox
          checked={bulkSelected}
          onCheckedChange={() => onBulkSelect(tache)}
          className="mt-1"
          aria-label="Sélectionner pour action groupée"
        />
      ) : (
        <Checkbox
          checked={done}
          onCheckedChange={() => onToggle(tache)}
          className="mt-1"
          aria-label={done ? "Marquer à faire" : "Marquer comme faite"}
        />
      )}

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

          {tache.from_etiquette_auto && (
            <Badge variant="outline" className="h-5 text-[10px] px-1.5">
              Étiquette auto
            </Badge>
          )}

          {isActiveRecurrence(tache.recurrence) && (
            <Badge variant="outline" className="h-5 text-[10px] px-1.5 text-violet-700 border-violet-200">
              {formatRecurrenceLabel(tache.recurrence)}
            </Badge>
          )}

          {!tache.from_etiquette_auto && showActions && (
            <Badge variant="outline" className="h-5 text-[10px] px-1.5 text-muted-foreground">
              Manuelle
            </Badge>
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

          {showContact && contacts.length === 0 && showActions && (
            <span className="text-muted-foreground italic">Sans contact</span>
          )}
        </div>

        {tache.description && (
          <p className="truncate text-xs text-muted-foreground">{tache.description}</p>
        )}
      </div>

      {showActions && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {!done && onPostpone && (
            <Select onValueChange={(v) => onPostpone(tache, parseInt(v, 10))}>
              <SelectTrigger className="h-8 w-[120px] text-xs" title="Reporter">
                <Clock className="h-3.5 w-3.5 mr-1 shrink-0" />
                <SelectValue placeholder="Reporter" />
              </SelectTrigger>
              <SelectContent>
                {TACHE_POSTPONE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={String(opt.days)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {contacts.length === 0 && !done && onAttachContact && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Rattacher un contact"
              onClick={() => onAttachContact(tache)}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          )}

          {onPlanifierRdv && contacts.length > 0 && !done && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Planifier un RDV"
              onClick={() => onPlanifierRdv(tache)}
            >
              <Calendar className="h-4 w-4" />
            </Button>
          )}

          {contacts.length > 0 && <TacheChainMenu tache={tache} />}

          <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(tache)}>
            <Pencil className="h-4 w-4" />
          </Button>

          {onDelete && (
            <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(tache)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
