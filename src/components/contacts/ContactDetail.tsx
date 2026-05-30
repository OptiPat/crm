import { useState, useEffect } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  Edit,
  Trash2,
  User,
  Wallet,
  Plus,
  Users2,
  Home,
  X,
  LayoutGrid,
  History,
  Network,
} from "lucide-react";
import { type Contact, getContactById, getFilleulsByParrain, getAllContacts, updateContact } from "@/lib/api/tauri-contacts";
import {
  contactToUpdatePayload,
  formatCiviliteLabel,
  formatSituationLabel,
  getClientLabel,
  getFilleulLabel,
} from "@/lib/contacts/contact-form-utils";
import { ContactForm } from "./ContactForm";
import { getInvestissementsByContact, deleteInvestissement, type Investissement, getInvestissementsByFoyer } from "@/lib/api/tauri-investissements";
import { getAllPartenaires, type Partenaire } from "@/lib/api/tauri-partenaires";
import { InvestissementForm } from "@/components/investissements/InvestissementForm";
import { getAllFoyers, type Foyer } from "@/lib/api/tauri-foyers";
import { FoyerCreateModal } from "@/components/foyers/FoyerCreateModal";
import { FoyerLinkModal } from "@/components/foyers/FoyerLinkModal";
import { EtiquetteList } from "@/components/etiquettes/EtiquetteBadge";
import { EtiquetteSelector } from "@/components/etiquettes/EtiquetteSelector";
import { getEtiquettesByContact, attribuerEtiquette, retirerEtiquette, type ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { toast } from "sonner";
import { ContactInteractionsPanel } from "@/components/interactions/ContactInteractionsPanel";
import { InvestissementMetaRow } from "@/components/investissements/InvestissementMetaRow";
import { InvestissementCard } from "@/components/investissements/InvestissementCard";
import { getContactCategorieBadgeClass } from "@/lib/contacts/contact-category-display";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import {
  getContactsForFoyer,
  loadFoyerPatrimoineCentimes,
} from "@/lib/foyers/foyer-utils";

interface ContactDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onDelete: (id: number) => void;
  onUpdate: () => void;
  onContactRefreshed?: (contact: Contact) => void;
  onOpenContact?: (contact: Contact) => void;
  /** Navigation app (Suivi, etc.) — ferme la fiche avant de changer de page */
  onNavigate?: (page: string) => void;
  /** Panneau latéral (split liste/détail) au lieu de la modale seule */
  embedded?: boolean;
}

type DetailTab = "synthese" | "relation" | "patrimoine" | "foyer";

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
}: ContactDetailProps) {
  const [detailTab, setDetailTab] = useState<DetailTab>("synthese");
  const [showEditForm, setShowEditForm] = useState(false);
  const [showInvestissementForm, setShowInvestissementForm] = useState(false);
  const [selectedInvestissement, setSelectedInvestissement] = useState<Investissement | null>(null);
  const [investissements, setInvestissements] = useState<Investissement[]>([]);
  const [loadingInvestissements, setLoadingInvestissements] = useState(false);
  const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
  const [parrain, setParrain] = useState<Contact | null>(null);
  const [filleuls, setFilleuls] = useState<Contact[]>([]);
  const [loadingParrain, setLoadingParrain] = useState(false);
  const [loadingFilleuls, setLoadingFilleuls] = useState(false);
  const [foyer, setFoyer] = useState<Foyer | null>(null);
  const [foyerMembers, setFoyerMembers] = useState<Contact[]>([]);
  const [loadingFoyer, setLoadingFoyer] = useState(false);
  const [foyerPatrimoine, setFoyerPatrimoine] = useState(0);
  const [showFoyerCreateModal, setShowFoyerCreateModal] = useState(false);
  const [showFoyerLinkModal, setShowFoyerLinkModal] = useState(false);
  const [etiquettes, setEtiquettes] = useState<ContactEtiquetteDetails[]>([]);
  const [showDeleteContactDialog, setShowDeleteContactDialog] = useState(false);

  const handleDissocierFoyer = async () => {
    if (!contact?.id) return;
    
    const confirmMsg = `Voulez-vous vraiment dissocier ${contact.prenom} ${contact.nom} de ce foyer ?`;
    
    if (!confirm(confirmMsg)) return;
    
    try {
      const updated = await updateContact(
        contact.id,
        contactToUpdatePayload(contact, {
          foyer_id: null,
          role_foyer: null,
        })
      );
      onContactRefreshed?.(updated);
      onUpdate();
    } catch (error) {
      console.error("🏠 [ContactDetail] ❌ Erreur dissociation:", error);
      alert("Erreur lors de la dissociation: " + String(error));
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
    setDetailTab("synthese");
  }, [contact?.id]);

  // Charger les investissements du contact
  useEffect(() => {
    if (contact?.id && detailActive) {
      loadInvestissements();
      loadParrain();
      loadFilleuls();
      loadFoyer();
      loadEtiquettes();
    }
  }, [contact?.id, detailActive]);

  const loadEtiquettes = async () => {
    if (!contact?.id) return;
    try {
      const data = await getEtiquettesByContact(contact.id);
      setEtiquettes(data);
    } catch (error) {
      console.error("Error loading etiquettes:", error);
    }
  };

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

  const handleRemoveEtiquette = async (etiquetteId: number) => {
    if (!contact?.id) return;
    try {
      await retirerEtiquette(contact.id, etiquetteId);
      await loadEtiquettes();
      notifyEtiquettesChanged();
      toast.success("Étiquette retirée");
    } catch (error) {
      console.error("Error removing etiquette:", error);
      toast.error("Erreur lors du retrait de l'étiquette");
    }
  };

  const loadInvestissements = async () => {
    if (!contact?.id) return;
    
    setLoadingInvestissements(true);
    try {
      // Si le contact a un foyer, charger TOUS les investissements du foyer
      if (contact.foyer_id) {
        const [foyerInvs, allContacts] = await Promise.all([
          getInvestissementsByFoyer(contact.foyer_id),
          getAllContacts()
        ]);
        
        // Récupérer les investissements individuels de chaque membre du foyer
        const foyerContacts = allContacts.filter(c => c.foyer_id === contact.foyer_id);
        const membersInvs = await Promise.all(
          foyerContacts.map(async (member) => {
            if (!member.id) return [];
            const invs = await getInvestissementsByContact(member.id);
            // Ajouter l'info du propriétaire
            return invs.map(inv => ({
              ...inv,
              _proprietaire: `${member.prenom} ${member.nom}`,
              _proprietaireId: member.id,
            }));
          })
        );
        
        // Fusionner et ajouter l'info "Foyer" pour les investissements du foyer
        const allInvs = [
          ...foyerInvs.map(inv => ({ ...inv, _proprietaire: "Foyer", _proprietaireId: null })),
          ...membersInvs.flat(),
        ];
        
        setInvestissements(allInvs as any);
      } else {
        // Pas de foyer, juste les investissements du contact
        const data = await getInvestissementsByContact(contact.id);
        setInvestissements(data);
      }
    } catch (error) {
      console.error("Error loading investissements:", error);
    } finally {
      setLoadingInvestissements(false);
    }
  };

  const loadParrain = async () => {
    if (!contact?.parrain_id) {
      setParrain(null);
      return;
    }
    
    setLoadingParrain(true);
    try {
      const data = await getContactById(contact.parrain_id);
      setParrain(data);
    } catch (error) {
      console.error("Error loading parrain:", error);
      setParrain(null);
    } finally {
      setLoadingParrain(false);
    }
  };

  const loadFilleuls = async () => {
    if (!contact?.id) return;
    
    setLoadingFilleuls(true);
    try {
      const data = await getFilleulsByParrain(contact.id);
      setFilleuls(data);
    } catch (error) {
      console.error("Error loading filleuls:", error);
      setFilleuls([]);
    } finally {
      setLoadingFilleuls(false);
    }
  };

  const loadFoyer = async () => {
    if (!contact?.foyer_id) {
      setFoyer(null);
      setFoyerMembers([]);
      setFoyerPatrimoine(0);
      return;
    }
    
    setLoadingFoyer(true);
    try {
      const [foyers, allContacts] = await Promise.all([
        getAllFoyers(),
        getAllContacts()
      ]);
      
      const currentFoyer = foyers.find(f => f.id === contact.foyer_id);
      setFoyer(currentFoyer || null);
      
      // Récupérer les autres membres du foyer (sauf le contact actuel)
      const members = allContacts.filter(
        c => c.foyer_id === contact.foyer_id && c.id !== contact.id
      );
      setFoyerMembers(members);
      
      if (currentFoyer && contact.foyer_id) {
        const membres = getContactsForFoyer(allContacts, contact.foyer_id);
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

  // Calculer le total des encours
  const totalEncours = investissements.reduce(
    (total, inv) => total + (inv.montant_initial || 0),
    0
  );
  
  // Calculer le total "avec moi" (MON_CONSEIL uniquement)
  const totalEncoursAvecMoi = investissements
    .filter(inv => inv.origine === "MON_CONSEIL")
    .reduce((total, inv) => total + (inv.montant_initial || 0), 0);

  // Formatage des montants
  const formatEuro = formatEuroCentimes;

  const getPartenaireNom = (partenaireId?: number): string | null => {
    if (!partenaireId) return null;
    const partenaire = partenaires.find(p => p.id === partenaireId);
    return partenaire?.raison_sociale || null;
  };

  if (!contact) return null;

  const getContactStatusLabel = (c: Contact) => {
    const filleulLabel = getFilleulLabel(c.filleul_categorie);
    const clientLabel = getClientLabel(c.categorie);
    if (filleulLabel && clientLabel) return `${clientLabel} · ${filleulLabel}`;
    return filleulLabel || clientLabel || c.categorie;
  };

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case "ACTIF":
        return "bg-green-100 text-green-800";
      case "INACTIF":
        return "bg-red-100 text-red-800";
      case "EN_ATTENTE":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

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

  const handleInvestissementSuccess = () => {
    loadInvestissements();
    notifyEtiquettesChanged();
    handleInvestissementFormClose();
  };

  const titleText = formatCiviliteLabel(contact.civilite)
    ? `${formatCiviliteLabel(contact.civilite)} ${contact.prenom} ${contact.nom}`
    : `${contact.prenom} ${contact.nom}`;

  const headerBlock = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        {embedded ? (
          <h2 className="text-xl font-serif font-bold text-primary leading-tight">{titleText}</h2>
        ) : (
          <DialogTitle className="text-2xl">{titleText}</DialogTitle>
        )}
        {(formatSituationLabel(contact.situation_familiale) ||
          formatCiviliteLabel(contact.civilite)) && (
          <p className="text-sm text-muted-foreground mt-1">
            {[formatCiviliteLabel(contact.civilite), formatSituationLabel(contact.situation_familiale)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {!embedded && (
          <DialogDescription className="sr-only">
            Détails du contact et informations personnelles
          </DialogDescription>
        )}
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge
            className={getContactCategorieBadgeClass(
              contact.categorie,
              contact.filleul_categorie
            )}
          >
            {getContactStatusLabel(contact)}
          </Badge>
          <Badge className={getStatutColor(contact.statut_suivi)}>{contact.statut_suivi}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <EtiquetteList
            etiquettes={etiquettes.map((e) => ({
              id: e.etiquette_id,
              nom: e.etiquette_nom,
              couleur: e.etiquette_couleur,
            }))}
            onRemove={handleRemoveEtiquette}
            size="sm"
          />
          <EtiquetteSelector
            selectedIds={etiquettes.map((e) => e.etiquette_id)}
            onAdd={handleAddEtiquette}
            onRemove={handleRemoveEtiquette}
          />
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setShowEditForm(true)}
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
  );

  const tabsBlock = (
          <Tabs
            value={detailTab}
            onValueChange={(v) => setDetailTab(v as DetailTab)}
            className="w-full min-h-0 flex flex-col"
          >
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto shrink-0">
              <TabsTrigger value="synthese" className="gap-1.5 text-xs sm:text-sm py-2">
                <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                Synthèse
              </TabsTrigger>
              <TabsTrigger value="relation" className="gap-1.5 text-xs sm:text-sm py-2">
                <History className="h-3.5 w-3.5 shrink-0" />
                Relation
              </TabsTrigger>
              <TabsTrigger value="patrimoine" className="gap-1.5 text-xs sm:text-sm py-2">
                <Wallet className="h-3.5 w-3.5 shrink-0" />
                Patrimoine
              </TabsTrigger>
              <TabsTrigger value="foyer" className="gap-1.5 text-xs sm:text-sm py-2">
                <Network className="h-3.5 w-3.5 shrink-0" />
                Foyer & réseau
              </TabsTrigger>
            </TabsList>

            <TabsContent value="synthese" className="space-y-4 mt-3 focus-visible:outline-none">
            {/* Informations de contact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Informations de contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {contact.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-primary hover:underline"
                    >
                      {contact.email}
                    </a>
                  </div>
                )}
                {contact.telephone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`tel:${contact.telephone}`}
                      className="text-primary hover:underline"
                    >
                      {contact.telephone}
                    </a>
                  </div>
                )}
                {(contact.adresse || contact.ville) && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      {contact.adresse && <div>{contact.adresse}</div>}
                      {(contact.code_postal || contact.ville) && (
                        <div>
                          {contact.code_postal} {contact.ville}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Informations personnelles */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Informations personnelles
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {contact.civilite && (
                  <div>
                    <span className="text-muted-foreground text-sm">Civilité : </span>
                    {formatCiviliteLabel(contact.civilite)}
                  </div>
                )}
                {contact.situation_familiale && (
                  <div>
                    <span className="text-muted-foreground text-sm">Situation familiale : </span>
                    {formatSituationLabel(contact.situation_familiale)}
                  </div>
                )}
                {contact.profession && (
                  <div>
                    <span className="text-muted-foreground text-sm">Profession : </span>
                    {contact.profession}
                  </div>
                )}
                {contact.source_lead && (
                  <div>
                    <span className="text-muted-foreground text-sm">Source / lead : </span>
                    {contact.source_lead}
                  </div>
                )}
                {contact.profil_risque_sri && (
                  <div>
                    <span className="text-muted-foreground text-sm">Profil investisseur (SRI) : </span>
                    {contact.profil_risque_sri}
                  </div>
                )}
                {contact.date_naissance && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-muted-foreground text-sm">
                        Date de naissance:{" "}
                      </span>
                      {(() => {
                        try {
                          if (typeof contact.date_naissance === 'number') {
                            const date = new Date(contact.date_naissance * 1000);
                            // Utiliser UTC pour éviter décalage
                            return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
                          } else {
                            const date = new Date(contact.date_naissance);
                            return isNaN(date.getTime()) ? "Non renseignée" : date.toLocaleDateString("fr-FR");
                          }
                        } catch {
                          return "Non renseignée";
                        }
                      })()}
                    </div>
                  </div>
                )}
                {contact.profession && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-muted-foreground text-sm">
                        Profession:{" "}
                      </span>
                      {contact.profession}
                    </div>
                  </div>
                )}
                {contact.source_lead && (
                  <div className="flex items-start gap-2">
                    <div className="text-muted-foreground mt-0.5">📦</div>
                    <div>
                      <span className="text-muted-foreground text-sm">
                        Source / Produit:{" "}
                      </span>
                      {contact.source_lead}
                    </div>
                  </div>
                )}
                {contact.profil_risque_sri && (
                  <div className="flex items-center gap-2">
                    <div className="text-muted-foreground">📊</div>
                    <div>
                      <span className="text-muted-foreground text-sm">
                        Profil investisseur:{" "}
                      </span>
                      {contact.profil_risque_sri}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Suivi client */}
            {(contact.date_dernier_contact || contact.date_prochain_suivi) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Suivi client</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {contact.date_dernier_contact && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="text-muted-foreground text-sm">Dernier contact :</span>
                        <p className="font-medium text-blue-700">
                          {(() => {
                            try {
                              const date = new Date(contact.date_dernier_contact * 1000);
                              return isNaN(date.getTime()) ? "Aucun" : date.toLocaleDateString('fr-FR');
                            } catch {
                              return "Aucun";
                            }
                          })()}
                        </p>
                      </div>
                    </div>
                  )}
                  {contact.date_prochain_suivi && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="text-muted-foreground text-sm">Prochain suivi prévu le :</span>
                        <p className="font-medium text-orange-700">
                          {(() => {
                            try {
                              const date = new Date(contact.date_prochain_suivi * 1000);
                              return isNaN(date.getTime()) ? "Aucune date" : date.toLocaleDateString('fr-FR');
                            } catch {
                              return "Aucune date";
                            }
                          })()}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Suivi filleul */}
            {(contact.date_dernier_contact_filleul || contact.date_prochain_suivi_filleul) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Suivi filleul</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {contact.date_dernier_contact_filleul && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="text-muted-foreground text-sm">Dernier contact filleul :</span>
                        <p className="font-medium text-indigo-700">
                          {(() => {
                            try {
                              const date = new Date(contact.date_dernier_contact_filleul! * 1000);
                              return isNaN(date.getTime()) ? "Aucun" : date.toLocaleDateString("fr-FR");
                            } catch {
                              return "Aucun";
                            }
                          })()}
                        </p>
                      </div>
                    </div>
                  )}
                  {contact.date_prochain_suivi_filleul && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="text-muted-foreground text-sm">Prochain suivi filleul :</span>
                        <p className="font-medium text-orange-700">
                          {(() => {
                            try {
                              const date = new Date(contact.date_prochain_suivi_filleul! * 1000);
                              return isNaN(date.getTime()) ? "Aucune date" : date.toLocaleDateString("fr-FR");
                            } catch {
                              return "Aucune date";
                            }
                          })()}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {contact.notes ? (
                  <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans">
                    {contact.notes}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Aucune note pour ce contact
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Métadonnées */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informations système</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <div>
                  Créé le:{" "}
                  {new Date(contact.created_at * 1000).toLocaleString("fr-FR")}
                </div>
                <div>
                  Mis à jour le:{" "}
                  {new Date(contact.updated_at * 1000).toLocaleString("fr-FR")}
                </div>
              </CardContent>
            </Card>

            </TabsContent>

            <TabsContent value="relation" className="mt-3 focus-visible:outline-none">
            {contact.id && (
              <ContactInteractionsPanel
                contactId={contact.id}
                dateDernierContact={contact.date_dernier_contact}
                dateDernierContactFilleul={contact.date_dernier_contact_filleul}
                onContactUpdated={async () => {
                  if (contact.id) {
                    const refreshed = await getContactById(contact.id);
                    onContactRefreshed?.(refreshed);
                  }
                  onUpdate();
                }}
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

            </TabsContent>

            <TabsContent value="patrimoine" className="mt-3 focus-visible:outline-none">
            {/* Investissements */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      Investissements ({investissements.length})
                    </CardTitle>
                    {totalEncours > 0 && (
                      <div className="text-sm text-muted-foreground mt-1">
                        <p>
                          <InvestissementMetaRow tone="amount">
                            Avec moi : {formatEuro(totalEncoursAvecMoi)}
                          </InvestissementMetaRow>
                          {totalEncours > totalEncoursAvecMoi && (
                            <span className="text-gray-400 ml-2">
                              (Total: {formatEuro(totalEncours)})
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedInvestissement(null);
                      setShowInvestissementForm(true);
                    }}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingInvestissements ? (
                  <p className="text-sm text-muted-foreground">Chargement...</p>
                ) : investissements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun investissement enregistré
                  </p>
                ) : (
                  <div className="space-y-3">
                    {investissements.map((inv) => {
                      const invExt = inv as Investissement & {
                        _proprietaire?: string;
                        _proprietaireId?: number | null;
                      };
                      return (
                        <InvestissementCard
                          key={inv.id}
                          inv={inv}
                          partenaireNom={getPartenaireNom(inv.partenaire_id)}
                          proprietaireLabel={invExt._proprietaire}
                          proprietaireVariant={
                            invExt._proprietaireId === contact?.id
                              ? "self"
                              : invExt._proprietaire === "Foyer"
                                ? "foyer"
                                : "member"
                          }
                          actions={
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditInvestissement(inv)}
                                className="h-8 w-8"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteInvestissement(inv)}
                                className="h-8 w-8 text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            </TabsContent>

            <TabsContent value="foyer" className="space-y-4 mt-3 focus-visible:outline-none">
            {/* Section Foyer */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Home className="h-5 w-5" />
                  Foyer
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingFoyer ? (
                  <div className="text-sm text-muted-foreground">Chargement...</div>
                ) : foyer ? (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">{foyer.nom}</h3>
                        {foyerPatrimoine > 0 && (
                          <p className="text-sm text-primary font-medium">
                            Patrimoine commun (foyer) : {foyerPatrimoine.toLocaleString("fr-FR")} €
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Encours personnels : voir section Patrimoine ci-dessous
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setShowFoyerLinkModal(true)}
                        >
                          Modifier
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={handleDissocierFoyer}
                        >
                          Dissocier
                        </Button>
                      </div>
                    </div>
                    {foyerMembers.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Autres membres :</h4>
                        <div className="space-y-2">
                          {foyerMembers.map((member) => (
                            <div 
                              key={member.id}
                              className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                              onClick={() => handleOpenMemberDetail(member)}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">
                                    {member.prenom} {member.nom}
                                  </p>
                                  {member.role_foyer && (
                                    <p className="text-xs text-muted-foreground">
                                      {member.role_foyer === "DECLARANT_1" ? "Déclarant 1" :
                                       member.role_foyer === "DECLARANT_2" ? "Déclarant 2" :
                                       member.role_foyer === "ENFANT" ? "Enfant" : "Autre membre"}
                                    </p>
                                  )}
                                </div>
                                <Badge className="bg-blue-50 text-blue-700">
                                  {member.categorie}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Aucun foyer associé
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="gap-2"
                        onClick={() => setShowFoyerLinkModal(true)}
                      >
                        🔗 Lier à un foyer existant
                      </Button>
                      <Button 
                        size="sm" 
                        variant="default" 
                        className="gap-2"
                        onClick={() => setShowFoyerCreateModal(true)}
                      >
                        ➕ Créer un foyer
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Parrain (uniquement pour les catégories filleul) */}
            {/* 🔥 FIX: Vérifier filleul_categorie OU parrain_id (indépendant de categorie) */}
            {(contact.filleul_categorie === "FILLEUL" || 
              contact.filleul_categorie === "PROSPECT_FILLEUL" || 
              contact.filleul_categorie === "SUSPECT_FILLEUL" || 
              contact.filleul_categorie === "FILLEUL_DESINSCRIT" ||
              contact.parrain_id) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users2 className="h-5 w-5" />
                    Parrain
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingParrain ? (
                    <div className="text-sm text-muted-foreground">Chargement...</div>
                  ) : parrain ? (
                    <div
                      className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => handleOpenLinkedContact(parrain)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleOpenLinkedContact(parrain);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">
                            {parrain.prenom} {parrain.nom}
                          </p>
                          {parrain.email && (
                            <p className="text-sm text-muted-foreground">{parrain.email}</p>
                          )}
                          {parrain.telephone && (
                            <p className="text-sm text-muted-foreground">{parrain.telephone}</p>
                          )}
                        </div>
                        {/* 🔥 Affichage intelligent du statut du parrain */}
                        {/* categorie = statut commercial, filleul_categorie = statut réseau */}
                        <div className="flex flex-col gap-1 items-end">
                          {/* Badge Client si applicable (basé sur categorie) */}
                          {parrain.categorie === "CLIENT" && (
                            <Badge className="bg-green-100 text-green-800">
                              💼 Client
                            </Badge>
                          )}
                          {/* Badge Filleul (basé sur filleul_categorie - INDÉPENDANT) */}
                          {parrain.filleul_categorie === "FILLEUL_DESINSCRIT" ? (
                            <Badge className="bg-red-50 text-red-700">
                              ❌ Filleul désinscrit
                            </Badge>
                          ) : parrain.filleul_categorie ? (
                            <Badge className="bg-emerald-50 text-emerald-700">
                              ✅ Filleul inscrit
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : contact.parrain_id ? (
                    <div className="text-sm text-orange-600">
                      ⚠️ Parrain introuvable (ID: {contact.parrain_id})
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Aucun parrain renseigné
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Mes filleuls */}
            {filleuls.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users2 className="h-5 w-5" />
                      Mes filleuls ({filleuls.length})
                    </CardTitle>
                    <div className="text-sm text-muted-foreground">
                      {filleuls.filter(f => f.filleul_categorie === "FILLEUL").length} actif{filleuls.filter(f => f.filleul_categorie === "FILLEUL").length > 1 ? 's' : ''} • {' '}
                      {filleuls.filter(f => f.filleul_categorie === "PROSPECT_FILLEUL").length} prospect{filleuls.filter(f => f.filleul_categorie === "PROSPECT_FILLEUL").length > 1 ? 's' : ''} • {' '}
                      {filleuls.filter(f => f.filleul_categorie === "FILLEUL_DESINSCRIT").length} désinscrit{filleuls.filter(f => f.filleul_categorie === "FILLEUL_DESINSCRIT").length > 1 ? 's' : ''}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingFilleuls ? (
                    <div className="text-sm text-muted-foreground">Chargement...</div>
                  ) : (
                    <div className="space-y-2">
                      {filleuls.map((filleul) => (
                        <div
                          key={filleul.id}
                          className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                          onClick={() => handleOpenLinkedContact(filleul)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleOpenLinkedContact(filleul);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">
                                {filleul.prenom} {filleul.nom}
                              </p>
                              {filleul.date_dernier_contact_filleul && (() => {
                                try {
                                  const date = new Date(
                                    filleul.date_dernier_contact_filleul * 1000
                                  );
                                  return !isNaN(date.getTime()) ? (
                                    <p className="text-xs text-muted-foreground">
                                      Dernier suivi : {date.toLocaleDateString("fr-FR")}
                                    </p>
                                  ) : null;
                                } catch {
                                  return null;
                                }
                              })()}
                            </div>
                            <Badge 
                              className={
                                filleul.filleul_categorie === "FILLEUL" 
                                  ? "bg-purple-50 text-purple-700"
                                  : filleul.filleul_categorie === "PROSPECT_FILLEUL"
                                  ? "bg-cyan-50 text-cyan-700"
                                  : filleul.filleul_categorie === "SUSPECT_FILLEUL"
                                  ? "bg-orange-50 text-orange-700"
                                  : "bg-gray-50 text-gray-700"
                              }
                            >
                              {filleul.filleul_categorie === "FILLEUL" && "Filleul"}
                              {filleul.filleul_categorie === "PROSPECT_FILLEUL" && "Prospect"}
                              {filleul.filleul_categorie === "SUSPECT_FILLEUL" && "Suspect"}
                              {filleul.filleul_categorie === "FILLEUL_DESINSCRIT" && "Désinscrit"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            </TabsContent>
          </Tabs>
  );

  const modals = (
    <>
      {/* Formulaire de modification */}
      <ContactForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        contact={contact}
        createContext="detail"
        onOpenContact={onOpenContact}
        onSuccess={async () => {
          setShowEditForm(false);
          if (contact?.id) {
            try {
              const fresh = await getContactById(contact.id);
              onContactRefreshed?.(fresh);
            } catch (error) {
              console.error("Error refreshing contact after edit:", error);
            }
          }
          onUpdate();
        }}
      />

      {/* Formulaire d'ajout d'investissement */}
      <InvestissementForm
        open={showInvestissementForm}
        onOpenChange={handleInvestissementFormClose}
        investissement={selectedInvestissement}
        defaultContactId={contact?.id}
        onSuccess={handleInvestissementSuccess}
      />

      {/* Modales de gestion des foyers */}
      {contact && (
        <>
          <FoyerCreateModal
            open={showFoyerCreateModal}
            onOpenChange={setShowFoyerCreateModal}
            currentContact={contact}
            onSuccess={async () => {
              try {
                await getContactById(contact.id!);
                onUpdate();
              } catch (error) {
                console.error("Erreur rechargement contact:", error);
              }
            }}
          />
          <FoyerLinkModal
            open={showFoyerLinkModal}
            onOpenChange={setShowFoyerLinkModal}
            currentContact={contact}
            onSuccess={async () => {
              try {
                await getContactById(contact.id!);
                onUpdate();
              } catch (error) {
                console.error("Erreur rechargement contact:", error);
              }
            }}
          />
        </>
      )}

      <AlertDialog
        open={showDeleteContactDialog}
        onOpenChange={setShowDeleteContactDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce contact ?</AlertDialogTitle>
            <AlertDialogDescription>
              {contact && (
                <>
                  Vous allez supprimer{" "}
                  <strong>
                    {contact.prenom} {contact.nom}
                  </strong>
                  . Cette action est irréversible.
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
        <div className="flex flex-col h-full min-h-[420px] max-h-[calc(100vh-10rem)] rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden">
          <div className="shrink-0 border-b border-border/60 px-4 py-3">{headerBlock}</div>
          <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">{tabsBlock}</div>
        </div>
        {modals}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto shadow-md flex flex-col">
          <DialogHeader className="pr-12 shrink-0">{headerBlock}</DialogHeader>
          <div className="min-h-0">{tabsBlock}</div>
        </DialogContent>
      </Dialog>
      {modals}
    </>
  );
}
