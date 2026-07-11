import { useCallback, useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import {
  createContact,
  getAllContacts,
  getContactById,
  updateContact,
  type Contact,
} from "@/lib/api/tauri-contacts";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { toast } from "sonner";

interface PipeProspectionContactSectionProps {
  contactId: number;
}

export function PipeProspectionContactSection({
  contactId,
}: PipeProspectionContactSectionProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceLead, setSourceLead] = useState("");
  const [saving, setSaving] = useState(false);
  const contactRef = useRef<Contact | null>(null);

  useEffect(() => {
    contactRef.current = contact;
  }, [contact]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedContact, contacts] = await Promise.all([
        getContactById(contactId),
        getAllContacts(),
      ]);
      setContact(loadedContact);
      setSourceLead(loadedContact.source_lead ?? "");
      setAllContacts(contacts);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistContact = async (
    overrides: Parameters<typeof contactToUpdatePayload>[1]
  ) => {
    const current = contactRef.current;
    if (!current?.id) return;
    setSaving(true);
    try {
      const updated = await updateContact(
        current.id,
        contactToUpdatePayload(current, overrides)
      );
      setContact(updated);
      contactRef.current = updated;
    } catch (err) {
      toast.error(String(err));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handlePrescripteurChange = async (prescripteurId: number | undefined) => {
    try {
      await persistContact({ prescripteur_id: prescripteurId ?? undefined });
      toast.success("Prescripteur enregistré sur la fiche contact");
    } catch {
      /* toast déjà affiché */
    }
  };

  const handleCreatePrescripteur = async (nom: string, prenom: string) => {
    try {
      const newPrescripteur = await createContact({
        nom,
        prenom,
        categorie: "PRESCRIPTEUR",
      });
      setAllContacts((prev) => [...prev, newPrescripteur]);
      await persistContact({ prescripteur_id: newPrescripteur.id });
      toast.success("Prescripteur créé et enregistré");
    } catch {
      /* toast déjà affiché par persistContact */
    }
  };

  const handleSourceLeadBlur = async () => {
    const current = contactRef.current;
    if (!current) return;
    const trimmed = sourceLead.trim();
    const previous = (current.source_lead ?? "").trim();
    if (trimmed === previous) return;
    try {
      await persistContact({ source_lead: trimmed || undefined });
      toast.success("Source enregistrée sur la fiche contact");
    } catch {
      setSourceLead(current.source_lead ?? "");
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Chargement de la fiche contact…</p>
    );
  }

  if (!contact) {
    return (
      <p className="text-sm text-destructive">Contact introuvable.</p>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/10 p-4 space-y-4">
      <ContactPersonSearch
        label="Prescripteur"
        hint="Personne qui vous a recommandé comme client CGP"
        placeholder="Rechercher un prescripteur..."
        contacts={allContacts}
        excludeId={contact.id}
        value={contact.prescripteur_id}
        onChange={(id) => void handlePrescripteurChange(id)}
        badgeFn={(c) => c.categorie}
        allowCreate
        createTitle="Créer un nouveau prescripteur"
        onCreate={handleCreatePrescripteur}
      />

      <div className="space-y-2">
        <Label htmlFor="pipe-source-lead">Source / Lead</Label>
        <Input
          id="pipe-source-lead"
          value={sourceLead}
          onChange={(e) => setSourceLead(e.target.value)}
          onBlur={() => void handleSourceLeadBlur()}
          placeholder="Recommandation, site web…"
          disabled={saving}
        />
        <p className="text-xs text-muted-foreground">Cf. fiche contact</p>
      </div>
    </div>
  );
}
