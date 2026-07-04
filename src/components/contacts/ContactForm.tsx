import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
  updateContactFiscal,
  getAllContacts,
  getFilleulsByParrain,
  getContactById,
  getContactsByFoyer,
  type NewContact,
  type Contact,
} from "@/lib/api/tauri-contacts";
import { getFoyerById, updateFoyer, type Foyer } from "@/lib/api/tauri-foyers";
import {
  hasAnyFiscal,
  pickFiscal,
  propagateFiscalToFoyerMembers,
  resolveContactFiscal,
} from "@/lib/foyers/foyer-fiscal-sync";
import { ContactFoyerRelationsBlock, type ContactFoyerRelationsActions } from "@/components/contacts/ContactFoyerRelationsBlock";
import { ContactFormParrainageSection } from "@/components/contacts/ContactFormParrainageSection";
import { FilleulRankFormFields } from "@/components/organisation/FilleulRankFormFields";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeFoyersChanged } from "@/lib/foyers/foyer-events";
import {
  ContactFormInvestissementSection,
  type InvestissementFormChoice,
} from "@/components/contacts/ContactFormInvestissementSection";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ContactPersonSearch } from "./ContactPersonSearch";
import {
  formatSriWithDefinition,
  PROFIL_RISQUE_MAX,
  PROFIL_RISQUE_SRI_FIELD_LABEL,
} from "@/lib/contacts/investisseur-sri";
import {
  type ClientStatut,
  type Civilite,
  type ContactFormContext,
  type FieldErrors,
  type SituationFamiliale,
  SELECT_NONE,
  buildSubmitPayload,
  parseBirthdayFieldToIso,
  parseDateInscriptionFromNotes,
  setDateInscriptionInNotes,
  contactToFormData,
  dateFieldToIso,
  defaultProchainSuiviClient,
  defaultProchainSuiviForClientStatut,
  defaultProchainSuiviSixMois,
  mergeParrainageVolumeInputsFromDom,
  serializeFormSnapshot,
  formatPhoneInput,
  applyFoyerAddressIfEmpty,
  isContactAddressEmpty,
  sanitizePhoneInput,
  getClientLabel,
  getEmptyForm,
  getFilleulLabel,
  getFieldErrors,
  isClientActif,
  isFilleulStatut,
  isFilleulReseauInscrit,
  isPrescripteurCategorie,
  toDateInput,
  todayLocal,
} from "@/lib/contacts/contact-form-utils";
import {
  CONTACT_FORM_SECTIONS,
  CONTACT_FORM_SECTION_META,
  CONTACT_FORM_SECTION_ICON_CLASS,
  CONTACT_FORM_EDIT_SECTION_KEYS,
  CONTACT_FORM_PRESCRIPTEUR_SECTION_KEYS,
  type ContactFormSectionId,
  type ContactFormSectionKey,
} from "@/lib/contacts/contact-form-sections";
import type { LucideIcon } from "lucide-react";

export type { ContactFormContext, ContactFormSectionId, ContactFormSectionKey };

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  onSuccess?: () => void;
  /** Après création uniquement (pas édition). */
  onCreated?: (
    contact: Contact,
    options: { addInvestissement: boolean }
  ) => void;
  createContext?: ContactFormContext;
  /** Préremplit le champ prescripteur à la création (page Prescripteurs). */
  defaultPrescripteurId?: number;
  onOpenContact?: (contact: Contact) => void;
  /** Scroll vers une section à l'ouverture (depuis Synthèse). */
  initialSectionId?: ContactFormSectionId | null;
  /** Raccourcis foyer (fiche contact uniquement). */
  foyerActions?: ContactFoyerRelationsActions;
}

function FormSection({
  sectionKey,
  title,
  children,
}: {
  sectionKey?: ContactFormSectionKey;
  /** Section hors métadonnées partagées (ex. Patrimoine à la création). */
  title?: string;
  children: ReactNode;
}) {
  if (sectionKey) {
    const meta = CONTACT_FORM_SECTION_META[sectionKey];
    const Icon = meta.icon;
    return (
      <div id={CONTACT_FORM_SECTIONS[sectionKey]} className="space-y-3 scroll-mt-20">
        <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className={CONTACT_FORM_SECTION_ICON_CLASS} aria-hidden />
          {meta.label}
        </h3>
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-3 scroll-mt-20">
      <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ContactFormSectionNav({
  sections,
}: {
  sections: readonly { id: string; label: string; icon: LucideIcon }[];
}) {
  return (
    <nav
      aria-label="Sections du formulaire"
      className="sticky top-0 z-10 -mx-1 mb-1 flex flex-wrap gap-1 border-b border-border/80 bg-background/95 pb-2 backdrop-blur-sm"
    >
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <Button
            key={section.id}
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() =>
              document
                .getElementById(section.id)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {section.label}
          </Button>
        );
      })}
    </nav>
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
  followUpMonths,
}: {
  id: string;
  label: string;
  value?: string;
  onChange: (v: string) => void;
  showFollowUpShortcuts?: boolean;
  /** Mois ajoutés par le raccourci prochain suivi (6 ou 12). */
  followUpMonths?: 6 | 12;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} />
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange(todayLocal())}>
          Aujourd&apos;hui
        </Button>
        {showFollowUpShortcuts && followUpMonths && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              onChange(
                followUpMonths === 12
                  ? defaultProchainSuiviClient()
                  : defaultProchainSuiviSixMois()
              )
            }
          >
            {followUpMonths === 12 ? "+1 an" : "+6 mois"}
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
  prescripteurContact,
}: {
  formData: NewContact;
  contact?: Contact | null;
  mesFilleulsCount: number;
  parrainContact: Contact | null;
  prescripteurContact?: Contact | null;
}) {
  const clientLabel = getClientLabel(formData.categorie || "AUCUN");
  const prescripteurRole = isPrescripteurCategorie(formData.categorie);
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
          <Badge
            variant="outline"
            className={
              prescripteurRole
                ? "bg-purple-50 text-purple-800 border-purple-200"
                : "bg-green-50 text-green-800 border-green-200"
            }
          >
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
        {prescripteurContact && (
          <>
            Prescripteur : {prescripteurContact.prenom} {prescripteurContact.nom}
            {" · "}
          </>
        )}
        {mesFilleulsCount > 0 && (
          <>
            Parrain de {mesFilleulsCount} filleul{mesFilleulsCount > 1 ? "s" : ""}
          </>
        )}
        {!parrainContact && !prescripteurContact && mesFilleulsCount === 0 && contact && (
          "Aucun lien réseau affiché"
        )}
      </p>
    </div>
  );
}

export function ContactForm({
  open,
  onOpenChange,
  contact,
  onSuccess,
  onCreated,
  createContext = "clients",
  defaultPrescripteurId,
  onOpenContact,
  initialSectionId,
  foyerActions,
}: ContactFormProps) {
  const isEdit = !!contact;
  const [loading, setLoading] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [mesFilleulsCount, setMesFilleulsCount] = useState(0);
  const [parrainContact, setParrainContact] = useState<Contact | null>(null);
  const [prescripteurContact, setPrescripteurContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState<NewContact>(getEmptyForm(createContext));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [dirty, setDirty] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const [addressFromFoyer, setAddressFromFoyer] = useState(false);
  const foyerAddressAppliedRef = useRef(false);
  const [investissementChoice, setInvestissementChoice] =
    useState<InvestissementFormChoice>({ addAfterCreate: false });
  const [foyerContext, setFoyerContext] = useState<{
    foyer: Foyer | null;
    members: Contact[];
    loading: boolean;
  }>({ foyer: null, members: [], loading: false });
  // Fiscalité éditée depuis la fiche contact mais stockée sur le foyer (source unique).
  const [foyerFiscal, setFoyerFiscal] = useState<{
    tranche_imposition?: string;
    revenu_fiscal_reference?: number;
    ir_net_a_payer?: number;
    nombre_parts_fiscales?: number;
  }>({});
  // Id du foyer dont la fiscalité a déjà initialisé `foyerFiscal` : évite qu'un
  // rechargement (événement contacts/foyers) n'écrase une saisie en cours.
  const foyerFiscalInitRef = useRef<number | null>(null);
  const initialSnapshot = useRef("");
  // Référence de la fiscalité foyer à l'init : sert au calcul de `dirty`
  // (une modif fiscalité seule ne touche pas `formData`).
  const initialFoyerFiscalSnapshot = useRef("{}");

  useEffect(() => {
    let retryCount = 0;
    let cancelled = false;
    const loadContacts = async () => {
      try {
        const contacts = await getAllContacts();
        if (!cancelled) setAllContacts(contacts);
      } catch (error) {
        if (retryCount === 0 && error instanceof Error && error.message.includes("Invalid column type")) {
          retryCount++;
          setTimeout(loadContacts, 500);
        }
      }
    };
    void loadContacts();
    const unsub = subscribeContactsChanged(() => {
      void loadContacts();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      foyerAddressAppliedRef.current = false;
      setAddressFromFoyer(false);
      return;
    }

    let data = contact ? contactToFormData(contact) : getEmptyForm(createContext);
    if (!contact && defaultPrescripteurId) {
      data = { ...data, prescripteur_id: defaultPrescripteurId };
    }
    setFormData(data);
    initialSnapshot.current = serializeFormSnapshot(data);
    setDirty(false);
    setFieldErrors({});
    setShowAddress(!!(data.adresse || data.code_postal || data.ville || data.pays));
    setAddressFromFoyer(false);
    setInvestissementChoice({ addAfterCreate: false });
    foyerAddressAppliedRef.current = false;

    if (contact) {
      getFilleulsByParrain(contact.id)
        .then((f) => setMesFilleulsCount(f.length))
        .catch(() => setMesFilleulsCount(0));
    } else {
      setMesFilleulsCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- (ré)initialise le formulaire à l'ouverture / changement d'id, pas pendant la saisie
  }, [open, contact?.id, createContext, defaultPrescripteurId]);

  useEffect(() => {
    if (!open || !contact?.foyer_id) {
      setFoyerContext({ foyer: null, members: [], loading: false });
      // Personne seule (sans foyer) : la fiscalité éditable vient directement de
      // la fiche contact (aucun foyer n'est créé pour la stocker).
      const own = open && contact ? pickFiscal(contact) : {};
      setFoyerFiscal(own);
      foyerFiscalInitRef.current = null;
      initialFoyerFiscalSnapshot.current = JSON.stringify(own);
      return;
    }

    let cancelled = false;
    const loadFoyerContext = async () => {
      setFoyerContext((prev) => ({ ...prev, loading: true }));
      // Le foyer est critique (fiscalité) : on le charge en priorité. Les membres
      // sont best-effort — une erreur dessus ne doit pas masquer la fiscalité.
      let foyer: Foyer | null = null;
      try {
        foyer = await getFoyerById(contact.foyer_id!);
      } catch {
        foyer = null;
      }
      if (cancelled) return;

      let members: Contact[] = [];
      try {
        members = await getContactsByFoyer(contact.foyer_id!);
      } catch {
        members = [];
      }
      if (cancelled) return;

      setFoyerContext({
        foyer,
        members: members.filter((m) => m.id !== contact.id),
        loading: false,
      });
      // Initialise la fiscalité éditable UNE fois par foyer chargé : les
      // rechargements ne doivent ni écraser une saisie en cours, ni l'effacer
      // si le foyer n'a pas pu être relu (foyer === null).
      if (foyer && foyerFiscalInitRef.current !== foyer.id) {
        foyerFiscalInitRef.current = foyer.id;
        // Foyer = source de vérité ; fallback contact si champ foyer vide.
        const initialFiscal = resolveContactFiscal(contact, foyer);
        setFoyerFiscal(initialFiscal);
        initialFoyerFiscalSnapshot.current = JSON.stringify(initialFiscal);
      }
    };

    void loadFoyerContext();
    const reload = () => void loadFoyerContext();
    const unsubContacts = subscribeContactsChanged(reload);
    const unsubFoyers = subscribeFoyersChanged(reload);
    return () => {
      cancelled = true;
      unsubContacts();
      unsubFoyers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recharge à l'ouverture / changement de foyer
  }, [open, contact?.foyer_id, contact?.id]);

  useEffect(() => {
    if (!open || !initialSectionId) return;
    if (initialSectionId === CONTACT_FORM_SECTIONS.coordonnees) {
      setShowAddress(true);
    }
    const timer = window.setTimeout(() => {
      document
        .getElementById(initialSectionId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [open, initialSectionId, contact?.id]);

  useEffect(() => {
    if (!open || foyerAddressAppliedRef.current) return;
    if (!formData.foyer_id || !isContactAddressEmpty(formData)) return;

    const result = applyFoyerAddressIfEmpty(formData, allContacts, contact?.id);
    if (!result.fromFoyer) return;

    foyerAddressAppliedRef.current = true;
    setFormData(result.formData);
    initialSnapshot.current = serializeFormSnapshot(result.formData);
    setShowAddress(true);
    setAddressFromFoyer(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remplissage ponctuel si adresse vide + foyer connu
  }, [
    open,
    allContacts,
    contact?.id,
    formData.foyer_id,
    formData.adresse,
    formData.code_postal,
    formData.ville,
    formData.pays,
  ]);

  useEffect(() => {
    if (!open) return;
    const formChanged =
      serializeFormSnapshot(formData) !== initialSnapshot.current;
    const fiscalChanged =
      JSON.stringify(foyerFiscal) !== initialFoyerFiscalSnapshot.current;
    setDirty(formChanged || fiscalChanged);
  }, [formData, foyerFiscal, open]);

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

  useEffect(() => {
    if (!formData.prescripteur_id) {
      setPrescripteurContact(null);
      return;
    }
    const local = allContacts.find((c) => c.id === formData.prescripteur_id);
    if (local) {
      setPrescripteurContact(local);
      return;
    }
    getContactById(formData.prescripteur_id)
      .then(setPrescripteurContact)
      .catch(() => setPrescripteurContact(null));
  }, [formData.prescripteur_id, allContacts]);

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

  /**
   * Sauvegarde la fiscalité (foyer) saisie dans la fiche contact.
   * La donnée vit sur le foyer (source unique, partagée par le couple) :
   * - foyer chargé dans le formulaire → on écrit l'état édité tel quel
   *   (les champs vidés effacent bien la valeur) ;
   * - pas de foyer mais une valeur saisie → on crée/rattache un foyer ;
   * - foyer existant mais NON chargé (erreur réseau) → on n'écrit rien pour
   *   ne pas écraser une fiscalité qu'on n'a pas pu lire.
   */
  const persistFoyerFiscal = async (savedContact: Contact): Promise<void> => {
    const fiscalChanged =
      JSON.stringify(pickFiscal(foyerFiscal)) !== initialFoyerFiscalSnapshot.current;
    if (!fiscalChanged) return;

    const fiscal = pickFiscal(foyerFiscal);

    // Cas 1 : foyer chargé → on persiste sur le foyer ET on synchronise tous
    // les membres (chaque fiche contact reçoit la même fiscalité).
    if (foyerContext.foyer) {
      const foyer = foyerContext.foyer;
      await updateFoyer(foyer.id, {
        nom: foyer.nom,
        type_foyer: foyer.type_foyer,
        nombre_parts_fiscales: fiscal.nombre_parts_fiscales,
        tranche_imposition: fiscal.tranche_imposition,
        revenu_fiscal_reference: fiscal.revenu_fiscal_reference,
        ir_net_a_payer: fiscal.ir_net_a_payer,
        situation_patrimoniale: foyer.situation_patrimoniale,
        objectifs_patrimoniaux: foyer.objectifs_patrimoniaux,
        notes: foyer.notes,
      });
      await propagateFiscalToFoyerMembers(foyer.id, fiscal);
      return;
    }

    // Cas 2 : foyer existant mais non chargé (erreur réseau) → ne rien écraser.
    if (savedContact.foyer_id) return;

    // Cas 3 : personne seule sans foyer → la fiscalité reste sur la FICHE CONTACT
    // (on ne crée plus de foyer « célibataire »). On évite une écriture inutile
    // si rien n'était renseigné avant et que rien n'est saisi.
    if (!hasAnyFiscal(fiscal) && !hasAnyFiscal(contact ?? undefined)) return;
    await updateContactFiscal(savedContact.id, fiscal);
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
      const birthdayRaw = formData.date_naissance?.trim() ?? "";
      if (birthdayRaw && !parseBirthdayFieldToIso(birthdayRaw)) {
        toast.error("Date de naissance invalide (utilisez le calendrier ou jj/mm/aaaa).");
        setLoading(false);
        return;
      }
      const payloadForm = filleulReseauInscrit
        ? mergeParrainageVolumeInputsFromDom(formData)
        : formData;
      const dataToSubmit = buildSubmitPayload(payloadForm, { alwaysSendBirthday: true });
      if (contact) {
        const updated = await updateContact(contact.id, dataToSubmit);
        // Le contact est déjà enregistré : un échec de la fiscalité (foyer) ne
        // doit pas être présenté comme un échec total. On garde le formulaire
        // ouvert pour réessayer la seule partie fiscalité.
        try {
          await persistFoyerFiscal(updated);
        } catch (fiscalError) {
          toast.error(
            "Contact enregistré, mais la fiscalité du foyer n'a pas pu être sauvegardée : " +
              String(fiscalError)
          );
          return;
        }
        initialSnapshot.current = serializeFormSnapshot(contactToFormData(updated));
        initialFoyerFiscalSnapshot.current = JSON.stringify(foyerFiscal);
        toast.success("Contact modifié");
      } else {
        const created = await createContact(dataToSubmit);
        toast.success("Contact créé");
        onCreated?.(created, {
          addInvestissement: investissementChoice.addAfterCreate,
        });
      }
      setDirty(false);
      onSuccess?.();
      onOpenChange(false);
      setFormData(getEmptyForm(createContext));
      setInvestissementChoice({ addAfterCreate: false });
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const filleulActif = isFilleulStatut(formData.filleul_categorie);
  const filleulReseauInscrit = isFilleulReseauInscrit(formData.filleul_categorie);
  const clientActif = isClientActif(formData.categorie);
  const isClientStatut = formData.categorie === "CLIENT";
  const isPrescripteurForm = createContext === "prescripteurs" && !isEdit;

  const editSections = useMemo(() => {
    const baseKeys = isPrescripteurForm
      ? CONTACT_FORM_PRESCRIPTEUR_SECTION_KEYS
      : CONTACT_FORM_EDIT_SECTION_KEYS;
    const keys: ContactFormSectionKey[] = [];
    for (const key of baseKeys) {
      keys.push(key);
      if (filleulReseauInscrit && key === "roles") {
        keys.push("parrainage");
      }
    }
    return keys.map((key) => ({
      id: CONTACT_FORM_SECTIONS[key],
      label: CONTACT_FORM_SECTION_META[key].navLabel,
      icon: CONTACT_FORM_SECTION_META[key].icon,
    }));
  }, [isPrescripteurForm, filleulReseauInscrit]);

  const setFilleulStatut = (value: string) => {
    if (value === "AUCUN") {
      setFormData((prev) => ({
        ...prev,
        filleul_categorie: undefined,
        parrain_id: undefined,
        date_dernier_contact_filleul: "",
        date_prochain_suivi_filleul: "",
        type_invitation_filleul: undefined,
        date_invitation_filleul: "",
        presence_invitation_filleul: undefined,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        filleul_categorie: value,
        date_prochain_suivi_filleul:
          prev.date_prochain_suivi_filleul || defaultProchainSuiviSixMois(),
      }));
    }
  };

  const setClientStatut = (value: ClientStatut | "PRESCRIPTEUR") => {
    if (value === "PRESCRIPTEUR") {
      setFormData((prev) => ({
        ...prev,
        categorie: "PRESCRIPTEUR",
        prescripteur_id: undefined,
        date_dernier_contact: "",
        date_prochain_suivi: "",
        date_r1: "",
      }));
    } else if (value === "AUCUN") {
      setFormData((prev) => ({
        ...prev,
        categorie: "AUCUN",
        prescripteur_id: undefined,
        date_dernier_contact: "",
        date_prochain_suivi: "",
        date_r1: "",
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        categorie: value,
        date_prochain_suivi:
          prev.date_prochain_suivi || defaultProchainSuiviForClientStatut(value),
      }));
    }
  };

  const formFields = (
    <>
      {!isPrescripteurForm && <ContactFormSectionNav sections={editSections} />}

      {(isEdit || (formData.nom && formData.prenom)) && (
        <ContactFormSummary
          formData={formData}
          contact={contact}
          mesFilleulsCount={mesFilleulsCount}
          parrainContact={parrainContact}
          prescripteurContact={prescripteurContact}
        />
      )}

      <FormSection sectionKey="identite">
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
                <SelectItem value="UNION_LIBRE">Union libre</SelectItem>
                <SelectItem value="DIVORCE">Divorcé(e)</SelectItem>
                <SelectItem value="VEUF">Veuf(ve)</SelectItem>
                <SelectItem value="AUTRE">Autre</SelectItem>
              </SelectContent>
            </Select>
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
            <Label htmlFor="lieu_naissance">Lieu de naissance</Label>
            <Input
              id="lieu_naissance"
              value={formData.lieu_naissance || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, lieu_naissance: e.target.value }))}
              placeholder="Ex. Montpellier"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="regime_matrimonial">Régime matrimonial</Label>
          <Input
            id="regime_matrimonial"
            value={formData.regime_matrimonial || ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, regime_matrimonial: e.target.value }))
            }
            placeholder="Ex. Communauté réduite aux acquêts"
          />
        </div>
      </FormSection>

      <Separator />

      <FormSection sectionKey="coordonnees">
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
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  telephone: sanitizePhoneInput(e.target.value),
                }))
              }
              onBlur={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  telephone: formatPhoneInput(e.target.value),
                }))
              }
              placeholder="06 12 34 56 78 ou +33 6 12 34 56 78"
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
            {addressFromFoyer && (
              <p className="text-xs text-muted-foreground rounded-md border border-sky-200 bg-sky-50/80 px-3 py-2">
                Adresse reprise d&apos;un autre membre du même foyer.
              </p>
            )}
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
            <div className="space-y-2">
              <Label htmlFor="pays">Pays</Label>
              <Input
                id="pays"
                value={formData.pays || ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, pays: e.target.value }))}
                placeholder="France"
              />
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="registre">Registre (emails)</Label>
          <Select
            value={formData.registre === "TU" ? "TU" : "VOUS"}
            onValueChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                registre: value as "TU" | "VOUS",
              }))
            }
          >
            <SelectTrigger id="registre">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="VOUS">Vouvoiement</SelectItem>
              <SelectItem value="TU">Tutoiement</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Choix du modèle lié (tu) lors des campagnes email.
          </p>
        </div>
      </FormSection>

      <Separator />

      <FormSection sectionKey="viePro">
        <div className="space-y-2">
          <Label htmlFor="profession">Profession</Label>
          <Input
            id="profession"
            value={formData.profession || ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, profession: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="revenus_annuels">Revenus annuels (€)</Label>
            <Input
              id="revenus_annuels"
              type="number"
              min={0}
              step={1}
              value={formData.revenus_annuels ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  revenus_annuels: e.target.value ? parseFloat(e.target.value) : undefined,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="charges_emprunts">Charges d&apos;emprunts (€/an)</Label>
            <Input
              id="charges_emprunts"
              type="number"
              min={0}
              step={1}
              value={formData.charges_emprunts ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  charges_emprunts: e.target.value ? parseFloat(e.target.value) : undefined,
                }))
              }
            />
          </div>
          {isEdit && (foyerContext.foyer || !contact?.foyer_id) && (
            <>
              <div className="space-y-2">
                <Label htmlFor="foyer_tranche_imposition">
                  TMI{foyerContext.foyer ? " (foyer)" : ""}
                </Label>
                <Input
                  id="foyer_tranche_imposition"
                  value={foyerFiscal.tranche_imposition ?? ""}
                  placeholder="Ex : 30 %"
                  onChange={(e) =>
                    setFoyerFiscal((prev) => ({
                      ...prev,
                      tranche_imposition: e.target.value || undefined,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="foyer_nombre_parts">
                  Nombre de parts fiscales{foyerContext.foyer ? " (foyer)" : ""}
                </Label>
                <Input
                  id="foyer_nombre_parts"
                  type="number"
                  min={0}
                  step={0.5}
                  value={foyerFiscal.nombre_parts_fiscales ?? ""}
                  onChange={(e) =>
                    setFoyerFiscal((prev) => ({
                      ...prev,
                      nombre_parts_fiscales: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="foyer_rbg">
                  Revenu brut global (€){foyerContext.foyer ? " — foyer" : ""}
                </Label>
                <Input
                  id="foyer_rbg"
                  type="number"
                  min={0}
                  step={1}
                  value={foyerFiscal.revenu_fiscal_reference ?? ""}
                  onChange={(e) =>
                    setFoyerFiscal((prev) => ({
                      ...prev,
                      revenu_fiscal_reference: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="foyer_ir_net">
                  IR net à payer (€){foyerContext.foyer ? " — foyer" : ""}
                </Label>
                <Input
                  id="foyer_ir_net"
                  type="number"
                  min={0}
                  step={1}
                  value={foyerFiscal.ir_net_a_payer ?? ""}
                  onChange={(e) =>
                    setFoyerFiscal((prev) => ({
                      ...prev,
                      ir_net_a_payer: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    }))
                  }
                />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="epargne_precaution_souhaitee">
              Épargne de précaution souhaitée (€)
            </Label>
            <Input
              id="epargne_precaution_souhaitee"
              type="number"
              min={0}
              step={1}
              value={formData.epargne_precaution_souhaitee ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  epargne_precaution_souhaitee: e.target.value
                    ? parseFloat(e.target.value)
                    : undefined,
                }))
              }
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="objectifs_patrimoniaux">Objectifs patrimoniaux</Label>
          <Textarea
            id="objectifs_patrimoniaux"
            value={formData.objectifs_patrimoniaux || ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, objectifs_patrimoniaux: e.target.value }))
            }
            rows={3}
            placeholder="Ex. Préparer la retraite ; Accompagner les enfants"
          />
        </div>
        {clientActif && (
          <div className="space-y-2">
            <Label htmlFor="profil_risque_sri">{PROFIL_RISQUE_SRI_FIELD_LABEL}</Label>
            <Input
              id="profil_risque_sri"
              type="number"
              min={1}
              max={PROFIL_RISQUE_MAX}
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
            {formData.profil_risque_sri != null && formatSriWithDefinition(formData.profil_risque_sri) && (
              <p className="text-xs text-muted-foreground">
                {formatSriWithDefinition(formData.profil_risque_sri)}
              </p>
            )}
          </div>
        )}
      </FormSection>

      <Separator />

      <FormSection sectionKey="roles">
        {isPrescripteurForm ? (
          <p className="text-sm text-muted-foreground rounded-md border border-purple-200 bg-purple-50/80 px-3 py-2">
            Ce contact est enregistré comme <strong>prescripteur</strong>. Assignez-le ensuite
            à vos clients depuis leur fiche (champ Prescripteur).
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Statut client</Label>
                <Select
                  value={formData.categorie || "AUCUN"}
                  onValueChange={(value) =>
                    setClientStatut(value as ClientStatut | "PRESCRIPTEUR")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUCUN">Aucun (pas client)</SelectItem>
                    <SelectItem value="CLIENT">Client</SelectItem>
                    <SelectItem value="PROSPECT_CLIENT">Prospect client</SelectItem>
                    <SelectItem value="SUSPECT_CLIENT">Suspect client</SelectItem>
                    {isEdit && (
                      <SelectItem value="PRESCRIPTEUR">Prescripteur</SelectItem>
                    )}
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
            {clientActif && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <DateFieldWithShortcuts
                    id="date_r1"
                    label="Premier RDV (R1)"
                    value={formData.date_r1 ?? ""}
                    onChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        date_r1: v,
                        categorie:
                          v &&
                          (prev.categorie === "AUCUN" || prev.categorie === "SUSPECT_CLIENT")
                            ? "PROSPECT_CLIENT"
                            : prev.categorie,
                      }))
                    }
                  />
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
                    followUpMonths={formData.categorie === "CLIENT" ? 12 : 6}
                  />
                </div>
              </>
            )}
            {filleulActif && !filleulReseauInscrit && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <DateFieldWithShortcuts
                    id="date_invitation_filleul"
                    label="Date d'invitation"
                    value={formData.date_invitation_filleul ?? ""}
                    onChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        date_invitation_filleul: v,
                        filleul_categorie:
                          v &&
                          prev.type_invitation_filleul &&
                          (!prev.filleul_categorie ||
                            prev.filleul_categorie === "SUSPECT_FILLEUL")
                            ? "PROSPECT_FILLEUL"
                            : prev.filleul_categorie,
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
                          filleul_categorie:
                            value !== SELECT_NONE &&
                            (!prev.filleul_categorie ||
                              prev.filleul_categorie === "SUSPECT_FILLEUL")
                              ? "PROSPECT_FILLEUL"
                              : prev.filleul_categorie,
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
                    followUpMonths={6}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </FormSection>

      {filleulReseauInscrit && !isPrescripteurForm && (
        <>
          <Separator />
          <FormSection sectionKey="parrainage">
            <ContactFormParrainageSection
              formData={formData}
              setFormData={setFormData}
              contact={contact}
              allContacts={allContacts}
              mesFilleulsCount={mesFilleulsCount}
              onOpenContact={onOpenContact}
              onCreateParrain={handleCreateParrain}
            />
          </FormSection>
        </>
      )}

      {!isPrescripteurForm && (
        <>
          <Separator />
          <FormSection sectionKey="relations">
            {isEdit && contact && (
              <ContactFoyerRelationsBlock
                contact={contact}
                foyer={foyerContext.foyer}
                foyerMembers={foyerContext.members}
                loading={foyerContext.loading}
                onOpenMember={onOpenContact}
                actions={foyerActions}
              />
            )}
            {filleulActif && !filleulReseauInscrit && (
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
            {filleulActif && !filleulReseauInscrit && (
              <FilleulRankFormFields
                titre={formData.filleul_titre}
                qualification={formData.filleul_qualification}
                onTitreChange={(v) =>
                  setFormData((prev) => ({ ...prev, filleul_titre: v }))
                }
                onQualificationChange={(v) =>
                  setFormData((prev) => ({ ...prev, filleul_qualification: v }))
                }
              />
            )}
            {contact && mesFilleulsCount > 0 && !filleulReseauInscrit && (
              <p className="text-sm text-muted-foreground rounded-md border px-3 py-2 bg-muted/20">
                Ce contact est parrain de {mesFilleulsCount} filleul
                {mesFilleulsCount > 1 ? "s" : ""}. Modifier le lien depuis la fiche de chaque filleul.
              </p>
            )}
            {clientActif && (
              <>
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
                <div className="space-y-2">
                  <Label htmlFor="source_lead">Source / Lead</Label>
                  <Input
                    id="source_lead"
                    value={formData.source_lead || ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, source_lead: e.target.value }))}
                    placeholder="Recommandation, site web..."
                  />
                </div>
              </>
            )}
            {!filleulActif &&
              !clientActif &&
              !(contact && mesFilleulsCount > 0) &&
              !(isEdit && contact?.foyer_id) && (
              <p className="text-sm text-muted-foreground">
                Renseignez un statut client ou filleul pour lier un prescripteur ou un parrain.
              </p>
            )}
          </FormSection>
        </>
      )}

      <Separator />

      <FormSection sectionKey="notes">
        <Textarea
          id="notes"
          value={formData.notes || ""}
          onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
          rows={3}
        />
      </FormSection>

      {!isEdit && isClientStatut && !isPrescripteurForm && (
        <>
          <Separator />
          <FormSection title="Patrimoine">
            <ContactFormInvestissementSection
              value={investissementChoice}
              onChange={setInvestissementChoice}
            />
          </FormSection>
        </>
      )}
    </>
  );

  const formFooter = (
    <>
      <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
        Annuler
      </Button>
      <Button type="submit" disabled={loading}>
        {loading ? "Enregistrement..." : isEdit ? "Enregistrer" : "Créer"}
      </Button>
    </>
  );

  const formBody = (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">{formFields}</div>
      <SheetFooter className="mt-0 shrink-0 border-t bg-background pt-4">{formFooter}</SheetFooter>
    </form>
  );

  const title = isEdit
    ? isPrescripteurCategorie(formData.categorie)
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
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl sm:max-h-[100dvh]"
        >
          <div className="shrink-0 border-b px-6 py-4">
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-6 py-4">{formBody}</div>
        </SheetContent>
      </Sheet>

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
