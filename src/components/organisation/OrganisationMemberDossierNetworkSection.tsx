import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import { FilleulDossierDateField } from "@/components/organisation/FilleulDossierDateField";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { updateContact } from "@/lib/api/tauri-contacts";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { dossierDateToInput } from "@/lib/organisation/organisation-filleul-dossier";
import { describeOrganisationExerciceVisibilityHint } from "@/lib/organisation/organisation-filleul-dossier-validation";
import { FILLEUL_DOSSIER_DATE_LABELS } from "@/lib/organisation/organisation-filleul-dossier-labels";
import { useFilleulDossierPatchQueue } from "@/hooks/useFilleulDossierPatchQueue";
import { toast } from "sonner";

type OrganisationMemberDossierNetworkSectionProps = {
  contact: Contact;
  contacts: Contact[];
  dossier: FilleulDossier;
  canEdit: boolean;
  onDossierChange: (dossier: FilleulDossier) => void;
  onParrainChange?: () => void;
  onSelectMember?: (contactId: number) => void;
};

export function OrganisationMemberDossierNetworkSection({
  contact,
  contacts,
  dossier,
  canEdit,
  onDossierChange,
  onParrainChange,
  onSelectMember,
}: OrganisationMemberDossierNetworkSectionProps) {
  const { saving, saveDossierPatch } = useFilleulDossierPatchQueue({
    contact,
    dossier,
    canEdit,
    onDossierChange,
    onCategorieChange: onParrainChange,
  });

  const exerciceVisibilityHint = useMemo(
    () => describeOrganisationExerciceVisibilityHint(contact, dossier),
    [contact, dossier]
  );

  async function handleParrainChange(parrainId: number | undefined) {
    if (!canEdit || contact.id == null) return;
    if (parrainId === contact.parrain_id) return;
    try {
      await updateContact(contact.id, {
        ...contactToUpdatePayload(contact),
        parrain_id: parrainId,
      });
      toast.success("Parrain enregistré");
      onParrainChange?.();
    } catch (error) {
      console.error(error);
      toast.error("Impossible d'enregistrer le parrain");
    }
  }

  return (
    <section className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Dossier réseau
      </h4>

      <ContactPersonSearch
        label="Parrain"
        hint="Modification depuis le module Organisation uniquement"
        placeholder="Rechercher un parrain…"
        contacts={contacts}
        excludeId={contact.id}
        value={contact.parrain_id}
        onChange={(id) => void handleParrainChange(id)}
        onOpenContact={(c) => {
          if (c.id != null) onSelectMember?.(c.id);
        }}
        badgeFn={(c) =>
          c.filleul_categorie === "FILLEUL_DESINSCRIT" ? "Désinscrit" : "Réseau"
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FilleulDossierDateField
          id="dossier-date-invitation"
          label={FILLEUL_DOSSIER_DATE_LABELS.dateInvitation}
          value={dossierDateToInput(dossier.dateInvitation)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ dateInvitation: value })}
        />
        <FilleulDossierDateField
          id="dossier-date-inscription"
          label={FILLEUL_DOSSIER_DATE_LABELS.dateInscription}
          value={dossierDateToInput(dossier.dateInscription)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ dateInscription: value })}
        />
        <FilleulDossierDateField
          id="dossier-date-imo"
          label={FILLEUL_DOSSIER_DATE_LABELS.datePremiereSouscriptionImo}
          value={dossierDateToInput(dossier.datePremiereSouscriptionImo)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ datePremiereSouscriptionImo: value })}
        />
        <FilleulDossierDateField
          id="dossier-date-placement"
          label={FILLEUL_DOSSIER_DATE_LABELS.datePremiereSouscriptionPlacement}
          value={dossierDateToInput(dossier.datePremiereSouscriptionPlacement)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ datePremiereSouscriptionPlacement: value })}
        />
        <FilleulDossierDateField
          id="dossier-date-scpi"
          label={FILLEUL_DOSSIER_DATE_LABELS.datePremiereSouscriptionScpi}
          value={dossierDateToInput(dossier.datePremiereSouscriptionScpi)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ datePremiereSouscriptionScpi: value })}
        />
        <FilleulDossierDateField
          id="dossier-date-cif"
          label={FILLEUL_DOSSIER_DATE_LABELS.dateHabilitationCif}
          value={dossierDateToInput(dossier.dateHabilitationCif)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ dateHabilitationCif: value })}
        />
        <FilleulDossierDateField
          id="dossier-date-vaa"
          label={FILLEUL_DOSSIER_DATE_LABELS.datePremierVaaOuVa}
          value={dossierDateToInput(dossier.datePremierVaaOuVa)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ datePremierVaaOuVa: value })}
        />
        <FilleulDossierDateField
          id="dossier-date-manager"
          label={FILLEUL_DOSSIER_DATE_LABELS.datePassageManager}
          value={dossierDateToInput(dossier.datePassageManager)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ datePassageManager: value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dossier-notes" className="text-xs text-muted-foreground">
          Notes dossier
        </Label>
        <Textarea
          id="dossier-notes"
          className="min-h-[72px] text-sm"
          defaultValue={dossier.notes ?? ""}
          disabled={!canEdit || saving}
          key={`notes-${dossier.updatedAt}`}
          placeholder="Notes internes réseau (hors fiche contact)"
          onBlur={(event) => {
            const next = event.target.value.trim();
            const current = (dossier.notes ?? "").trim();
            if (next === current) return;
            saveDossierPatch({ notes: event.target.value });
          }}
        />
      </div>

      <div className="space-y-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-3">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Désinscription
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Consultant retiré du réseau actif. La date passe le statut réseau à « Filleul
            désinscrit » ; l&apos;effacer repasse à « Filleul ».
          </p>
        </div>
        <FilleulDossierDateField
          id="dossier-date-desinscription"
          label={FILLEUL_DOSSIER_DATE_LABELS.dateDesinscription}
          value={dossierDateToInput(dossier.dateDesinscription)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ dateDesinscription: value })}
        />
        {exerciceVisibilityHint ? (
          <p className="text-[11px] text-amber-800/90 bg-amber-50/80 border border-amber-200/60 rounded-md px-2.5 py-2">
            {exerciceVisibilityHint}
          </p>
        ) : null}
      </div>
    </section>
  );
}
