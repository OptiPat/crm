import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RdvVisioMode } from "@/lib/calendar/rdv-visio";
import type { ContactAddressFields } from "@/lib/contacts/contact-form-utils";

interface RdvVisioLocationFieldsProps {
  visioMode: RdvVisioMode;
  visioLink: string;
  address: ContactAddressFields;
  disabled?: boolean;
  onVisioModeChange: (mode: RdvVisioMode) => void;
  onVisioLinkChange: (value: string) => void;
  onAddressFieldChange: <K extends keyof ContactAddressFields>(key: K, value: string) => void;
}

export function RdvVisioLocationFields({
  visioMode,
  visioLink,
  address,
  disabled = false,
  onVisioModeChange,
  onVisioLinkChange,
  onAddressFieldChange,
}: RdvVisioLocationFieldsProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Lieu du RDV</Label>
        <Select
          value={visioMode}
          onValueChange={(v) => onVisioModeChange(v as RdvVisioMode)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Présentiel</SelectItem>
            <SelectItem value="google_meet">Visio — Google Meet (lien auto)</SelectItem>
            <SelectItem value="custom">Visio — Zoom / Teams (mon lien)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visioMode === "custom" && (
        <>
          <Input
            type="url"
            value={visioLink}
            onChange={(e) => onVisioLinkChange(e.target.value)}
            placeholder="https://zoom.us/j/… ou https://teams.microsoft.com/…"
            disabled={disabled}
          />
          {!visioLink.trim() && (
            <p className="text-xs text-muted-foreground">
              Enregistrez votre lien une fois dans Paramètres → Agenda &amp; RDV.
            </p>
          )}
        </>
      )}

      {visioMode === "none" && (
        <div className="space-y-3 rounded-md border bg-muted/10 p-3">
          <p className="text-xs text-muted-foreground leading-snug">
            Adresse enregistrée sur la fiche contact et indiquée dans Google Agenda.
          </p>
          <div className="space-y-2">
            <Label htmlFor="rdv-adresse">Adresse</Label>
            <Input
              id="rdv-adresse"
              value={address.adresse || ""}
              onChange={(e) => onAddressFieldChange("adresse", e.target.value)}
              disabled={disabled}
              placeholder="12 rue des Acacias"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rdv-cp">Code postal</Label>
              <Input
                id="rdv-cp"
                value={address.code_postal || ""}
                onChange={(e) => onAddressFieldChange("code_postal", e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rdv-ville">Ville</Label>
              <Input
                id="rdv-ville"
                value={address.ville || ""}
                onChange={(e) => onAddressFieldChange("ville", e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
