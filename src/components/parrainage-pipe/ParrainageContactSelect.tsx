import { useState } from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Contact } from "@/lib/api/tauri-contacts";
import { ParrainageQuickContactDialog } from "@/components/parrainage-pipe/ParrainageQuickContactDialog";

interface ParrainageContactSelectProps {
  contacts: Contact[];
  value: number;
  onChange: (contactId: number) => void;
  onContactCreated?: (contact: Contact) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}

export function ParrainageContactSelect({
  contacts,
  value,
  onChange,
  onContactCreated,
  disabled = false,
  label = "Contact *",
  placeholder = "Rechercher un contact…",
}: ParrainageContactSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const sorted = [...contacts].sort((a, b) =>
    `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr")
  );
  const selected = value > 0 ? sorted.find((c) => c.id === value) : undefined;

  const openCreate = (hint?: string) => {
    setOpen(false);
    if (hint !== undefined) setSearch(hint);
    setCreateOpen(true);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          disabled={disabled}
          onClick={() => openCreate(search)}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Nouveau contact
        </Button>
      </div>

      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {selected ? `${selected.prenom} ${selected.nom}` : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter>
            <CommandInput placeholder="Nom, prénom…" onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>
                <div className="py-4 px-2 text-center text-sm">
                  <p className="text-muted-foreground">Aucun contact trouvé.</p>
                  <Button
                    type="button"
                    variant="link"
                    className="mt-1 h-auto p-0 text-xs"
                    onClick={() => openCreate(search)}
                  >
                    Créer « {search.trim() || "ce contact"} »
                  </Button>
                </div>
              </CommandEmpty>
              <CommandGroup>
                {sorted.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.prenom} ${c.nom} ${c.email ?? ""} ${c.filleul_categorie ?? ""}`}
                    onSelect={() => {
                      onChange(c.id!);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === c.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span>
                      {c.prenom} {c.nom}
                      {c.filleul_categorie ? (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          ({c.filleul_categorie.replace(/_/g, " ").toLowerCase()})
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <Separator className="my-1" />
              <CommandGroup>
                <CommandItem onSelect={() => openCreate(search)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Créer un nouveau contact
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <ParrainageQuickContactDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialSearch={search}
        onCreated={(contact) => onContactCreated?.(contact)}
      />
    </div>
  );
}
