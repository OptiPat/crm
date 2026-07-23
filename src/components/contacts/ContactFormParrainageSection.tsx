import { type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Contact, NewContact } from "@/lib/api/tauri-contacts";
import {
  SELECT_NONE,
  defaultProchainSuiviSixMois,
  todayLocal,
} from "@/lib/contacts/contact-form-utils";

type ContactFormParrainageSectionProps = {
  formData: NewContact;
  setFormData: Dispatch<SetStateAction<NewContact>>;
  contact?: Contact | null;
  mesFilleulsCount: number;
};

function DateFieldWithShortcuts({
  id,
  label,
  value,
  onChange,
  showFollowUpShortcuts,
}: {
  id: string;
  label: string;
  value?: string;
  onChange: (v: string) => void;
  showFollowUpShortcuts?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} />
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onChange(todayLocal())}
        >
          Aujourd&apos;hui
        </Button>
        {showFollowUpShortcuts && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onChange(defaultProchainSuiviSixMois())}
          >
            +6 mois
          </Button>
        )}
      </div>
    </div>
  );
}

export function ContactFormParrainageSection({
  formData,
  setFormData,
  contact,
  mesFilleulsCount,
}: ContactFormParrainageSectionProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
        Parrain, dates réseau, titre, qualification et volumes : module{" "}
        <span className="font-medium">Organisation</span> → dossier consultant.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type d&apos;invitation (JD / PO)</Label>
          <Select
            value={formData.type_invitation_filleul || SELECT_NONE}
            onValueChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                type_invitation_filleul: value === SELECT_NONE ? undefined : value,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_NONE}>Aucune</SelectItem>
              <SelectItem value="JD">Journée Découverte (JD)</SelectItem>
              <SelectItem value="PO">PO</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Présence à l&apos;invitation</Label>
          <Select
            value={
              formData.presence_invitation_filleul === 1
                ? "present"
                : formData.presence_invitation_filleul === 0
                  ? "absent"
                  : SELECT_NONE
            }
            onValueChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                presence_invitation_filleul:
                  value === "present" ? 1 : value === "absent" ? 0 : undefined,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Non renseigné" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_NONE}>Non renseigné</SelectItem>
              <SelectItem value="present">Présent</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DateFieldWithShortcuts
          id="date_dernier_contact_filleul"
          label="Dernier contact (filleul)"
          value={formData.date_dernier_contact_filleul}
          onChange={(v) =>
            setFormData((prev) => ({ ...prev, date_dernier_contact_filleul: v }))
          }
        />
        <DateFieldWithShortcuts
          id="date_prochain_suivi_filleul"
          label="Prochain suivi (filleul)"
          value={formData.date_prochain_suivi_filleul}
          onChange={(v) =>
            setFormData((prev) => ({ ...prev, date_prochain_suivi_filleul: v }))
          }
          showFollowUpShortcuts
        />
      </div>

      {contact && mesFilleulsCount > 0 && (
        <p className="text-sm text-muted-foreground rounded-md border px-3 py-2 bg-muted/20">
          Ce contact est parrain de {mesFilleulsCount} filleul
          {mesFilleulsCount > 1 ? "s" : ""}. Modifier le lien depuis le module Organisation.
        </p>
      )}
    </div>
  );
}
