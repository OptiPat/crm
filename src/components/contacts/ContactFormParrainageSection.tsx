import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import { FilleulRankFormFields } from "@/components/organisation/FilleulRankFormFields";
import type { Contact, NewContact } from "@/lib/api/tauri-contacts";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import {
  SELECT_NONE,
  dateFieldToIso,
  defaultProchainSuiviSixMois,
  parseDateInscriptionFromNotes,
  setDateInscriptionInNotes,
  toDateInput,
  todayLocal,
} from "@/lib/contacts/contact-form-utils";
import {
  computeContactBranchVolumeSummary,
  formatFilleulVolumeDisplay,
  formatFilleulVolumeField,
  parseFilleulVolumeField,
} from "@/lib/organisation/organisation-branch-volumes";
import {
  ORGANISATION_MANAGER_VOLUME_TARGET,
  isManagerObjectiveEligible,
} from "@/lib/organisation/organisation-manager-objective";
import { resolveOrganisationSelfContact } from "@/lib/organisation/organisation-tree";
import { cn } from "@/lib/utils";

type ContactFormParrainageSectionProps = {
  formData: NewContact;
  setFormData: Dispatch<SetStateAction<NewContact>>;
  contact?: Contact | null;
  allContacts: Contact[];
  mesFilleulsCount: number;
  onOpenContact?: (contact: Contact) => void;
  onCreateParrain: (nom: string, prenom: string) => Promise<void>;
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
  allContacts,
  mesFilleulsCount,
  onOpenContact,
  onCreateParrain,
}: ContactFormParrainageSectionProps) {
  const [cgpNom, setCgpNom] = useState("");
  const [cgpPrenom, setCgpPrenom] = useState("");

  useEffect(() => {
    void getCgpConfig().then((cgp) => {
      setCgpNom(cgp.nom?.trim() ?? "");
      setCgpPrenom(cgp.prenom?.trim() ?? "");
    });
  }, []);

  const selfContact = useMemo(
    () => resolveOrganisationSelfContact(allContacts, { nom: cgpNom, prenom: cgpPrenom }),
    [allContacts, cgpNom, cgpPrenom]
  );

  const volumeSummary = useMemo(() => {
    const forCalc = {
      id: contact?.id,
      filleul_volume: formData.filleul_volume ?? null,
      filleul_volume_manager: formData.filleul_volume_manager ?? null,
      filleul_titre: formData.filleul_titre ?? null,
      filleul_qualification: formData.filleul_qualification ?? null,
    };
    return computeContactBranchVolumeSummary(forCalc, allContacts, selfContact);
  }, [
    contact?.id,
    formData.filleul_volume,
    formData.filleul_volume_manager,
    formData.filleul_titre,
    formData.filleul_qualification,
    allContacts,
    selfContact,
  ]);

  const managerEligible = isManagerObjectiveEligible(
    formData.filleul_titre,
    formData.filleul_qualification
  );
  const managerStatus = volumeSummary.managerObjectiveStatus;
  const managerColored = managerStatus !== "not_applicable";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <DateFieldWithShortcuts
          id="date_invitation_filleul"
          label="Date d'invitation"
          value={formData.date_invitation_filleul ?? ""}
          onChange={(v) =>
            setFormData((prev) => ({
              ...prev,
              date_invitation_filleul: v,
            }))
          }
        />
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
          id="date_inscription_filleul"
          label="Date d'inscription"
          value={toDateInput(parseDateInscriptionFromNotes(formData.notes))}
          onChange={(v) =>
            setFormData((prev) => ({
              ...prev,
              notes: setDateInscriptionInNotes(prev.notes, dateFieldToIso(v)),
            }))
          }
        />
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

      <Separator />

      <ContactPersonSearch
        label="Mon parrain"
        hint="Personne qui vous a parrainé dans le réseau filleul"
        placeholder="Rechercher un parrain..."
        contacts={allContacts}
        excludeId={contact?.id}
        value={formData.parrain_id}
        onChange={(id) => setFormData((prev) => ({ ...prev, parrain_id: id }))}
        onOpenContact={onOpenContact}
        badgeFn={(c) => c.filleul_categorie || c.categorie}
        allowCreate
        createTitle="Créer un nouveau parrain"
        onCreate={onCreateParrain}
      />

      <FilleulRankFormFields
        titre={formData.filleul_titre}
        qualification={formData.filleul_qualification}
        onTitreChange={(v) => setFormData((prev) => ({ ...prev, filleul_titre: v }))}
        onQualificationChange={(v) =>
          setFormData((prev) => ({ ...prev, filleul_qualification: v }))
        }
      />

      {contact && mesFilleulsCount > 0 && (
        <p className="text-sm text-muted-foreground rounded-md border px-3 py-2 bg-muted/20">
          Ce contact est parrain de {mesFilleulsCount} filleul
          {mesFilleulsCount > 1 ? "s" : ""}. Modifier le lien depuis la fiche de chaque filleul.
        </p>
      )}

      <Separator />

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">Volumes réseau</h4>
        <div
          className={cn(
            "grid grid-cols-1 gap-4",
            managerEligible ? "sm:grid-cols-3" : "sm:grid-cols-2"
          )}
        >
          {managerEligible && (
            <div className="space-y-2">
              <Label htmlFor="filleul_volume_manager">Objectif Manager (cumul)</Label>
              <div
                className={cn(
                  managerColored &&
                    managerStatus === "target_met" &&
                    "rounded-md ring-1 ring-emerald-200",
                  managerColored &&
                    managerStatus === "below_target" &&
                    "rounded-md ring-1 ring-amber-200"
                )}
              >
                <Input
                  id="filleul_volume_manager"
                  className="text-right tabular-nums bg-background"
                  inputMode="decimal"
                  placeholder="0"
                  defaultValue={formatFilleulVolumeField(volumeSummary.managerVolume)}
                  key={`mgr-${contact?.id ?? "new"}-${formData.filleul_volume_manager ?? "empty"}`}
                  onBlur={(e) => {
                    const parsed = parseFilleulVolumeField(e.target.value);
                    if (parsed == null) return;
                    setFormData((prev) => ({
                      ...prev,
                      filleul_volume_manager: parsed === 0 ? undefined : parsed,
                    }));
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Junior / Consultant : {formatFilleulVolumeDisplay(ORGANISATION_MANAGER_VOLUME_TARGET)}{" "}
                cumul branche, sans limite de temps.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="filleul_volume">Volume propre (exercice)</Label>
            <Input
              id="filleul_volume"
              className="text-right tabular-nums"
              inputMode="decimal"
              placeholder="0"
              defaultValue={formatFilleulVolumeField(volumeSummary.ownVolume)}
              key={`vol-${contact?.id ?? "new"}-${formData.filleul_volume ?? "empty"}`}
              onBlur={(e) => {
                const parsed = parseFilleulVolumeField(e.target.value);
                if (parsed == null) return;
                setFormData((prev) => ({
                  ...prev,
                  filleul_volume: parsed === 0 ? undefined : parsed,
                }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Volume branche (exercice)</Label>
            <div className="flex h-9 items-center justify-end rounded-md border border-input bg-muted/30 px-3 text-sm tabular-nums font-medium">
              {formatFilleulVolumeDisplay(volumeSummary.branchVolume)}
            </div>
            <p className="text-xs text-muted-foreground">Le sien + filleuls actifs, exercice en cours.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
