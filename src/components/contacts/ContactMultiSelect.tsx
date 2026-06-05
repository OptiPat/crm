import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { Contact } from "@/lib/api/tauri-contacts";

interface ContactMultiSelectProps {
  label: string;
  hint?: string;
  placeholder?: string;
  contacts: Contact[];
  /** Identifiants des contacts sélectionnés. */
  value: number[];
  onChange: (ids: number[]) => void;
}

/** Sélection de plusieurs contacts (puces + recherche). */
export function ContactMultiSelect({
  label,
  hint,
  placeholder = "Ajouter un contact…",
  contacts,
  value,
  onChange,
}: ContactMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const byId = new Map(contacts.map((c) => [c.id, c]));
  const selected = value
    .map((id) => byId.get(id))
    .filter((c): c is Contact => Boolean(c));

  const sorted = [...contacts].sort((a, b) =>
    `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`)
  );

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
            >
              {c.prenom} {c.nom}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => toggle(c.id!)}
                aria-label={`Retirer ${c.prenom} ${c.nom}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="text-muted-foreground">{placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Nom ou prénom..." />
            <CommandList>
              <CommandEmpty>Aucun contact trouvé</CommandEmpty>
              <CommandGroup>
                {sorted.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.prenom} ${c.nom} ${c.email || ""}`}
                    onSelect={() => c.id != null && toggle(c.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        c.id != null && value.includes(c.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="flex-1 truncate">
                      {c.prenom} {c.nom}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">{c.categorie}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
