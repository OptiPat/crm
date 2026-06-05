import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCustomFieldDef,
  updateCustomFieldDef,
  parseSelectOptions,
  CUSTOM_FIELD_TYPE_LABELS,
  type CustomFieldDef,
  type CustomFieldType,
} from "@/lib/api/tauri-custom-fields";
import { toast } from "sonner";

interface CustomFieldDefDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field?: CustomFieldDef | null;
  onSuccess: () => void;
}

const TYPE_ORDER: CustomFieldType[] = ["text", "number", "date", "boolean", "select"];

export function CustomFieldDefDialog({
  open,
  onOpenChange,
  field,
  onSuccess,
}: CustomFieldDefDialogProps) {
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [actif, setActif] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (field) {
      setLabel(field.label);
      setFieldType(field.field_type);
      setOptionsText(parseSelectOptions(field.options).join("\n"));
      setActif(field.actif);
    } else {
      setLabel("");
      setFieldType("text");
      setOptionsText("");
      setActif(true);
    }
  }, [open, field]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      toast.error("Indiquez un libellé");
      return;
    }
    const options =
      fieldType === "select"
        ? JSON.stringify(
            optionsText
              .split("\n")
              .map((o) => o.trim())
              .filter((o) => o.length > 0)
          )
        : null;
    if (fieldType === "select" && options === "[]") {
      toast.error("Ajoutez au moins un choix pour une liste");
      return;
    }

    setSaving(true);
    try {
      if (field) {
        await updateCustomFieldDef(field.id, {
          label: label.trim(),
          field_type: fieldType,
          options,
          actif,
        });
        toast.success("Champ modifié");
      } else {
        await createCustomFieldDef({
          label: label.trim(),
          field_type: fieldType,
          options,
          actif,
        });
        toast.success("Champ créé");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erreur sauvegarde champ personnalisé:", error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{field ? "Modifier le champ" : "Nouveau champ personnalisé"}</DialogTitle>
          <DialogDescription>
            Un champ libre ajouté à toutes les fiches contact.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cf-label">Libellé *</Label>
            <Input
              id="cf-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex. Numéro client, RIB, Hobby…"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as CustomFieldType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_ORDER.map((t) => (
                  <SelectItem key={t} value={t}>
                    {CUSTOM_FIELD_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fieldType === "select" && (
            <div className="space-y-2">
              <Label htmlFor="cf-options">Choix possibles (un par ligne)</Label>
              <Textarea
                id="cf-options"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder={"Particulier\nProfessionnel\nSociété"}
                rows={4}
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="space-y-0.5">
              <Label htmlFor="cf-actif" className="text-sm font-medium">
                Champ actif
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Inactif : masqué sur les fiches, valeurs conservées.
              </p>
            </div>
            <Switch id="cf-actif" checked={actif} onCheckedChange={setActif} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement..." : field ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
