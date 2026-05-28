import { useState } from "react";
import { Check, ChevronsUpDown, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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

interface ContactPersonSearchProps {
  label: string;
  hint?: string;
  placeholder?: string;
  contacts: Contact[];
  excludeId?: number;
  value?: number;
  onChange: (id: number | undefined) => void;
  onOpenContact?: (contact: Contact) => void;
  badgeFn?: (c: Contact) => string;
  allowCreate?: boolean;
  createTitle?: string;
  onCreate?: (nom: string, prenom: string) => Promise<void>;
}

export function ContactPersonSearch({
  label,
  hint,
  placeholder = "Rechercher...",
  contacts,
  excludeId,
  value,
  onChange,
  onOpenContact,
  badgeFn,
  allowCreate = false,
  createTitle = "Créer une personne",
  onCreate,
}: ContactPersonSearchProps) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newNom, setNewNom] = useState("");
  const [newPrenom, setNewPrenom] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = contacts.find((c) => c.id === value);
  const filtered = contacts
    .filter((c) => c.id !== excludeId)
    .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`));

  const handleCreate = async () => {
    if (!onCreate || !newNom.trim() || !newPrenom.trim()) return;
    setCreating(true);
    try {
      await onCreate(newNom.trim(), newPrenom.trim());
      setShowCreate(false);
      setNewNom("");
      setNewPrenom("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground -mt-1">{hint}</p>}

      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="flex-1 justify-between font-normal"
            >
              {selected ? (
                <span className="truncate">
                  {selected.prenom} {selected.nom}
                </span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command>
              <CommandInput placeholder="Nom ou prénom..." />
              <CommandList>
                <CommandEmpty>Aucun contact trouvé</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__none__"
                    onSelect={() => {
                      onChange(undefined);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")}
                    />
                    Aucun
                  </CommandItem>
                  {filtered.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.prenom} ${c.nom} ${c.email || ""}`}
                      onSelect={() => {
                        onChange(c.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === c.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex-1 truncate">
                        {c.prenom} {c.nom}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {badgeFn ? badgeFn(c) : c.categorie}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {allowCreate && onCreate && (
          <Button type="button" variant="outline" size="icon" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {selected && onOpenContact && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => onOpenContact(selected)}
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          Voir la fiche
        </Button>
      )}

      {showCreate && allowCreate && onCreate && (
        <div className="p-3 border rounded-lg bg-muted/40 space-y-2">
          <p className="text-sm font-medium">{createTitle}</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Nom" value={newNom} onChange={(e) => setNewNom(e.target.value)} />
            <Input
              placeholder="Prénom"
              value={newPrenom}
              onChange={(e) => setNewPrenom(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={creating} onClick={handleCreate}>
              {creating ? "..." : "Créer"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
