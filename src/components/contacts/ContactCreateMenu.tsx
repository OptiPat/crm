import { useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, ListTodo, MessageSquare, Tag } from "lucide-react";
import { TacheForm } from "@/components/taches/TacheForm";
import { InteractionForm } from "@/components/interactions/InteractionForm";

interface ContactCreateMenuProps {
  contactId: number;
  /** Appelé après création d'une tâche ou d'un échange (pour rafraîchir la fiche). */
  onCreated?: () => void;
  /** Ouvre le sélecteur d'étiquettes existant de l'en-tête. */
  onOpenEtiquettes: () => void;
}

function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted transition-colors"
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="flex-1">
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

/**
 * Bouton « Créer » de la fiche contact : regroupe en un seul endroit la création
 * d'une tâche/rappel, d'une note d'échange (mail/appel/RDV) et la pose d'une étiquette.
 */
export function ContactCreateMenu({
  contactId,
  onCreated,
  onOpenEtiquettes,
}: ContactCreateMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tacheOpen, setTacheOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            <span className="sr-only md:not-sr-only">Créer</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1.5">
          <MenuItem
            icon={ListTodo}
            label="Tâche / rappel"
            onClick={() => {
              setMenuOpen(false);
              setTacheOpen(true);
            }}
          />
          <MenuItem
            icon={MessageSquare}
            label="Noter un échange"
            hint="mail, appel, RDV…"
            onClick={() => {
              setMenuOpen(false);
              setInteractionOpen(true);
            }}
          />
          <MenuItem
            icon={Tag}
            label="Poser une étiquette"
            onClick={() => {
              setMenuOpen(false);
              onOpenEtiquettes();
            }}
          />
        </PopoverContent>
      </Popover>

      <TacheForm
        open={tacheOpen}
        onOpenChange={setTacheOpen}
        fixedContactId={contactId}
        onSuccess={() => {
          setTacheOpen(false);
          onCreated?.();
        }}
      />
      <InteractionForm
        open={interactionOpen}
        onOpenChange={setInteractionOpen}
        defaultContactId={contactId}
        onSuccess={() => {
          setInteractionOpen(false);
          onCreated?.();
        }}
      />
    </>
  );
}
