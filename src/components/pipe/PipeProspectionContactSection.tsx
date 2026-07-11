import { useCallback, useEffect, useRef, useState } from "react";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import { Input } from "@/components/ui/input";
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
      toast.success("Prescripteur enregistré");
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
      toast.success("Prescripteur créé");
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
      toast.success("Source enregistrée");
    } catch {
      setSourceLead(current.source_lead ?? "");
    }
  };

  if (loading) {
    return <p className="text-xs text-muted-foreground">Chargement…</p>;
  }

  if (!contact) {
    return <p className="text-xs text-destructive">Contact introuvable.</p>;
  }

  return (
    <div className="rounded-md border bg-muted/10 px-3 py-2.5">
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">Prescripteur</p>
          <ContactPersonSearch
            placeholder="Rechercher…"
            contacts={allContacts}
            excludeId={contact.id}
            value={contact.prescripteur_id}
            onChange={(id) => void handlePrescripteurChange(id)}
            badgeFn={(c) => c.categorie}
            allowCreate
            createTitle="Nouveau prescripteur"
            onCreate={handleCreatePrescripteur}
          />
        </div>

        <div className="space-y-1 min-w-0">
          <label htmlFor="pipe-source-lead" className="text-[11px] font-medium text-muted-foreground">
            Source
          </label>
          <Input
            id="pipe-source-lead"
            value={sourceLead}
            onChange={(e) => setSourceLead(e.target.value)}
            onBlur={() => void handleSourceLeadBlur()}
            placeholder="Recommandation…"
            disabled={saving}
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
