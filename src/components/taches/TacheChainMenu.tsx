import { useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MoreHorizontal, MessageSquare, Tag, ListTodo } from "lucide-react";
import { TacheForm } from "@/components/taches/TacheForm";
import { InteractionForm } from "@/components/interactions/InteractionForm";
import { EtiquetteQuickPickDialog } from "@/components/etiquettes/EtiquetteQuickPickDialog";
import type { Tache } from "@/lib/api/tauri-taches";

interface TacheChainMenuProps {
  tache: Tache;
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
 * Menu « Suite » sur une tâche : enchaîner une action pour le(s) contact(s) liés
 * (noter un échange, poser une étiquette, créer un rappel de suivi).
 */
export function TacheChainMenu({ tache }: TacheChainMenuProps) {
  const contacts = tache.contacts ?? [];
  const singleContactId = contacts.length === 1 ? contacts[0].contact_id : null;
  const seedContactId = singleContactId ?? contacts[0]?.contact_id;

  const [menuOpen, setMenuOpen] = useState(false);
  const [tacheOpen, setTacheOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [etiquetteOpen, setEtiquetteOpen] = useState(false);

  if (contacts.length === 0) return null;

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Enchaîner une suite"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1.5">
          <p className="px-2 pb-1 pt-0.5 text-xs text-muted-foreground">
            Suite pour ce contact
          </p>
          {singleContactId != null && (
            <MenuItem
              icon={MessageSquare}
              label="Noter un échange"
              hint="mail, appel, RDV…"
              onClick={() => {
                setMenuOpen(false);
                setInteractionOpen(true);
              }}
            />
          )}
          {singleContactId != null && (
            <MenuItem
              icon={Tag}
              label="Poser une étiquette"
              onClick={() => {
                setMenuOpen(false);
                setEtiquetteOpen(true);
              }}
            />
          )}
          <MenuItem
            icon={ListTodo}
            label="Rappel de suivi"
            hint="nouvelle tâche"
            onClick={() => {
              setMenuOpen(false);
              setTacheOpen(true);
            }}
          />
        </PopoverContent>
      </Popover>

      {seedContactId != null && (
        <TacheForm
          open={tacheOpen}
          onOpenChange={setTacheOpen}
          fixedContactId={seedContactId}
          onSuccess={() => setTacheOpen(false)}
        />
      )}
      {singleContactId != null && (
        <>
          <InteractionForm
            open={interactionOpen}
            onOpenChange={setInteractionOpen}
            defaultContactId={singleContactId}
            onSuccess={() => setInteractionOpen(false)}
          />
          <EtiquetteQuickPickDialog
            open={etiquetteOpen}
            onOpenChange={setEtiquetteOpen}
            contactId={singleContactId}
          />
        </>
      )}
    </>
  );
}
