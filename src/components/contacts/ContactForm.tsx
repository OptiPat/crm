import { useState, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createContact,
  updateContact,
  getAllContacts,
  getFilleulsByParrain,
  getContactById,
  type NewContact,
  type Contact,
} from "@/lib/api/tauri-contacts";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ContactPersonSearch } from "./ContactPersonSearch";
import {
  type ClientStatut,
  type Civilite,
  type ContactFormContext,
  type FieldErrors,
  type SituationFamiliale,
  SELECT_NONE,
  addMonthsLocal,
  buildSubmitPayload,
  contactToFormData,
  serializeFormSnapshot,
  formatPhoneFR,
  getClientLabel,
  getEmptyForm,
  getFilleulLabel,
  getFieldErrors,
  isClientActif,
  isFilleulStatut,
  todayLocal,
} from "@/lib/contacts/contact-form-utils";

export type { ContactFormContext };

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  onSuccess: () => void;
  createContext?: ContactFormContext;
  onOpenContact?: (contact: Contact) => void;
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
      {children}
    </div>
  );
}

function FieldHint({ error, hint }: { error?: string; hint?: string }) {
  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (hint) return <p className="text-xs text-muted-foreground">{hint}</p>;
  return null;
}

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
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange(todayLocal())}>
          Aujourd&apos;hui
        </Button>
        {showFollowUpShortcuts && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onChange(addMonthsLocal(3))}
          >
            +3 mois
          </Button>
        )}
      </div>
    </div>
  );
}

function ContactFormSummary({
  formData,
  contact,
  mesFilleulsCount,
  parrainContact,
}: {
  formData: NewContact;
  contact?: Contact | null;
  mesFilleulsCount: number;
  parrainContact: Contact | null;
}) {
  const clientLabel = getClientLabel(formData.categorie || "AUCUN");
  const filleulLabel = getFilleulLabel(formData.filleul_categorie);
  const displayName =
    contact?.prenom && contact?.nom
      ? `${contact.prenom} ${contact.nom}`
      : formData.prenom && formData.nom
        ? `${formData.prenom} ${formData.nom}`
        : "Nouveau contact";

  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2 space-y-2">
      <p className="font-medium text-sm">{displayName}</p>
      <div className="flex flex-wrap gap-1.5">
        {clientLabel && (
          <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
            {clientLabel}
          </Badge>
        )}
        {filleulLabel && (
          <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200">
            {filleulLabel}
          </Badge>
        )}
        {!clientLabel && !filleulLabel && (
          <Badge variant="outline" className="text-muted-foreground">
            Aucun rôle actif
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {parrainContact && (
          <>
            Parrain : {parrainContact.prenom} {parrainContact.nom}
            {" · "}
          </>
        )}
        {mesFilleulsCount > 0 && (
          <>
            Parrain de {mesFilleulsCount} filleul{mesFilleulsCount > 1 ? "s" : ""}
          </>
        )}
        {!parrainContact && mesFilleulsCount === 0 && contact && "Aucun lien réseau affiché"}
      </p>
    </div>
  );
}

export function ContactForm({
  open,
  onOpenChange,
  contact,
  onSuccess,
  createContext = "clients",
  onOpenContact,
}: ContactFormProps) {
  const isEdit = !!contact;
  const [loading, setLoading] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [mesFilleulsCount, setMesFilleulsCount] = useState(0);
  const [parrainContact, setParrainContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState<NewContact>(getEmptyForm(createContext));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [dirty, setDirty] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const initialSnapshot = useRef("");

  useEffect(() => {
    let retryCount = 0;
    const loadContacts = async () => {
      try {
        setAllContacts(await getAllContacts());
      } catch (error) {
        if (retryCount === 0 && error instanceof Error && error.message.includes("Invalid column type")) {
          retryCount++;
          setTimeout(loadContacts, 500);
        }
      }
    };
    loadContacts();
  }, []);

  useEffect(() => {
    if (!open) return;

    const data = contact ? contactToFormData(contact) : getEmptyForm(createContext);
    setFormData(data);
    initialSnapshot.current = serializeFormSnapshot(data);
    setDirty(false);
    setFieldErrors({});
    setShowAddress(!!(data.adresse || data.code_postal || data.ville));

    if (contact) {
      getFilleulsByParrain(contact.id)
        .then((f) => setMesFilleulsCount(f.length))
        .catch(() => setMesFilleulsCount(0));
    } else {
      setMesFilleulsCount(0);
    }
  }, [contact, open, createContext]);

  useEffect(() => {
    if (!open) return;
    setDirty(serializeFormSnapshot(formData) !== initialSnapshot.current);
  }, [formData, open]);

  useEffect(() => {
    if (!formData.parrain_id) {
      setParrainContact(null);
      return;
    }
    const local = allContacts.find((c) => c.id === formData.parrain_id);
    if (local) {
      setParrainContact(local);
      return;
    }
    getContactById(formData.parrain_id)
      .then(setParrainContact)
      .catch(() => setParrainContact(null));
  }, [formData.parrain_id, allContacts]);

  const handleOpenChange = (next: boolean) => {
    if (!next && dirty) {
      setShowDiscardDialog(true);
      return;
    }
    onOpenChange(next);
  };

  const confirmDiscard = () => {
    setShowDiscardDialog(false);
    setDirty(false);
    onOpenChange(false);
  };

  const handleCreateParrain = async (nom: string, prenom: string) => {
    const newParrain = await createContact({
      nom,
      prenom,
      categorie: "AUCUN",
      filleul_categorie: "FILLEUL",
    });
    setAllContacts((prev) => [...prev, newParrain]);
    setFormData((prev) => ({ ...prev, parrain_id: newParrain.id }));
        toast.success("Parrain créé");
  };

  const handleCreatePrescripteur = async (nom: string, prenom: string) => {
    const newPrescripteur = await createContact({
      nom,
      prenom,
      categorie: "PRESCRIPTEUR",
    });
    setAllContacts((prev) => [...prev, newPrescripteur]);
    setFormData((prev) => ({ ...prev, prescripteur_id: newPrescripteur.id }));
    toast.success("Prescripteur créé");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = getFieldErrors(formData);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error("Corrigez les champs en erreur");
      return;
    }
    setFieldErrors({});
    setLoading(true);

    try {
      const dataToSubmit = buildSubmitPayload(formData);
      if (contact) {
        const updated = await updateContact(contact.id, dataToSubmit);
        initialSnapshot.current = serializeFormSnapshot(contactToFormData(updated));
        toast.success("Contact modifié");
      } else {
        await createContact(dataToSubmit);
        toast.success("Contact créé");
      }
      setDirty(false);
      onSuccess();
      onOpenChange(false);
      setFormData(getEmptyForm(createContext));
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const filleulActif = isFilleulStatut(formData.filleul_categorie);
  const clientActif = isClientActif(formData.categorie);
  const isPrescripteurForm =
    createContext === "prescripteurs" || formData.categorie === "PRESCRIPTEUR";

  const setFilleulStatut = (value: string) => {
    if (value === "AUCUN") {
      setFormData((prev) => ({
        ...prev,
        filleul_categorie: undefined,
        parrain_id: undefined,
        date_dernier_contact_filleul: "",
        date_prochain_suivi_filleul: "",
      }));
    } else {
      setFormData((prev) => ({ ...prev, filleul_categorie: value }));
    }
  };

  const setClientStatut = (value: ClientStatut) => {
    if (value === "AUCUN") {
      setFormData((prev) => ({
        ...prev,
        categorie: "AUCUN",
        prescripteur_id: undefined,
        date_dernier_contact: "",
        date_prochain_suivi: "",
      }));
    } else {
      setFormData((prev) => ({ ...prev, categorie: value }));
    }
  };

  const formBody = (
    <form onSubmit={handleSubmit} className="space-y-6">
      {(isEdit || (formData.nom && formData.prenom)) && (
        <ContactFormSummary
          formData={formData}
          contact={contact}
          mesFilleulsCount={mesFilleulsCount}
          parrainContact={parrainContact}
        />
      )}

      <FormSection title="Identité">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="civilite">Civilité</Label>
            <Select
              value={formData.civilite || SELECT_NONE}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  civilite: value === SELECT_NONE ? undefined : (value as Civilite),
                }))
              }
            >
              <SelectTrigger id="civilite">
                <SelectValue placeholder="Non renseigné" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_NONE}>Non renseigné</SelectItem>
                <SelectItem value="M">Monsieur</SelectItem>
                <SelectItem value="MME">Madame</SelectItem>
                <SelectItem value="AUTRE">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="situation_familiale">Situation familiale</Label>
            <Select
              value={formData.situation_familiale || SELECT_NONE}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  situation_familiale:
                    value === SELECT_NONE ? undefined : (value as SituationFamiliale),
                }))
              }
            >
              <SelectTrigger id="situation_familiale">
                <SelectValue placeholder="Non renseigné" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_NONE}>Non renseigné</SelectItem>
                <SelectItem value="CELIBATAIRE">Célibataire</SelectItem>
                <SelectItem value="MARIE">Marié(e)</SelectItem>
                <SelectItem value="PACSE">Pacsé(e)</SelectItem>
                <SelectItem value="DIVORCE">Divorcé(e)</SelectItem>
                <SelectItem value="VEUF">Veuf(ve)</SelectItem>
                <SelectItem value="AUTRE">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="nom">Nom *</Label>
            <Input
              id="nom"
              value={formData.nom}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, nom: e.target.value }));
                if (fieldErrors.nom) setFieldErrors((prev) => ({ ...prev, nom: undefined }));
              }}
              className={fieldErrors.nom ? "border-destructive" : ""}
            />
            <FieldHint error={fieldErrors.nom} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prenom">Prénom *</Label>
            <Input
              id="prenom"
              value={formData.prenom}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, prenom: e.target.value }));
                if (fieldErrors.prenom) setFieldErrors((prev) => ({ ...prev, prenom: undefined }));
              }}
              className={fieldErrors.prenom ? "border-destructive" : ""}
            />
            <FieldHint error={fieldErrors.prenom} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="date_naissance">Date de naissance</Label>
            <Input
              id="date_naissance"
              type="date"
              value={formData.date_naissance || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, date_naissance: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profession">Profession</Label>
            <Input
              id="profession"
              value={formData.profession || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, profession: e.target.value }))}
            />
          </div>
        </div>
      </FormSection>

      <Separator />

      <FormSection title="Rôles">
        {isPrescripteurForm ? (
          <p className="text-sm text-muted-foreground rounded-md border border-purple-200 bg-purple-50/80 px-3 py-2">
            Ce contact est enregistré comme <strong>prescripteur</strong>. Assignez-le ensuite
            à vos clients depuis leur fiche (champ Prescripteur).
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Statut client</Label>
                <Select
                  value={formData.categorie || "AUCUN"}
                  onValueChange={(value) => setClientStatut(value as ClientStatut)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUCUN">Aucun (pas client)</SelectItem>
                    <SelectItem value="CLIENT">Client</SelectItem>
                    <SelectItem value="PROSPECT_CLIENT">Prospect client</SelectItem>
                    <SelectItem value="SUSPECT_CLIENT">Suspect client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Statut filleul (réseau)</Label>
                <Select
                  value={formData.filleul_categorie || "AUCUN"}
                  onValueChange={setFilleulStatut}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUCUN">Aucun (pas filleul)</SelectItem>
                    <SelectItem value="FILLEUL">Filleul</SelectItem>
                    <SelectItem value="PROSPECT_FILLEUL">Prospect filleul</SelectItem>
                    <SelectItem value="SUSPECT_FILLEUL">Suspect filleul</SelectItem>
                    <SelectItem value="FILLEUL_DESINSCRIT">Filleul désinscrit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="statut_suivi">Statut de suivi</Label>
              <Select
                value={formData.statut_suivi}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, statut_suivi: value }))}
              >
                <SelectTrigger id="statut_suivi">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIF">Actif</SelectItem>
                  <SelectItem value="EN_PAUSE">En pause</SelectItem>
                  <SelectItem value="ARCHIVE">Archivé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </FormSection>

      <Separator />

      <FormSection title="Reseau">
        {filleulActif && (
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
            onCreate={handleCreateParrain}
          />
        )}
        {contact && mesFilleulsCount > 0 && (
          <p className="text-sm text-muted-foreground rounded-md border px-3 py-2 bg-muted/20">
            Ce contact est parrain de {mesFilleulsCount} filleul
            {mesFilleulsCount > 1 ? "s" : ""}. Modifier le lien depuis la fiche de chaque filleul.
          </p>
        )}
        {!filleulActif && !mesFilleulsCount && (
          <p className="text-sm text-muted-foreground">
            Choisissez un statut filleul pour renseigner un parrain.
          </p>
        )}
      </FormSection>

      {clientActif && (
        <>
          <Separator />
          <FormSection title="Commercial">
            <ContactPersonSearch
              label="Prescripteur"
              hint="Personne qui vous a recommandé comme client CGP"
              placeholder="Rechercher un prescripteur..."
              contacts={allContacts}
              excludeId={contact?.id}
              value={formData.prescripteur_id}
              onChange={(id) => setFormData((prev) => ({ ...prev, prescripteur_id: id }))}
              onOpenContact={onOpenContact}
              badgeFn={(c) => c.categorie}
              allowCreate
              createTitle="Créer un nouveau prescripteur"
              onCreate={handleCreatePrescripteur}
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="source_lead">Source / Lead</Label>
                <Input
                  id="source_lead"
                  value={formData.source_lead || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, source_lead: e.target.value }))}
                  placeholder="Recommandation, site web..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profil_risque_sri">Profil investisseur (1-7)</Label>
                <Input
                  id="profil_risque_sri"
                  type="number"
                  min={1}
                  max={7}
                  value={formData.profil_risque_sri ?? ""}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      profil_risque_sri: e.target.value ? parseInt(e.target.value, 10) : undefined,
                    }));
                    if (fieldErrors.profil_risque_sri) {
                      setFieldErrors((prev) => ({ ...prev, profil_risque_sri: undefined }));
                    }
                  }}
                  className={fieldErrors.profil_risque_sri ? "border-destructive" : ""}
                />
                <FieldHint error={fieldErrors.profil_risque_sri} />
              </div>
            </div>
          </FormSection>
        </>
      )}

      <Separator />

      <FormSection title="Coordonnées">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email || ""}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, email: e.target.value }));
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              className={fieldErrors.email ? "border-destructive" : ""}
            />
            <FieldHint error={fieldErrors.email} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telephone">Téléphone</Label>
            <Input
              id="telephone"
              value={formData.telephone || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, telephone: e.target.value }))}
              onBlur={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  telephone: formatPhoneFR(e.target.value),
                }))
              }
              placeholder="06 12 34 56 78"
            />
          </div>
        </div>

        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setShowAddress((v) => !v)}
        >
          {showAddress ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Adresse et localisation
        </button>
        {showAddress && (
          <div className="space-y-4 pl-1">
            <div className="space-y-2">
              <Label htmlFor="adresse">Adresse</Label>
              <Input
                id="adresse"
                value={formData.adresse || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, adresse: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code_postal">Code postal</Label>
                <Input
                  id="code_postal"
                  value={formData.code_postal || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, code_postal: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ville">Ville</Label>
                <Input
                  id="ville"
                  value={formData.ville || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, ville: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )}
      </FormSection>

      {(clientActif || filleulActif) && (
        <>
          <Separator />
          <FormSection title="Suivi">
            {clientActif && (
              <div className="grid grid-cols-2 gap-4">
                <DateFieldWithShortcuts
                  id="date_dernier_contact"
                  label="Dernier contact (client)"
                  value={formData.date_dernier_contact}
                  onChange={(v) => setFormData((prev) => ({ ...prev, date_dernier_contact: v }))}
                />
                <DateFieldWithShortcuts
                  id="date_prochain_suivi"
                  label="Prochain suivi (client)"
                  value={formData.date_prochain_suivi}
                  onChange={(v) => setFormData((prev) => ({ ...prev, date_prochain_suivi: v }))}
                  showFollowUpShortcuts
                />
              </div>
            )}
            {filleulActif && (
              <div className="grid grid-cols-2 gap-4">
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
            )}
          </FormSection>
        </>
      )}

      <Separator />

      <FormSection title="Notes">
        <Textarea
          id="notes"
          value={formData.notes || ""}
          onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
          rows={3}
        />
      </FormSection>

      {isEdit ? (
        <SheetFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </SheetFooter>
      ) : (
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Enregistrement..." : "Créer"}
          </Button>
        </DialogFooter>
      )}
    </form>
  );

  const title = isEdit
    ? isPrescripteurForm
      ? "Modifier le prescripteur"
      : "Modifier le contact"
    : createContext === "prescripteurs"
      ? "Nouveau prescripteur"
      : "Nouveau contact";
  const description = isEdit
    ? "Modifiez les informations du contact."
    : createContext === "filleuls"
      ? "Création depuis l'onglet Filleuls : statut filleul par défaut."
      : createContext === "prescripteurs"
        ? "Personne qui recommande des clients. Elle apparaîtra dans l'arbre des prescripteurs."
        : "Création depuis l'onglet Clients : statut client par défaut.";

  return (
    <>
      {isEdit ? (
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
            <div className="mt-6">{formBody}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {formBody}
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifications non enregistrées</AlertDialogTitle>
            <AlertDialogDescription>
              Des changements n&apos;ont pas été sauvegardés. Voulez-vous vraiment fermer ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer l&apos;édition</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>Quitter sans enregistrer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
