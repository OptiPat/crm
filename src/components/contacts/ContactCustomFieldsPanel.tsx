import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getContactCustomFields,
  setContactCustomFields,
  parseSelectOptions,
  type ContactCustomField,
} from "@/lib/api/tauri-custom-fields";
import { subscribeCustomFieldsChanged } from "@/lib/custom-fields/custom-field-events";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { notifyTachesChanged } from "@/lib/taches/tache-events";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

interface ContactCustomFieldsPanelProps {
  contactId: number;
}

const NONE_VALUE = "__none__";

function buildSnapshot(fields: ContactCustomField[]): Record<number, string> {
  const map: Record<number, string> = {};
  for (const f of fields) map[f.def_id] = f.value ?? "";
  return map;
}

export function ContactCustomFieldsPanel({ contactId }: ContactCustomFieldsPanelProps) {
  const [fields, setFields] = useState<ContactCustomField[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [initial, setInitial] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getContactCustomFields(contactId)
      .then((data) => {
        setFields(data);
        const snap = buildSnapshot(data);
        setValues(snap);
        setInitial(snap);
      })
      .catch((error) => {
        console.error("Erreur chargement champs personnalisés:", error);
      })
      .finally(() => setLoading(false));
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  // Recharger si les définitions changent (ajout/suppression dans les Paramètres).
  useEffect(() => subscribeCustomFieldsChanged(load), [load]);

  const isDirty = useMemo(
    () => fields.some((f) => (values[f.def_id] ?? "") !== (initial[f.def_id] ?? "")),
    [fields, values, initial]
  );

  const setValue = (defId: number, value: string) =>
    setValues((prev) => ({ ...prev, [defId]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await setContactCustomFields(
        contactId,
        fields.map((f) => ({
          def_id: f.def_id,
          value: (values[f.def_id] ?? "").trim() || null,
        }))
      );
      setInitial({ ...values });
      // Le backend a recalculé les étiquettes auto : rafraîchir compteurs et tâches du contact.
      notifyEtiquettesChanged();
      notifyTachesChanged();
      toast.success("Champs enregistrés");
    } catch (error) {
      console.error("Erreur sauvegarde champs personnalisés:", error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (loading || fields.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Champs personnalisés</h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const value = values[field.def_id] ?? "";
          return (
            <div key={field.def_id} className="space-y-1.5">
              <Label htmlFor={`cf-${field.def_id}`} className="text-xs text-muted-foreground">
                {field.label}
              </Label>
              {field.field_type === "boolean" ? (
                <div className="flex items-center gap-2 h-9">
                  <Switch
                    id={`cf-${field.def_id}`}
                    checked={value === "true"}
                    onCheckedChange={(c) => setValue(field.def_id, c ? "true" : "")}
                  />
                  <span className="text-sm text-muted-foreground">
                    {value === "true" ? "Oui" : "Non"}
                  </span>
                </div>
              ) : field.field_type === "select" ? (
                <Select
                  value={value || NONE_VALUE}
                  onValueChange={(v) => setValue(field.def_id, v === NONE_VALUE ? "" : v)}
                >
                  <SelectTrigger id={`cf-${field.def_id}`}>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>—</SelectItem>
                    {parseSelectOptions(field.options).map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`cf-${field.def_id}`}
                  type={
                    field.field_type === "number"
                      ? "number"
                      : field.field_type === "date"
                        ? "date"
                        : "text"
                  }
                  value={value}
                  onChange={(e) => setValue(field.def_id, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>

      {isDirty && (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setValues(initial)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      )}
    </div>
  );
}
