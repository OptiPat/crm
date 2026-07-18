import { useState } from "react";
import {
  Archive,
  Briefcase,
  ChevronDown,
  ClipboardList,
  Euro,
  LayoutList,
  PhoneCall,
  Plus,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PIPE_SECTION_LABELS,
  PIPE_SECTIONS,
  type PipeSection,
} from "@/lib/pipe/pipe-section";
import { type PipeType } from "@/lib/pipe/pipe-types";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<PipeSection, typeof Briefcase> = {
  affaires: Briefcase,
  suivi_stellium: ClipboardList,
  remuneration: Euro,
  liste: LayoutList,
};

const CREATE_OPTIONS: { type: PipeType; label: string; icon: typeof Briefcase }[] = [
  { type: "AFFAIRE", label: "Affaire", icon: Briefcase },
  { type: "ACTE_GESTION", label: "Dossier suivi", icon: ClipboardList },
  { type: "ACTION", label: "Action", icon: PhoneCall },
];

interface PipePageToolbarProps {
  section: PipeSection;
  showArchived: boolean;
  onSectionChange: (section: PipeSection) => void;
  onShowArchivedChange: (show: boolean) => void;
  onCreate: (type: PipeType) => void;
  onOpenSettings: () => void;
}

export function PipePageToolbar({
  section,
  showArchived,
  onSectionChange,
  onShowArchivedChange,
  onCreate,
  onOpenSettings,
}: PipePageToolbarProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        className="inline-flex max-w-full flex-wrap rounded-lg border bg-muted/30 p-1"
        role="tablist"
        aria-label="Sections Pipe"
      >
        {PIPE_SECTIONS.map((key) => {
          const Icon = SECTION_ICONS[key];
          const active = section === key;
          return (
            <Button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              variant={active ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-8 gap-1.5 px-3 text-xs sm:text-sm",
                active && "shadow-sm"
              )}
              onClick={() => onSectionChange(key)}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{PIPE_SECTION_LABELS[key]}</span>
            </Button>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Popover open={createOpen} onOpenChange={setCreateOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" className="h-8 gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Nouveau
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1.5">
            <div className="flex flex-col gap-0.5">
              {CREATE_OPTIONS.map(({ type, label, icon: Icon }) => (
                <Button
                  key={type}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-full justify-start gap-2 px-2"
                  onClick={() => {
                    setCreateOpen(false);
                    onCreate(type);
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant={showArchived ? "secondary" : "outline"}
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={showArchived ? "Masquer les archivés" : "Afficher les archivés"}
          title={showArchived ? "Masquer archivés" : "Archivés"}
          onClick={() => onShowArchivedChange(!showArchived)}
        >
          <Archive className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Paramètres checklists documents"
          title="Checklists documents R1 / R3 / R3 Immo"
          onClick={onOpenSettings}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
