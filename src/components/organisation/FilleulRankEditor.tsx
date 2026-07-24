import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import type { Contact } from "@/lib/api/tauri-contacts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RankIcon } from "@/components/organisation/FilleulRankIcons";
import {
  FILLEUL_QUALIFICATIONS,
  FILLEUL_QUALIFICATION_META,
  FILLEUL_TITRES,
  FILLEUL_TITRE_META,
  parseFilleulQualification,
  parseFilleulTitre,
  type FilleulQualification,
  type FilleulTitre,
} from "@/lib/organisation/filleul-ranks";
import { cn } from "@/lib/utils";

type FilleulRankEditorProps = {
  contact: Contact;
  onSave: (
    contact: Contact,
    ranks: { filleul_titre?: string | null; filleul_qualification?: string | null }
  ) => void | Promise<void>;
  /** `node` = crayon au survol (carte) ; `panel` = bouton visible (dossier consultant). */
  variant?: "node" | "panel";
  className?: string;
};

function RankOptionList<T extends string>({
  label,
  noneLabel,
  options,
  meta,
  value,
  onChange,
}: {
  label: string;
  noneLabel: string;
  options: readonly T[];
  meta: Record<T, { label: string; icon: Parameters<typeof RankIcon>[0]["kind"] }>;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  const entries: { id: T | undefined; label: string; icon: Parameters<typeof RankIcon>[0]["kind"] }[] =
    [
      { id: undefined, label: noneLabel, icon: "none" },
      ...options.map((id) => ({
        id,
        label: meta[id].label,
        icon: meta[id].icon,
      })),
    ];

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div
        className="max-h-36 overflow-y-auto rounded-md border bg-background p-1 space-y-0.5"
        role="listbox"
        aria-label={label}
      >
        {entries.map((entry) => {
          const selected = value === entry.id;
          return (
            <button
              key={entry.id ?? "__none__"}
              type="button"
              role="option"
              aria-selected={selected}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
                "hover:bg-accent hover:text-accent-foreground",
                selected && "bg-accent text-accent-foreground"
              )}
              onClick={() => onChange(entry.id)}
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {selected ? <Check className="h-3 w-3" aria-hidden /> : null}
              </span>
              {entry.icon !== "none" ? <RankIcon kind={entry.icon} /> : null}
              <span>{entry.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FilleulRankEditor({
  contact,
  onSave,
  variant = "node",
  className,
}: FilleulRankEditorProps) {
  const [open, setOpen] = useState(false);
  const [titre, setTitre] = useState<FilleulTitre | undefined>(
    () => parseFilleulTitre(contact.filleul_titre) ?? undefined
  );
  const [qualification, setQualification] = useState<FilleulQualification | undefined>(
    () => parseFilleulQualification(contact.filleul_qualification) ?? undefined
  );
  const [saving, setSaving] = useState(false);

  const syncFromContact = () => {
    setTitre(parseFilleulTitre(contact.filleul_titre) ?? undefined);
    setQualification(parseFilleulQualification(contact.filleul_qualification) ?? undefined);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) syncFromContact();
    setOpen(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(contact, {
        filleul_titre: titre ?? null,
        filleul_qualification: qualification ?? null,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {variant === "panel" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-8 gap-1.5 text-xs", className)}
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Modifier titre et qualification
          </Button>
        ) : (
          <button
            type="button"
            title="Titre et qualification"
            aria-label="Modifier titre et qualification"
            className={cn(
              "absolute top-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-md",
              "text-muted-foreground/70 hover:text-foreground hover:bg-background/90",
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              "transition-opacity",
              className
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil className="h-3 w-3" aria-hidden />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3 space-y-3"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium leading-tight">
          {contact.prenom} {contact.nom}
        </p>

        <RankOptionList
          label="Titre"
          noneLabel="Aucun"
          options={FILLEUL_TITRES}
          meta={FILLEUL_TITRE_META}
          value={titre}
          onChange={setTitre}
        />

        <RankOptionList
          label="Qualification"
          noneLabel="Aucune"
          options={FILLEUL_QUALIFICATIONS}
          meta={FILLEUL_QUALIFICATION_META}
          value={qualification}
          onChange={setQualification}
        />

        <Button
          type="button"
          size="sm"
          className="w-full h-8"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
