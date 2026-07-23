import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  filterOrganisationMemberRoster,
  organisationMemberLevelLabel,
  organisationMemberStatusLabel,
  type OrganisationMemberRosterEntry,
  type OrganisationMemberStatusFilter,
} from "@/lib/organisation/organisation-member-roster";

type OrganisationMemberSearchProps = {
  roster: OrganisationMemberRosterEntry[];
  onSelect: (contactId: number) => void;
  className?: string;
};

export function OrganisationMemberSearch({
  roster,
  onSelect,
  className,
}: OrganisationMemberSearchProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrganisationMemberStatusFilter>("all");

  const filtered = useMemo(
    () => filterOrganisationMemberRoster(roster, search, statusFilter),
    [roster, search, statusFilter]
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2 min-w-[220px] justify-between font-normal"
            aria-label="Rechercher un consultant"
          >
            <span className="flex items-center gap-2 text-muted-foreground truncate">
              <Search className="h-4 w-4 shrink-0" aria-hidden />
              Rechercher un consultant…
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,380px)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Nom, prénom…"
              value={search}
              onValueChange={setSearch}
            />
            <div className="px-2 py-1.5 border-b">
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as OrganisationMemberStatusFilter)
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous (actifs + désinscrits)</SelectItem>
                  <SelectItem value="actif">Actifs uniquement</SelectItem>
                  <SelectItem value="desinscrit">Désinscrits uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CommandList>
              <CommandEmpty>Aucun consultant trouvé.</CommandEmpty>
              <CommandGroup>
                {filtered.map((entry) => (
                  <CommandItem
                    key={entry.contact.id}
                    value={String(entry.contact.id)}
                    onSelect={() => {
                      if (entry.contact.id == null) return;
                      onSelect(entry.contact.id);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check className="mr-2 h-4 w-4 opacity-0" aria-hidden />
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="truncate font-medium">{entry.label}</span>
                      <span className="text-[11px] text-muted-foreground truncate">
                        {organisationMemberStatusLabel(entry.status)}
                        {organisationMemberLevelLabel(entry.generation)
                          ? ` · ${organisationMemberLevelLabel(entry.generation)}`
                          : ""}
                        {entry.parrainLabel ? ` · parrain : ${entry.parrainLabel}` : ""}
                      </span>
                    </span>
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
