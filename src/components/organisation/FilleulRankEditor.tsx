import { useState } from "react";
import { Pencil } from "lucide-react";
import type { Contact } from "@/lib/api/tauri-contacts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RankIcon } from "@/components/organisation/FilleulRankIcons";
import {
  FILLEUL_QUALIFICATIONS,
  FILLEUL_QUALIFICATION_META,
  FILLEUL_TITRES,
  FILLEUL_TITRE_META,
  type FilleulQualification,
  type FilleulTitre,
} from "@/lib/organisation/filleul-ranks";
import { SELECT_NONE } from "@/lib/contacts/contact-form-utils";
import { cn } from "@/lib/utils";

const NONE = SELECT_NONE;

type FilleulRankEditorProps = {
  contact: Contact;
  onSave: (
    contact: Contact,
    ranks: { filleul_titre?: string | null; filleul_qualification?: string | null }
  ) => void | Promise<void>;
  className?: string;
};

export function FilleulRankEditor({ contact, onSave, className }: FilleulRankEditorProps) {
  const [open, setOpen] = useState(false);
  const [titre, setTitre] = useState(contact.filleul_titre ?? NONE);
  const [qualification, setQualification] = useState(contact.filleul_qualification ?? NONE);
  const [saving, setSaving] = useState(false);

  const syncFromContact = () => {
    setTitre(contact.filleul_titre ?? NONE);
    setQualification(contact.filleul_qualification ?? NONE);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) syncFromContact();
    setOpen(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(contact, {
        filleul_titre: titre === NONE ? null : titre,
        filleul_qualification: qualification === NONE ? null : qualification,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3 space-y-3"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium leading-tight">
          {contact.prenom} {contact.nom}
        </p>

        <div className="space-y-1.5">
          <Label className="text-xs">Titre</Label>
          <Select value={titre} onValueChange={setTitre}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Aucun" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Aucun</SelectItem>
              {FILLEUL_TITRES.map((id) => (
                <SelectItem key={id} value={id}>
                  <span className="inline-flex items-center gap-2">
                    <RankIcon kind={FILLEUL_TITRE_META[id as FilleulTitre].icon} />
                    {FILLEUL_TITRE_META[id as FilleulTitre].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Qualification</Label>
          <Select value={qualification} onValueChange={setQualification}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Aucune" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Aucune</SelectItem>
              {FILLEUL_QUALIFICATIONS.map((id) => (
                <SelectItem key={id} value={id}>
                  <span className="inline-flex items-center gap-2">
                    <RankIcon
                      kind={FILLEUL_QUALIFICATION_META[id as FilleulQualification].icon}
                    />
                    {FILLEUL_QUALIFICATION_META[id as FilleulQualification].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
