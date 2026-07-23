import { useCallback, useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { upsertFilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { updateContact } from "@/lib/api/tauri-contacts";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import {
  buildUpsertFilleulDossierInput,
  dossierDateToInput,
} from "@/lib/organisation/organisation-filleul-dossier";
import { FILLEUL_DOSSIER_DATE_LABELS } from "@/lib/organisation/organisation-filleul-dossier-labels";
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

type DossierPatch = Parameters<typeof buildUpsertFilleulDossierInput>[1];

function DossierDateField({
  id,
  label,
  value,
  disabled,
  onSave,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onSave: (value: string) => void | Promise<void>;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        className="h-9"
        defaultValue={value}
        disabled={disabled}
        key={`${id}-${value}`}
        onBlur={(event) => {
          if (event.target.value === value) return;
          void onSave(event.target.value);
        }}
      />
    </div>
  );
}

export function OrganisationMemberDossierNetworkSection({
  contact,
  contacts,
  dossier,
  canEdit,
  onDossierChange,
  onParrainChange,
  onSelectMember,
}: OrganisationMemberDossierNetworkSectionProps) {
  const [saving, setSaving] = useState(false);
  const dossierRef = useRef(dossier);
  const queueRef = useRef<DossierPatch[]>([]);
  const processingRef = useRef(false);

  useEffect(() => {
    dossierRef.current = dossier;
  }, [dossier]);

  const processSaveQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setSaving(true);
    try {
      while (queueRef.current.length > 0) {
        const patch = queueRef.current.shift()!;
        const saved = await upsertFilleulDossier(
          buildUpsertFilleulDossierInput(dossierRef.current, patch)
        );
        dossierRef.current = saved;
        onDossierChange(saved);
      }
    } catch (error) {
      console.error(error);
      toast.error("Impossible d'enregistrer le dossier réseau");
      queueRef.current = [];
      throw error;
    } finally {
      processingRef.current = false;
      setSaving(false);
      if (queueRef.current.length > 0) {
        void processSaveQueue();
      }
    }
  }, [onDossierChange]);

  const saveDossierPatch = useCallback(
    (patch: DossierPatch) => {
      if (!canEdit) return;
      queueRef.current.push(patch);
      void processSaveQueue();
    },
    [canEdit, processSaveQueue]
  );

  const handleParrainChange = useCallback(
    async (parrainId: number | undefined) => {
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
    },
    [canEdit, contact, onParrainChange]
  );

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
        <DossierDateField
          id="dossier-date-invitation"
          label={FILLEUL_DOSSIER_DATE_LABELS.dateInvitation}
          value={dossierDateToInput(dossier.dateInvitation)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ dateInvitation: value })}
        />
        <DossierDateField
          id="dossier-date-inscription"
          label={FILLEUL_DOSSIER_DATE_LABELS.dateInscription}
          value={dossierDateToInput(dossier.dateInscription)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ dateInscription: value })}
        />
        <DossierDateField
          id="dossier-date-imo"
          label={FILLEUL_DOSSIER_DATE_LABELS.datePremiereSouscriptionImo}
          value={dossierDateToInput(dossier.datePremiereSouscriptionImo)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ datePremiereSouscriptionImo: value })}
        />
        <DossierDateField
          id="dossier-date-placement"
          label={FILLEUL_DOSSIER_DATE_LABELS.datePremiereSouscriptionPlacement}
          value={dossierDateToInput(dossier.datePremiereSouscriptionPlacement)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ datePremiereSouscriptionPlacement: value })}
        />
        <DossierDateField
          id="dossier-date-scpi"
          label={FILLEUL_DOSSIER_DATE_LABELS.datePremiereSouscriptionScpi}
          value={dossierDateToInput(dossier.datePremiereSouscriptionScpi)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ datePremiereSouscriptionScpi: value })}
        />
        <DossierDateField
          id="dossier-date-cif"
          label={FILLEUL_DOSSIER_DATE_LABELS.dateHabilitationCif}
          value={dossierDateToInput(dossier.dateHabilitationCif)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ dateHabilitationCif: value })}
        />
        <DossierDateField
          id="dossier-date-vaa"
          label={FILLEUL_DOSSIER_DATE_LABELS.datePremierVaaOuVa}
          value={dossierDateToInput(dossier.datePremierVaaOuVa)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ datePremierVaaOuVa: value })}
        />
        <DossierDateField
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
            Consultant retiré du réseau actif.
          </p>
        </div>
        <DossierDateField
          id="dossier-date-desinscription"
          label={FILLEUL_DOSSIER_DATE_LABELS.dateDesinscription}
          value={dossierDateToInput(dossier.dateDesinscription)}
          disabled={!canEdit || saving}
          onSave={(value) => saveDossierPatch({ dateDesinscription: value })}
        />
      </div>
    </section>
  );
}
