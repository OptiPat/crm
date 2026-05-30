import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FileUp, GitMerge, MoreHorizontal, Plus, Trash2 } from "lucide-react";

type MainTab = "clients" | "filleuls";

export function ContactsPageHeader({
  mainTab,
  filteredCount,
  onNewContact,
  onImport,
  onDeduplicate,
  onDeleteAll,
}: {
  mainTab: MainTab;
  filteredCount: number;
  onNewContact: () => void;
  onImport: () => void;
  onDeduplicate: () => void;
  onDeleteAll: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-6">
      <div>
        <p className="text-xs font-medium text-muted-foreground capitalize">{today}</p>
        <h2 className="text-3xl font-serif font-bold text-primary tracking-tight mt-1">
          Contacts
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Clients, filleuls et foyers —{" "}
          <span className="tabular-nums">
            {filteredCount} dans la vue actuelle
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-2" onClick={onNewContact}>
          <Plus className="h-4 w-4" />
          Nouveau contact
        </Button>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Autres actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                className="justify-start gap-2 h-9"
                onClick={() => {
                  setMenuOpen(false);
                  onDeduplicate();
                }}
              >
                <GitMerge className="h-4 w-4" />
                Dédupliquer
              </Button>
              <Button
                variant="ghost"
                className="justify-start gap-2 h-9"
                onClick={() => {
                  setMenuOpen(false);
                  onImport();
                }}
              >
                <FileUp className="h-4 w-4" />
                Importer {mainTab === "filleuls" ? "filleuls" : "clients"}
              </Button>
              {filteredCount > 0 && (
                <Button
                  variant="ghost"
                  className="justify-start gap-2 h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setMenuOpen(false);
                    onDeleteAll();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer tous ({mainTab === "clients" ? "clients" : "filleuls"})
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
