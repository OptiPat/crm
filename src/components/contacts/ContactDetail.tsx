import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Phone, MapPin, Calendar, Briefcase, Edit, Trash2, User, Wallet, Plus, Users2 } from "lucide-react";
import { type Contact, getContactById, getFilleulsByParrain } from "@/lib/api/tauri-contacts";
import { ContactForm } from "./ContactForm";
import { getInvestissementsByContact, deleteInvestissement, type Investissement } from "@/lib/api/tauri-investissements";
import { getAllPartenaires, type Partenaire } from "@/lib/api/tauri-partenaires";
import { InvestissementForm } from "@/components/investissements/InvestissementForm";

interface ContactDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onDelete: (id: number) => void;
  onUpdate: () => void;
}

export function ContactDetail({
  open,
  onOpenChange,
  contact,
  onDelete,
  onUpdate,
}: ContactDetailProps) {
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

  // Charger les investissements du contact
  useEffect(() => {
    if (contact?.id && open) {
      loadInvestissements();
      loadParrain();
      loadFilleuls();
    }
  }, [contact?.id, open]);

  const loadInvestissements = async () => {
    if (!contact?.id) return;
    
    setLoadingInvestissements(true);
    try {
      const data = await getInvestissementsByContact(contact.id);
      setInvestissements(data);
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

  // Calculer le total des encours
  const totalEncours = investissements.reduce(
    (total, inv) => total + (inv.montant_initial || 0),
    0
  );

  // Formatage des montants
  const formatEuro = (centimes?: number) => {
    if (!centimes) return "-";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(centimes / 100);
  };

  // Formatage du nom de produit (transformer ASSURANCE_VIE en Assurance Vie)
  const formatNomProduit = (nom: string) => {
    // Map des types de produits vers leurs labels lisibles
    const typeLabels: Record<string, string> = {
      "SCPI": "SCPI",
      "SCPI_DEMEMBREMENT": "SCPI Démembrement",
      "ASSURANCE_VIE": "Assurance Vie",
      "PER": "PER",
      "IMMOBILIER": "Immobilier",
      "FIP_FCPI": "FIP/FCPI",
      "FCPR": "FCPR",
      "G3F": "G3F",
      "PINEL": "Pinel",
      "AUTRE": "Autre",
    };
    // Si c'est un type connu, utiliser le label
    if (typeLabels[nom]) {
      return typeLabels[nom];
    }
    // Sinon, formater proprement (remplacer _ par espace et capitaliser)
    return nom
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  // Couleurs des badges par type de produit
  const getTypeProduitColor = (type: string, origine?: string) => {
    // Si "à côté" (existant client) → texte gris foncé sur fond gris
    if (origine === "EXISTANT_CLIENT") {
      return "text-gray-700";
    }
    // Immobilier : #85ad39 (vert)
    if (type === "IMMOBILIER") {
      return "text-white";
    }
    // Placements financiers : #dc216e (rose foncé)
    return "text-white";
  };
  
  const getTypeProduitBgColor = (type: string, origine?: string) => {
    // Si "à côté" (existant client) → gris
    if (origine === "EXISTANT_CLIENT") {
      return "#9ca3af"; // gray-400
    }
    // Immobilier : #85ad39 (vert)
    if (type === "IMMOBILIER") {
      return "#85ad39";
    }
    // Placements financiers : #dc216e (rose foncé)
    return "#dc216e";
  };

  const getPartenaireNom = (partenaireId?: number): string | null => {
    if (!partenaireId) return null;
    const partenaire = partenaires.find(p => p.id === partenaireId);
    return partenaire?.raison_sociale || null;
  };

  if (!contact) return null;

  const getCategorieColor = (categorie: string) => {
    switch (categorie) {
      case "CLIENT":
        return "bg-green-100 text-green-800";
      case "PROSPECT":
        return "bg-blue-100 text-blue-800";
      case "ANCIEN_CLIENT":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
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

  const handleDelete = () => {
    if (
      window.confirm(
        `Êtes-vous sûr de vouloir supprimer ${contact.prenom} ${contact.nom} ?`
      )
    ) {
      onDelete(contact.id);
      onOpenChange(false);
    }
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
    loadInvestissements(); // Recharger la liste
    handleInvestissementFormClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-2xl">
                  {contact.prenom} {contact.nom}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Détails du contact et informations personnelles
                </DialogDescription>
                <div className="flex gap-2 mt-2">
                  <Badge className={getCategorieColor(contact.categorie)}>
                    {contact.categorie}
                  </Badge>
                  <Badge className={getStatutColor(contact.statut_suivi)}>
                    {contact.statut_suivi}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowEditForm(true)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleDelete}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* DEBUG : Affichage des données brutes */}
          <div className="bg-gray-100 border border-gray-300 rounded p-3 text-xs font-mono overflow-auto max-h-40">
            <div><strong>ID:</strong> {contact.id}</div>
            <div><strong>Nom:</strong> {contact.nom}</div>
            <div><strong>Prénom:</strong> {contact.prenom}</div>
            {contact.email && <div><strong>Email:</strong> {contact.email}</div>}
            {contact.telephone && <div><strong>Téléphone:</strong> {contact.telephone}</div>}
            {contact.profession && <div><strong>Profession:</strong> {contact.profession}</div>}
            {contact.source_lead && <div><strong>Source/Produit:</strong> {contact.source_lead}</div>}
            {contact.profil_risque_sri && <div><strong>Profil risque:</strong> {contact.profil_risque_sri}</div>}
            {contact.notes && <div><strong>Notes:</strong> {contact.notes.substring(0, 100)}{contact.notes.length > 100 ? '...' : ''}</div>}
          </div>

          <div className="space-y-4">
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

            {/* Parrain (uniquement pour les catégories filleul) */}
            {(contact.categorie === "FILLEUL" || 
              contact.categorie === "PROSPECT_FILLEUL" || 
              contact.categorie === "SUSPECT_FILLEUL" || 
              contact.categorie === "FILLEUL_DESINSCRIT") && (
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
                      onClick={() => {
                        // TODO: Ouvrir la fiche du parrain
                      }}
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
                        <Badge className="bg-blue-50 text-blue-700">
                          {parrain.categorie}
                        </Badge>
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
                      {filleuls.filter(f => f.categorie === "FILLEUL").length} actif{filleuls.filter(f => f.categorie === "FILLEUL").length > 1 ? 's' : ''} • {' '}
                      {filleuls.filter(f => f.categorie === "PROSPECT_FILLEUL").length} prospect{filleuls.filter(f => f.categorie === "PROSPECT_FILLEUL").length > 1 ? 's' : ''} • {' '}
                      {filleuls.filter(f => f.categorie === "FILLEUL_DESINSCRIT").length} désinscrit{filleuls.filter(f => f.categorie === "FILLEUL_DESINSCRIT").length > 1 ? 's' : ''}
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
                          onClick={() => {
                            // TODO: Ouvrir la fiche du filleul
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">
                                {filleul.prenom} {filleul.nom}
                              </p>
                              {filleul.date_dernier_contact && (() => {
                                try {
                                  const date = new Date(filleul.date_dernier_contact);
                                  return !isNaN(date.getTime()) ? (
                                    <p className="text-xs text-muted-foreground">
                                      Dernier suivi : {date.toLocaleDateString('fr-FR')}
                                    </p>
                                  ) : null;
                                } catch {
                                  return null;
                                }
                              })()}
                            </div>
                            <Badge 
                              className={
                                filleul.categorie === "FILLEUL" 
                                  ? "bg-purple-50 text-purple-700"
                                  : filleul.categorie === "PROSPECT_FILLEUL"
                                  ? "bg-cyan-50 text-cyan-700"
                                  : filleul.categorie === "SUSPECT_FILLEUL"
                                  ? "bg-orange-50 text-orange-700"
                                  : "bg-gray-50 text-gray-700"
                              }
                            >
                              {filleul.categorie === "FILLEUL" && "Filleul"}
                              {filleul.categorie === "PROSPECT_FILLEUL" && "Prospect"}
                              {filleul.categorie === "SUSPECT_FILLEUL" && "Suspect"}
                              {filleul.categorie === "FILLEUL_DESINSCRIT" && "Désinscrit"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Suivi */}
            {(contact.date_dernier_contact || contact.date_prochain_suivi) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Suivi</CardTitle>
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
                      <p className="text-sm text-muted-foreground mt-1">
                        Total encours : <span className="font-semibold text-primary">{formatEuro(totalEncours)}</span>
                      </p>
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
                    {investissements.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3 border border-border rounded-lg hover:bg-accent transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge 
                                className={getTypeProduitColor(inv.type_produit, inv.origine) + " text-base px-3 py-1"}
                                style={{ backgroundColor: getTypeProduitBgColor(inv.type_produit, inv.origine) }}
                              >
                                {formatNomProduit(inv.nom_produit)}
                              </Badge>
                              {inv.origine === "EXISTANT_CLIENT" && (
                                <span className="text-xs text-gray-500 italic">à côté</span>
                              )}
                            </div>
                            {getPartenaireNom(inv.partenaire_id) && (
                              <p className="text-sm text-muted-foreground">
                                📋 {getPartenaireNom(inv.partenaire_id)}
                              </p>
                            )}
                            <div className="text-sm text-muted-foreground flex gap-4 flex-wrap">
                              <span className="font-medium text-primary">
                                💰 {formatEuro(inv.montant_initial)}
                              </span>
                              {inv.date_souscription && (
                                <span>
                                  📅 {new Date(inv.date_souscription * 1000).toLocaleDateString("fr-FR")}
                                </span>
                              )}
                              {inv.montant_versement_programme && inv.montant_versement_programme > 0 && (
                                <span className="font-medium text-orange-600">
                                  🔁 VP: {formatEuro(inv.montant_versement_programme)}
                                  {inv.frequence_versement && ` (${inv.frequence_versement})`}
                                </span>
                              )}
                              {inv.notes?.match(/Mode de détention:\s*([^\|]+)/i) && (
                                <span className="font-medium text-slate-600">
                                  🏷️ {inv.notes.match(/Mode de détention:\s*([^\|]+)/i)?.[1].trim()}
                                </span>
                              )}
                              {inv.notes?.match(/Durée:\s*([^\|]+)/i) && (
                                <span className="font-medium text-purple-600">
                                  {(() => {
                                    const dureeStr = inv.notes.match(/Durée:\s*([^\|]+)/i)?.[1].trim();
                                    
                                    if (dureeStr?.toLowerCase().includes('viager')) {
                                      return "🔄 Viager";
                                    } else if (dureeStr) {
                                      const dureeMatch = dureeStr.match(/(\d+)\s*ans/i);
                                      if (dureeMatch && dureeMatch[1] && inv.date_fin_demembrement) {
                                        const duree = dureeMatch[1];
                                        const dateFin = new Date(inv.date_fin_demembrement * 1000).toLocaleDateString("fr-FR");
                                        return `🔄 ${duree} ans → 📅 ${dateFin}`;
                                      }
                                    }
                                    return null;
                                  })()}
                                </span>
                              )}
                              {inv.reinvestissement_dividendes && (
                                <span className="font-medium text-green-600">
                                  📈 Réinv. {(() => {
                                    const match = inv.notes?.match(/(\d+)%/);
                                    return match && match[1] ? `${match[1]}%` : "100%";
                                  })()}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
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
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

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
          </div>
        </DialogContent>
      </Dialog>

      {/* Formulaire de modification */}
      <ContactForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        contact={contact}
        onSuccess={async () => {
          setShowEditForm(false);
          // Fermer le ContactDetail pour forcer un rechargement complet
          onOpenChange(false);
          // Recharger la liste des contacts
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
    </>
  );
}
