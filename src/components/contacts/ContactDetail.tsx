import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Edit,
  Trash2,
  Wallet,
  Home,
  X,
  LayoutGrid,
  History,
  FileUp,
} from "lucide-react";
import { type Contact, getContactById, getFilleulsByParrain, getAllContacts, getContactsByFoyer } from "@/lib/api/tauri-contacts";
import {
  formatCiviliteLabel,
  formatSituationLabel,
  getClientLabel,
  getFilleulLabel,
  isClientActif,
  formatStatutSuiviLabel,
} from "@/lib/contacts/contact-form-utils";
import type { ContactFormSectionId } from "@/lib/contacts/contact-form-sections";
import { ContactForm } from "./ContactForm";
import {
  getInvestissementsByContact,
  deleteInvestissement,
  type Investissement,
  getInvestissementsByFoyer,
  getInvestissementsByFoyerContacts,
} from "@/lib/api/tauri-investissements";
import { getAllPartenaires, type Partenaire } from "@/lib/api/tauri-partenaires";
import { InvestissementForm } from "@/components/investissements/InvestissementForm";
import { getAllFoyers, updateFoyer, type Foyer } from "@/lib/api/tauri-foyers";
import { FoyerCreateModal } from "@/components/foyers/FoyerCreateModal";
import { FoyerLinkModal } from "@/components/foyers/FoyerLinkModal";
import { FoyerAddMemberModal } from "@/components/foyers/FoyerAddMemberModal";
import { FoyerForm } from "@/components/foyers/FoyerForm";
import { EtiquetteList } from "@/components/etiquettes/EtiquetteBadge";
import { EtiquetteSelector } from "@/components/etiquettes/EtiquetteSelector";
import { ContactCreateMenu } from "@/components/contacts/ContactCreateMenu";
import {
  isAutoEtiquetteAttribution,
  RemoveAutoEtiquetteDialog,
  type RemoveAutoEtiquetteTarget,
} from "@/components/etiquettes/RemoveAutoEtiquetteDialog";
import {
  getEtiquettesByContact,
  attribuerEtiquette,
  retirerEtiquette,
  getAllEtiquettes,
  getAutoEtiquetteExclusionIds,
  clearAutoEtiquetteExclusion,
  type ContactEtiquetteDetails,
  type Etiquette,
} from "@/lib/api/tauri-etiquettes";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { ContactAutoEtiquetteLog } from "@/components/contacts/ContactAutoEtiquetteLog";
import { ContactDetailFoyerTab } from "@/components/contacts/ContactDetailFoyerTab";
import { type ContactFoyerRelationsActions } from "@/components/contacts/ContactFoyerRelationsBlock";
import { ContactDetailSyntheseTab } from "@/components/contacts/ContactDetailSyntheseTab";
import { ContactRegistreSwitch } from "@/components/contacts/ContactRegistreSwitch";
import { toast } from "sonner";
import { ContactInteractionsPanel } from "@/components/interactions/ContactInteractionsPanel";
import { ContactTachesPanel } from "@/components/taches/ContactTachesPanel";
import { ContactCustomFieldsPanel } from "@/components/contacts/ContactCustomFieldsPanel";
import { ContactPatrimoinePanel } from "@/components/contacts/ContactPatrimoinePanel";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import {
  getClientRoleBadgeClass,
  getFilleulRoleBadgeClass,
} from "@/lib/contacts/contact-category-display";
import {
  mergeContactPatrimoineRows,
  type InvestissementWithOwner,
} from "@/lib/investissements/patrimoine-tab-utils";
import {
  getContactsForFoyer,
  loadFoyerPatrimoineCentimes,
  buildFoyerNomFromMembers,
  dissociateContactFromFoyer,
  updateContactFoyerRole,
} from "@/lib/foyers/foyer-utils";
import { consumeOpenContactInvestissementFlag } from "@/lib/investissements/investissement-navigation";
import { navigateToDocuments } from "@/lib/documents/documents-navigation";
import { navigateToPrescripteurs } from "@/lib/navigation/prescripteurs-navigation";
import { navigateToFamilles } from "@/lib/navigation/familles-navigation";
import { navigateToFoyers } from "@/lib/navigation/foyers-navigation";
import { navigateToPartenaires } from "@/lib/navigation/partenaires-navigation";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeFoyersChanged } from "@/lib/foyers/foyer-events";
import { subscribeEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";

interface ContactDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onDelete: (id: number) => void;
  onUpdate?: () => void;
  onContactRefreshed?: (contact: Contact) => void;
  onOpenContact?: (contact: Contact) => void;
  /** Navigation app (Suivi, etc.) — ferme la fiche avant de changer de page */
  onNavigate?: (page: string) => void;
  /** Panneau latéral (split liste/détail) au lieu de la modale seule */
  embedded?: boolean;
  /** Formulaire investissement empilé (fiche dashboard drill-down) — calque au-dessus de z-[60]. */
  nestedInvestissementSheet?: boolean;
}

type DetailTab = "synthese" | "relation" | "patrimoine" | "foyer";

const CONTACT_DETAIL_TAB_TRIGGER =
  "min-w-0 gap-1 px-1.5 sm:px-2 py-2 text-[11px] sm:text-xs md:text-sm sm:flex-1 sm:basis-0 overflow-hidden data-[state=active]:shadow-none data-[state=active]:ring-1 data-[state=active]:ring-border/80";

export function ContactDetail({
  open,
  onOpenChange,
  contact,
  onDelete,
  onUpdate,
  onContactRefreshed,
  onOpenContact,
  onNavigate,
  embedded = false,
  nestedInvestissementSheet = false,
}: ContactDetailProps) {
  const [detailTab, setDetailTab] = useState<DetailTab>("synthese");
  const [showEditForm, setShowEditForm] = useState(false);
  const [editSectionId, setEditSectionId] = useState<ContactFormSectionId | null>(null);
  const [showInvestissementForm, setShowInvestissementForm] = useState(false);
  const [selectedInvestissement, setSelectedInvestissement] = useState<Investissement | null>(null);
  const [investissements, setInvestissements] = useState<InvestissementWithOwner[]>([]);
  const [loadingInvestissements, setLoadingInvestissements] = useState(false);
  const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
  const [parrain, setParrain] = useState<Contact | null>(null);
  const [prescripteur, setPrescripteur] = useState<Contact | null>(null);
  const [loadingPrescripteur, setLoadingPrescripteur] = useState(false);
  const [allEtiquettes, setAllEtiquettes] = useState<Etiquette[]>([]);
  const [autoExcludedIds, setAutoExcludedIds] = useState<number[]>([]);
  const [etiquetteRemoveTarget, setEtiquetteRemoveTarget] =
    useState<RemoveAutoEtiquetteTarget | null>(null);
  const [filleuls, setFilleuls] = useState<Contact[]>([]);
  const [loadingParrain, setLoadingParrain] = useState(false);
  const [loadingFilleuls, setLoadingFilleuls] = useState(false);
  const [foyer, setFoyer] = useState<Foyer | null>(null);
  const [foyerMembers, setFoyerMembers] = useState<Contact[]>([]);
  const [loadingFoyer, setLoadingFoyer] = useState(false);
  const [foyerPatrimoine, setFoyerPatrimoine] = useState(0);
  const [showFoyerCreateModal, setShowFoyerCreateModal] = useState(false);
  const [showFoyerLinkModal, setShowFoyerLinkModal] = useState(false);
  const [showFoyerAddMemberModal, setShowFoyerAddMemberModal] = useState(false);
  const [showFoyerEditForm, setShowFoyerEditForm] = useState(false);
  const [etiquettes, setEtiquettes] = useState<ContactEtiquetteDetails[]>([]);
  const [showDeleteContactDialog, setShowDeleteContactDialog] = useState(false);
  const [etiquetteSelectorOpen, setEtiquetteSelectorOpen] = useState(false);
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [foyerRenamePrompt, setFoyerRenamePrompt] = useState<{
    foyer: Foyer;
    suggestedNom: string;
  } | null>(null);
  const identityBeforeEditRef = useRef<{ nom: string; prenom: string } | null>(
    null
  );
  const contactRef = useRef(contact);
  contactRef.current = contact;
  const investissementFormOpenRef = useRef(false);
  investissementFormOpenRef.current = showInvestissementForm;

  const openEditForm = (sectionId?: ContactFormSectionId) => {
    if (contact) {
      identityBeforeEditRef.current = {
        nom: contact.nom,
        prenom: contact.prenom,
      };
    }
    setEditSectionId(sectionId ?? null);
    setShowEditForm(true);
  };

  const handleRemoveMemberFromFoyer = async (member: Contact) => {
    if (!member?.id) return;

    const isSelf = member.id === contact?.id;
    const confirmMsg = isSelf
      ? `Voulez-vous vraiment dissocier ${member.prenom} ${member.nom} de ce foyer ?`
      : `Retirer ${member.prenom} ${member.nom} du foyer « ${foyer?.nom ?? ""} » ?`;

    if (!confirm(confirmMsg)) return;

    try {
      await dissociateContactFromFoyer(member);
      toast.success(isSelf ? "Contact dissocié du foyer" : "Membre retiré du foyer");
      const fresh = await getContactById(contact!.id);
      onContactRefreshed?.(fresh);
      await loadFoyer(fresh);
      onUpdate?.();
    } catch (error) {
      console.error("Erreur retrait foyer:", error);
      toast.error("Erreur lors du retrait du foyer");
    }
  };

  const handleChangeFoyerRole = async (member: Contact, role: string) => {
    if (!member.id || member.role_foyer === role) return;
    try {
      const updated = await updateContactFoyerRole(member, role);
      if (member.id === contact?.id) {
        onContactRefreshed?.(updated);
      }
      await loadFoyer(contact ?? undefined);
      onUpdate?.();
      toast.success("Rôle dans le foyer mis à jour");
    } catch (error) {
      console.error("Erreur rôle foyer:", error);
      toast.error("Impossible de mettre à jour le rôle");
    }
  };

  const handleOpenLinkedContact = (linked: Contact) => {
    if (onOpenContact) {
      onOpenContact(linked);
    }
  };

  const handleOpenMemberDetail = (member: Contact) => {
    handleOpenLinkedContact(member);
  };

  const handleAddFoyerMember = () => {
    if (contact?.foyer_id && foyer) {
      setShowFoyerAddMemberModal(true);
    } else {
      setShowFoyerLinkModal(true);
    }
  };

  const foyerRelationsActions: ContactFoyerRelationsActions = {
    onEditFoyer: () => setShowFoyerEditForm(true),
    onAddFoyerMember: handleAddFoyerMember,
  };

  const handleOpenOwnerContact = async (ownerId: number) => {
    if (!onOpenContact || ownerId === contact?.id) return;

    const fromFoyer = foyerMembers.find((m) => m.id === ownerId);
    if (fromFoyer) {
      handleOpenLinkedContact(fromFoyer);
      return;
    }

    try {
      const fetched = await getContactById(ownerId);
      handleOpenLinkedContact(fetched);
    } catch (error) {
      console.error("Erreur ouverture fiche détenteur:", error);
      toast.error("Impossible d'ouvrir la fiche contact");
    }
  };

  // Charger les partenaires au montage
  useEffect(() => {
    const loadPartenaires = async () => {
      try {
        const data = await getAllPartenaires();
        setPartenaires(data);
      } catch (error) {
        console.error("Error loading partenaires:", error);
      }
    };
    loadPartenaires();
  }, []);

  const detailActive = embedded || open;

  useEffect(() => {
    const tabHint = sessionStorage.getItem("crm_open_contact_tab");
    if (tabHint === "patrimoine" || tabHint === "relation" || tabHint === "foyer") {
      setDetailTab(tabHint);
      sessionStorage.removeItem("crm_open_contact_tab");
    } else {
      setDetailTab("synthese");
    }
    if (consumeOpenContactInvestissementFlag()) {
      setDetailTab("patrimoine");
      setShowInvestissementForm(true);
    }
  }, [contact?.id]);

  const loadEtiquettes = async () => {
    if (!contact?.id) return;
    try {
      const [data, excluded] = await Promise.all([
        getEtiquettesByContact(contact.id),
        getAutoEtiquetteExclusionIds(contact.id),
      ]);
      setEtiquettes(data);
      setAutoExcludedIds(excluded);
    } catch (error) {
      console.error("Error loading etiquettes:", error);
    }
  };

  useEffect(() => {
    void getAllEtiquettes().then(setAllEtiquettes).catch(() => setAllEtiquettes([]));
  }, []);

  const handleAddEtiquette = async (etiquetteId: number) => {
    if (!contact?.id) return;
    try {
      await attribuerEtiquette(contact.id, etiquetteId, "MANUEL");
      await loadEtiquettes();
      notifyEtiquettesChanged();
      toast.success("Étiquette ajoutée");
    } catch (error) {
      console.error("Error adding etiquette:", error);
      toast.error("Erreur lors de l'ajout de l'étiquette");
    }
  };

  const handleRemoveEtiquetteClick = (etiquetteId: number) => {
    if (!contact?.id) return;
    const row = etiquettes.find((e) => e.etiquette_id === etiquetteId);
    if (row && isAutoEtiquetteAttribution(row.attribue_par)) {
      setEtiquetteRemoveTarget({
        contactId: contact.id,
        etiquetteId,
        etiquetteNom: row.etiquette_nom,
      });
      return;
    }
    void confirmRemoveEtiquette(etiquetteId, false);
  };

  const confirmRemoveEtiquette = async (
    etiquetteId: number,
    excludeFromAuto: boolean
  ) => {
    if (!contact?.id) return;
    try {
      await retirerEtiquette(contact.id, etiquetteId, excludeFromAuto);
      await loadEtiquettes();
      notifyEtiquettesChanged();
      toast.success(
        excludeFromAuto
          ? "Étiquette retirée — ne sera plus appliquée automatiquement"
          : "Étiquette retirée"
      );
    } catch (error) {
      console.error("Error removing etiquette:", error);
      toast.error("Erreur lors du retrait de l'étiquette");
    } finally {
      setEtiquetteRemoveTarget(null);
    }
  };

  const handleClearAutoExclusion = async (etiquetteId: number) => {
    if (!contact?.id) return;
    try {
      await clearAutoEtiquetteExclusion(contact.id, etiquetteId);
      await loadEtiquettes();
      notifyEtiquettesChanged();
      toast.success("Exclusion levée — le recalcul auto pourra réappliquer cette étiquette");
    } catch (error) {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const excludedEtiquettes = allEtiquettes.filter(
    (e) =>
      autoExcludedIds.includes(e.id) &&
      !etiquettes.some((ce) => ce.etiquette_id === e.id)
  );

  const loadInvestissements = async (forContact?: Contact) => {
    const c = forContact ?? contact;
    if (!c?.id) return;

    setLoadingInvestissements(true);
    try {
      const own = await getInvestissementsByContact(c.id);
      const contactLabel = `${c.prenom} ${c.nom}`.trim();

      if (!c.foyer_id) {
        setInvestissements(
          own.map((inv) => ({
            ...inv,
            _proprietaire: contactLabel,
            _proprietaireId: c.id,
          }))
        );
        return;
      }

      const [foyerInvs, memberInvs, foyerMembers] = await Promise.all([
        getInvestissementsByFoyer(c.foyer_id),
        getInvestissementsByFoyerContacts(c.foyer_id),
        getContactsByFoyer(c.foyer_id),
      ]);

      const memberById = new Map(
        foyerMembers.filter((m) => m.id && m.id !== c.id).map((m) => [m.id!, m])
      );
      const memberRows: InvestissementWithOwner[] = memberInvs
        .filter((inv) => inv.contact_id != null && inv.contact_id !== c.id)
        .map((inv) => {
          const member = memberById.get(inv.contact_id!);
          const label = member
            ? `${member.prenom} ${member.nom}`.trim()
            : "Membre foyer";
          return {
            ...inv,
            _proprietaire: label,
            _proprietaireId: inv.contact_id,
          };
        });

      setInvestissements(
        mergeContactPatrimoineRows(c.id, contactLabel, own, foyerInvs, memberRows)
      );
    } catch (error) {
      console.error("Error loading investissements:", error);
      toast.error("Impossible de charger le patrimoine");
      setInvestissements([]);
    } finally {
      setLoadingInvestissements(false);
    }
  };

  const loadPrescripteur = async (forContact?: Contact) => {
    const c = forContact ?? contact;
    if (!c?.prescripteur_id) {
      setPrescripteur(null);
      return;
    }
    setLoadingPrescripteur(true);
    try {
      const data = await getContactById(c.prescripteur_id);
      setPrescripteur(data);
    } catch (error) {
      console.error("Error loading prescripteur:", error);
      setPrescripteur(null);
    } finally {
      setLoadingPrescripteur(false);
    }
  };

  const loadParrain = async (forContact?: Contact) => {
    const c = forContact ?? contact;
    if (!c?.parrain_id) {
      setParrain(null);
      return;
    }

    setLoadingParrain(true);
    try {
      const data = await getContactById(c.parrain_id);
      setParrain(data);
    } catch (error) {
      console.error("Error loading parrain:", error);
      setParrain(null);
    } finally {
      setLoadingParrain(false);
    }
  };

  const loadFilleuls = async (forContact?: Contact) => {
    const c = forContact ?? contact;
    if (!c?.id) return;

    setLoadingFilleuls(true);
    try {
      const data = await getFilleulsByParrain(c.id);
      setFilleuls(data);
    } catch (error) {
      console.error("Error loading filleuls:", error);
      setFilleuls([]);
    } finally {
      setLoadingFilleuls(false);
    }
  };

  const loadFoyer = async (forContact?: Contact) => {
    const c = forContact ?? contact;
    if (!c?.foyer_id) {
      setFoyer(null);
      setFoyerMembers([]);
      setFoyerPatrimoine(0);
      return;
    }

    setLoadingFoyer(true);
    try {
      const [foyers, allContacts] = await Promise.all([
        getAllFoyers(),
        getAllContacts(),
      ]);

      const currentFoyer = foyers.find((f) => f.id === c.foyer_id);
      setFoyer(currentFoyer || null);

      const members = allContacts.filter(
        (member) => member.foyer_id === c.foyer_id && member.id !== c.id
      );
      setFoyerMembers(members);

      if (currentFoyer && c.foyer_id) {
        const membres = getContactsForFoyer(allContacts, c.foyer_id);
        const totalFoyer = await loadFoyerPatrimoineCentimes(
          currentFoyer.id,
          membres
        );
        setFoyerPatrimoine(totalFoyer / 100);
      }
    } catch (error) {
      console.error("Error loading foyer:", error);
      setFoyer(null);
      setFoyerMembers([]);
      setFoyerPatrimoine(0);
    } finally {
      setLoadingFoyer(false);
    }
  };

  const reloadAllSections = useCallback(async (forContact?: Contact) => {
    const c = forContact ?? contactRef.current;
    if (!c?.id) return;
    await Promise.all([
      loadInvestissements(c),
      loadParrain(c),
      loadPrescripteur(c),
      loadFilleuls(c),
      loadFoyer(c),
      loadEtiquettes(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callback volontairement stable ; les loaders lisent contactRef.current
  }, []);

  const refreshContactAfterMutation = useCallback(async () => {
    const id = contactRef.current?.id;
    if (!id) return;
    try {
      const fresh = await getContactById(id);
      onContactRefreshed?.(fresh);
      onUpdate?.();
      await reloadAllSections(fresh);
    } catch (error) {
      console.error("Erreur rechargement contact:", error);
    }
  }, [onContactRefreshed, onUpdate, reloadAllSections]);

  const maybeOfferFoyerRename = async (
    before: { nom: string; prenom: string } | null,
    fresh: Contact
  ) => {
    if (!before || !fresh.foyer_id) return;

    const identityChanged =
      before.nom.trim().toUpperCase() !== fresh.nom.trim().toUpperCase() ||
      before.prenom.trim().toUpperCase() !== fresh.prenom.trim().toUpperCase();
    if (!identityChanged) return;

    const [foyers, allContacts] = await Promise.all([
      getAllFoyers(),
      getAllContacts(),
    ]);
    const currentFoyer = foyers.find((f) => f.id === fresh.foyer_id);
    if (!currentFoyer) return;

    const membres = getContactsForFoyer(allContacts, fresh.foyer_id).map((m) =>
      m.id === fresh.id ? fresh : m
    );
    const suggestedNom = buildFoyerNomFromMembers(membres);
    if (
      suggestedNom.trim().toUpperCase() === currentFoyer.nom.trim().toUpperCase()
    ) {
      return;
    }

    setFoyerRenamePrompt({ foyer: currentFoyer, suggestedNom });
  };

  const handleConfirmFoyerRename = async () => {
    if (!foyerRenamePrompt) return;
    const { foyer, suggestedNom } = foyerRenamePrompt;
    try {
      await updateFoyer(foyer.id, {
        nom: suggestedNom,
        type_foyer: foyer.type_foyer,
        nombre_parts_fiscales: foyer.nombre_parts_fiscales,
        tranche_imposition: foyer.tranche_imposition,
        revenu_fiscal_reference: foyer.revenu_fiscal_reference,
        ir_net_a_payer: foyer.ir_net_a_payer,
        situation_patrimoniale: foyer.situation_patrimoniale ?? "",
        objectifs_patrimoniaux: foyer.objectifs_patrimoniaux ?? "",
        notes: foyer.notes ?? "",
      });
      toast.success("Nom du foyer mis à jour");
      setFoyerRenamePrompt(null);
      await loadFoyer(contact ?? undefined);
      onUpdate?.();
    } catch (error) {
      console.error("Erreur mise à jour nom foyer:", error);
      toast.error("Impossible de mettre à jour le nom du foyer");
    }
  };

  useEffect(() => {
    if (!contact?.id || !detailActive) return;
    void reloadAllSections(contact);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recharge sur changement d'id seulement, pas sur l'identité de l'objet contact
  }, [contact?.id, detailActive, reloadAllSections]);

  useEffect(() => {
    if (detailTab === "patrimoine" && contact?.id && detailActive) {
      void loadInvestissements();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- déclenché par l'onglet/id, loadInvestissements lit contactRef.current
  }, [detailTab, contact?.id, detailActive]);

  useEffect(() => {
    if (!contact?.id || !detailActive) return;

    const syncOpenContactFromServer = () => {
      void (async () => {
        const id = contactRef.current?.id;
        if (!id || !detailActive) return;
        try {
          if (investissementFormOpenRef.current) {
            // Formulaire investissement ouvert : le refresh complet (fiche, étiquettes,
            // foyer) est délégué à handleInvestissementSuccess à la fermeture, pour éviter
            // des rechargements redondants pendant la saisie.
            return;
          }
          const fresh = await getContactById(id);
          onContactRefreshed?.(fresh);
          onUpdate?.();
          await reloadAllSections(fresh);
          const before = identityBeforeEditRef.current;
          if (before) {
            identityBeforeEditRef.current = null;
            await maybeOfferFoyerRename(before, fresh);
          }
        } catch (error) {
          console.error("Sync fiche contact:", error);
        }
      })();
    };

    const syncInvestissementsOnly = () => {
      if (!contact?.id || !detailActive) return;
      if (investissementFormOpenRef.current) return;
      void loadInvestissements();
    };

    const unsubs = [
      subscribeContactsChanged(syncOpenContactFromServer),
      subscribeFoyersChanged(syncOpenContactFromServer),
      subscribeInvestissementsChanged(syncInvestissementsOnly),
      subscribeEtiquettesChanged(() => {
        void loadEtiquettes();
      }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- (ré)abonnement uniquement au changement de contact/onglet actif
  }, [contact?.id, detailActive, onContactRefreshed, reloadAllSections]);

  const getPartenaireNom = (partenaireId?: number): string | null => {
    if (!partenaireId) return null;
    const partenaire = partenaires.find(p => p.id === partenaireId);
    return partenaire?.raison_sociale || null;
  };

  if (!contact) return null;

  const clientRoleLabel = getClientLabel(contact.categorie);
  const filleulRoleLabel = getFilleulLabel(contact.filleul_categorie);

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case "ACTIF":
        return "bg-green-100 text-green-800";
      case "EN_PAUSE":
        return "bg-amber-100 text-amber-900";
      case "ARCHIVE":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const statutSuivi = contact.statut_suivi || "ACTIF";
  const showStatutBadge = statutSuivi !== "ACTIF";

  const confirmDeleteContact = () => {
    if (!contact?.id) return;
    onDelete(contact.id);
    setShowDeleteContactDialog(false);
    onOpenChange(false);
  };

  const handleEditInvestissement = (inv: Investissement) => {
    setSelectedInvestissement(inv);
    setShowInvestissementForm(true);
  };

  const handleDeleteInvestissement = async (inv: Investissement) => {
    if (
      window.confirm(
        `Êtes-vous sûr de vouloir supprimer l'investissement "${inv.nom_produit}" ?`
      )
    ) {
      try {
        await deleteInvestissement(inv.id);
        await loadInvestissements(); // Recharger la liste
      } catch (error) {
        console.error("Error deleting investissement:", error);
        alert("Erreur lors de la suppression: " + String(error));
      }
    }
  };

  const handleInvestissementFormClose = () => {
    setShowInvestissementForm(false);
    setSelectedInvestissement(null);
  };

  const handleInvestissementSuccess = async () => {
    handleInvestissementFormClose();
    notifyEtiquettesChanged();
    await refreshContactAfterMutation();
  };

  const titleText = formatCiviliteLabel(contact.civilite)
    ? `${formatCiviliteLabel(contact.civilite)} ${contact.prenom} ${contact.nom}`
    : `${contact.prenom} ${contact.nom}`;

  const headerBlock = (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {embedded ? (
            <h2 className="text-xl font-serif font-bold text-primary leading-tight">{titleText}</h2>
          ) : (
            <DialogTitle className="text-2xl leading-tight">{titleText}</DialogTitle>
          )}
          {!embedded && (
            <DialogDescription className="sr-only">
              Détails du contact et informations personnelles
            </DialogDescription>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {contact.id != null && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowDocUpload(true)}
                title="Importer un document (RIO, CNI, QPI…)"
              >
                <FileUp className="h-4 w-4" />
                <span className="sr-only md:not-sr-only">Importer</span>
              </Button>
              <ContactCreateMenu
                contactId={contact.id}
                nestedSheet={nestedInvestissementSheet}
                onCreated={() => void refreshContactAfterMutation()}
                onOpenEtiquettes={() => setEtiquetteSelectorOpen(true)}
              />
            </>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => openEditForm()}
            title="Modifier"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShowDeleteContactDialog(true)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            title="Supprimer le contact"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          {embedded && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              title="Fermer la fiche"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
        {(formatCiviliteLabel(contact.civilite) ||
          formatSituationLabel(contact.situation_familiale)) && (
          <span>
            {[formatCiviliteLabel(contact.civilite), formatSituationLabel(contact.situation_familiale)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
        {isClientActif(contact.categorie) && clientRoleLabel && (
          <Badge className={getClientRoleBadgeClass(contact.categorie)}>{clientRoleLabel}</Badge>
        )}
        {filleulRoleLabel && contact.filleul_categorie && (
          <Badge className={getFilleulRoleBadgeClass(contact.filleul_categorie)}>
            {filleulRoleLabel}
          </Badge>
        )}
        {!clientRoleLabel && !filleulRoleLabel && contact.categorie !== "AUCUN" && (
          <Badge className={getClientRoleBadgeClass(contact.categorie)}>{contact.categorie}</Badge>
        )}
        {showStatutBadge && (
          <Badge
            className={getStatutColor(statutSuivi)}
            title="Statut de suivi"
          >
            {formatStatutSuiviLabel(statutSuivi)}
          </Badge>
        )}
        <ContactRegistreSwitch
          contact={contact}
          onUpdated={(updated) => {
            onContactRefreshed?.(updated);
            onUpdate?.();
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <EtiquetteList
          etiquettes={etiquettes.map((e) => ({
            id: e.etiquette_id,
            nom: e.etiquette_nom,
            couleur: e.etiquette_couleur,
            attribue_par: e.attribue_par,
          }))}
          onRemove={handleRemoveEtiquetteClick}
          size="sm"
        />
        <EtiquetteSelector
          selectedIds={etiquettes.map((e) => e.etiquette_id)}
          onAdd={handleAddEtiquette}
          onRemove={handleRemoveEtiquetteClick}
          open={etiquetteSelectorOpen}
          onOpenChange={setEtiquetteSelectorOpen}
          nestedSheet={nestedInvestissementSheet}
        />
        {contact.id != null && <ContactAutoEtiquetteLog contactId={contact.id} />}
        {excludedEtiquettes.length > 0 && (
          <p className="text-xs text-muted-foreground w-full">
            Exclues du calcul auto :{" "}
            {excludedEtiquettes.map((e) => (
              <button
                key={e.id}
                type="button"
                className="text-primary hover:underline mr-2"
                title="Réautoriser l'application automatique"
                onClick={() => void handleClearAutoExclusion(e.id)}
              >
                {e.nom} (réactiver)
              </button>
            ))}
          </p>
        )}
      </div>
    </div>
  );

  const tabsBlock = (
          <Tabs
            value={detailTab}
            onValueChange={(v) => setDetailTab(v as DetailTab)}
            className="w-full min-h-0 flex flex-col"
          >
            <TabsList className="grid w-full grid-cols-2 sm:flex sm:flex-row h-auto shrink-0 p-1 gap-0.5">
              <TabsTrigger value="synthese" className={CONTACT_DETAIL_TAB_TRIGGER}>
                <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate min-w-0">Synthèse</span>
              </TabsTrigger>
              <TabsTrigger value="relation" className={CONTACT_DETAIL_TAB_TRIGGER}>
                <History className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate min-w-0">Relation</span>
              </TabsTrigger>
              <TabsTrigger value="patrimoine" className={CONTACT_DETAIL_TAB_TRIGGER}>
                <Wallet className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate min-w-0">Patrimoine</span>
                {investissements.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 min-w-4 shrink-0 px-1 text-[10px] font-semibold tabular-nums"
                  >
                    {investissements.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="foyer" className={CONTACT_DETAIL_TAB_TRIGGER}>
                <Home className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate min-w-0" title="Couple / foyer">
                  <span className="hidden md:inline">Couple / </span>Foyer
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="synthese" className="space-y-4 mt-3 focus-visible:outline-none">
              <ContactDetailSyntheseTab
                contact={contact}
                foyer={foyer}
                foyerMembers={foyerMembers}
                loadingFoyer={loadingFoyer}
                parrain={parrain}
                prescripteur={prescripteur}
                loadingParrain={loadingParrain}
                loadingPrescripteur={loadingPrescripteur}
                mesFilleulsCount={filleuls.length}
                foyerActions={foyerRelationsActions}
                onOpenContact={onOpenContact}
                onContactUpdated={() => void refreshContactAfterMutation()}
                onEditSection={(sectionId) => openEditForm(sectionId)}
              />
              {contact.id && <ContactCustomFieldsPanel contactId={contact.id} />}
            </TabsContent>

            <TabsContent value="relation" className="mt-3 focus-visible:outline-none">
            {contact.id && (
              <ContactInteractionsPanel
                contactId={contact.id}
                contactEmail={contact.email}
                relationTabActive={detailTab === "relation"}
                dateDernierContact={contact.date_dernier_contact}
                dateDernierContactFilleul={contact.date_dernier_contact_filleul}
                onContactUpdated={() => void refreshContactAfterMutation()}
                onNavigate={
                  onNavigate
                    ? (page) => {
                        onOpenChange(false);
                        onNavigate(page);
                      }
                    : undefined
                }
              />
            )}

            {contact.id && (
              <div className="mt-4 border-t border-border pt-4">
                <ContactTachesPanel contactId={contact.id} />
              </div>
            )}

            </TabsContent>

            <TabsContent value="patrimoine" className="mt-3 focus-visible:outline-none">
              <ContactPatrimoinePanel
                contactId={contact.id}
                contactPrenom={contact.prenom}
                contactNom={contact.nom}
                hasFoyer={Boolean(contact.foyer_id)}
                investissements={investissements}
                loading={loadingInvestissements}
                getPartenaireNom={getPartenaireNom}
                onAdd={() => {
                  setSelectedInvestissement(null);
                  setShowInvestissementForm(true);
                }}
                onEdit={handleEditInvestissement}
                onDelete={handleDeleteInvestissement}
                onRefresh={loadInvestissements}
                onOpenOwnerContact={
                  onOpenContact ? handleOpenOwnerContact : undefined
                }
                onNavigateDocuments={
                  onNavigate && contact.id
                    ? () => {
                        onOpenChange(false);
                        navigateToDocuments(onNavigate, contact.id, "contacts");
                      }
                    : undefined
                }
                onImportDocument={() => setShowDocUpload(true)}
                onViewPartenaire={
                  onNavigate
                    ? (partenaireId: number, investissementId?: number) => {
                        onOpenChange(false);
                        navigateToPartenaires(onNavigate, {
                          partenaireId,
                          focusInvestissementId: investissementId,
                        });
                      }
                    : undefined
                }
              />
            </TabsContent>

            <TabsContent value="foyer" className="space-y-4 mt-3 focus-visible:outline-none">
              <ContactDetailFoyerTab
                contact={contact}
                foyer={foyer}
                loadingFoyer={loadingFoyer}
                foyerPatrimoine={foyerPatrimoine}
                foyerMembers={foyerMembers}
                prescripteur={prescripteur}
                loadingPrescripteur={loadingPrescripteur}
                parrain={parrain}
                loadingParrain={loadingParrain}
                filleuls={filleuls}
                loadingFilleuls={loadingFilleuls}
                onOpenLinkedContact={handleOpenLinkedContact}
                onOpenMemberDetail={handleOpenMemberDetail}
                onEditFoyer={() => setShowFoyerEditForm(true)}
                onChangeMemberRole={(member, role) => void handleChangeFoyerRole(member, role)}
                onRemoveMemberFromFoyer={(member) => void handleRemoveMemberFromFoyer(member)}
                onAddFoyerMember={handleAddFoyerMember}
                onCreateFoyer={() => setShowFoyerCreateModal(true)}
                onViewPrescripteurNetwork={
                  onNavigate && contact.id
                    ? () => {
                        onOpenChange(false);
                        navigateToPrescripteurs(onNavigate, {
                          focusContactId: contact.id,
                        });
                      }
                    : undefined
                }
                onViewFamilleGroup={
                  onNavigate &&
                  contact.id &&
                  !contact.famille_regroupement_exclu &&
                  (contact.famille_id != null || Boolean(contact.nom?.trim()))
                    ? () => {
                        onOpenChange(false);
                        navigateToFamilles(onNavigate, {
                          focusContactId: contact.id,
                        });
                      }
                    : undefined
                }
                onViewFoyerPage={
                  onNavigate && contact.id && contact.foyer_id != null
                    ? () => {
                        onOpenChange(false);
                        navigateToFoyers(onNavigate, {
                          foyerId: contact.foyer_id ?? undefined,
                          focusContactId: contact.id,
                        });
                      }
                    : undefined
                }
              />
            </TabsContent>
          </Tabs>
  );

  const modals = (
    <>
      {/* Formulaire de modification */}
      <ContactForm
        open={showEditForm}
        onOpenChange={(open) => {
          setShowEditForm(open);
          if (!open) setEditSectionId(null);
        }}
        contact={contact}
        createContext="detail"
        initialSectionId={editSectionId}
        onOpenContact={onOpenContact}
        nestedSheet={nestedInvestissementSheet}
        foyerActions={{
          onEditFoyer: () => {
            setShowEditForm(false);
            setEditSectionId(null);
            setShowFoyerEditForm(true);
          },
          onAddFoyerMember: () => {
            setShowEditForm(false);
            setEditSectionId(null);
            handleAddFoyerMember();
          },
        }}
        onSuccess={() => {
          void refreshContactAfterMutation();
          onUpdate?.();
        }}
      />

      {/* Formulaire d'ajout d'investissement */}
      <InvestissementForm
        open={showInvestissementForm}
        onOpenChange={handleInvestissementFormClose}
        investissement={selectedInvestissement}
        defaultContactId={contact?.id}
        onSuccess={handleInvestissementSuccess}
        onEncoursUpdated={loadInvestissements}
        nestedSheet={nestedInvestissementSheet}
      />

      {/* Modales de gestion des foyers */}
      {contact && (
        <>
          <FoyerCreateModal
            open={showFoyerCreateModal}
            onOpenChange={setShowFoyerCreateModal}
            currentContact={contact}
            onSuccess={() => void refreshContactAfterMutation()}
          />
          <FoyerLinkModal
            open={showFoyerLinkModal}
            onOpenChange={setShowFoyerLinkModal}
            currentContact={contact}
            onSuccess={() => void refreshContactAfterMutation()}
          />
          {foyer && (
            <>
              <FoyerAddMemberModal
                open={showFoyerAddMemberModal}
                onOpenChange={setShowFoyerAddMemberModal}
                foyer={foyer}
                currentContact={contact}
                existingMemberIds={foyerMembers.map((m) => m.id)}
                onSuccess={() => void refreshContactAfterMutation()}
              />
              <FoyerForm
                open={showFoyerEditForm}
                onOpenChange={setShowFoyerEditForm}
                foyer={foyer}
                onSuccess={() => void refreshContactAfterMutation()}
              />
            </>
          )}
        </>
      )}

      <RemoveAutoEtiquetteDialog
        target={etiquetteRemoveTarget}
        stacked={nestedInvestissementSheet}
        onOpenChange={(open) => !open && setEtiquetteRemoveTarget(null)}
        onConfirm={(excludeFromAuto) => {
          if (!etiquetteRemoveTarget) return;
          void confirmRemoveEtiquette(
            etiquetteRemoveTarget.etiquetteId,
            excludeFromAuto
          );
        }}
      />

      <AlertDialog
        open={foyerRenamePrompt != null}
        onOpenChange={(open) => {
          if (!open) setFoyerRenamePrompt(null);
        }}
      >
        <AlertDialogContent stacked={nestedInvestissementSheet}>
          <AlertDialogHeader>
            <AlertDialogTitle>Mettre à jour le nom du foyer ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Vous avez modifié l’identité de ce contact. Le foyer associé
                  s’appelle encore{" "}
                  <strong className="text-foreground">
                    {foyerRenamePrompt?.foyer.nom}
                  </strong>
                  .
                </p>
                <p>
                  Suggestion :{" "}
                  <strong className="text-foreground">
                    {foyerRenamePrompt?.suggestedNom}
                  </strong>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Conserver l’ancien nom</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmFoyerRename()}>
              Mettre à jour
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {contact.id != null && (
        <DocumentUpload
          open={showDocUpload}
          onOpenChange={setShowDocUpload}
          contactId={contact.id}
          nestedSheet={nestedInvestissementSheet}
          defaultTypeDocument="PATRIMOINE"
          contactNom={contact.nom}
          contactPrenom={contact.prenom}
          contactDateNaissance={contact.date_naissance}
          contactLieuNaissance={contact.lieu_naissance}
          onSuccess={() => {
            setShowDocUpload(false);
            void refreshContactAfterMutation();
          }}
        />
      )}

      <AlertDialog
        open={showDeleteContactDialog}
        onOpenChange={setShowDeleteContactDialog}
      >
        <AlertDialogContent stacked={nestedInvestissementSheet}>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce contact ?</AlertDialogTitle>
            <AlertDialogDescription>
              {contact && (
                <>
                  Vous allez supprimer{" "}
                  <strong>
                    {contact.prenom} {contact.nom}
                  </strong>
                  . Cette action est irréversible (investissements, documents et
                  historique liés).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteContact}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embedded) {
    return (
      <>
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
          <div className="shrink-0 border-b border-border/60 px-4 py-3">{headerBlock}</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{tabsBlock}</div>
        </div>
        {modals}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-y-auto shadow-md">
          <DialogHeader className="shrink-0 pr-12">{headerBlock}</DialogHeader>
          <div className="min-h-0">{tabsBlock}</div>
        </DialogContent>
      </Dialog>
      {modals}
    </>
  );
}
