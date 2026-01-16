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
} from "lucide-react";
import { type Contact } from "@/lib/api/tauri-contacts";
import { ContactForm } from "./ContactForm";
import { getInvestissementsByContact, type Investissement } from "@/lib/api/tauri-investissements";
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
  const [investissements, setInvestissements] = useState<Investissement[]>([]);
  const [loadingInvestissements, setLoadingInvestissements] = useState(false);

  // Charger les investissements du contact
  useEffect(() => {
    if (contact?.id && open) {
      loadInvestissements();
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

  // Couleurs des badges par type de produit
  const getTypeProduitColor = (type: string) => {
    switch (type) {
      case "SCPI":
        return "bg-blue-100 text-blue-800";
      case "SCPI_DEMEMBREMENT":
        return "bg-purple-100 text-purple-800";
      case "ASSURANCE_VIE":
        return "bg-green-100 text-green-800";
      case "PER":
        return "bg-emerald-100 text-emerald-800";
      case "IMMOBILIER":
        return "bg-amber-100 text-amber-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (!contact) return null;

  console.log("ContactDetail rendering for:", contact.id, contact.prenom, contact.nom, contact.email, contact.telephone);

  // Parser les notes pour extraire les produits
  const parseProducts = (notes: string | null | undefined) => {
    if (!notes) return { products: [], comments: "" };
    
    const sections = notes.split('---').map(s => s.trim());
    const products: Array<{ 
      produit?: string; 
      partenaire?: string; 
      date?: string; 
      montant?: string;
      montantVP?: string;
      modeDetention?: string;
      reinvestissement?: string;
    }> = [];
    const comments: string[] = [];
    
    sections.forEach(section => {
      const lines = section.split('\n').map(l => l.trim()).filter(l => l);
      const productData: any = {};
      let isProduct = false;
      
      lines.forEach(line => {
        if (line.startsWith('Produit:')) {
          productData.produit = line.replace('Produit:', '').trim();
          isProduct = true;
        } else if (line.startsWith('Partenaire:')) {
          productData.partenaire = line.replace('Partenaire:', '').trim();
          isProduct = true;
        } else if (line.startsWith('Date de souscription:') || line.startsWith('Date:')) {
          productData.date = line.replace('Date de souscription:', '').replace('Date:', '').trim();
          isProduct = true;
        } else if (line.startsWith('Montant souscrit:') || line.startsWith('Montant:')) {
          productData.montant = line.replace('Montant souscrit:', '').replace('Montant:', '').trim();
          isProduct = true;
        } else if (line.startsWith('Montant VP:')) {
          productData.montantVP = line.replace('Montant VP:', '').trim();
          isProduct = true;
        } else if (line.startsWith('Mode de détention:')) {
          productData.modeDetention = line.replace('Mode de détention:', '').trim();
          isProduct = true;
        } else if (line.startsWith('Réinvestissement dividendes:')) {
          productData.reinvestissement = line.replace('Réinvestissement dividendes:', '').trim();
          isProduct = true;
        } else if (!isProduct) {
          comments.push(line);
        }
      });
      
      if (isProduct && Object.keys(productData).length > 0) {
        products.push(productData);
      } else if (!isProduct && lines.length > 0) {
        comments.push(...lines);
      }
    });
    
    return { products, comments: comments.join('\n').trim() };
  };

  const { products, comments } = parseProducts(contact.notes);

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
                <DialogDescription className="flex gap-2 mt-2">
                  <Badge className={getCategorieColor(contact.categorie)}>
                    {contact.categorie}
                  </Badge>
                  <Badge className={getStatutColor(contact.statut_suivi)}>
                    {contact.statut_suivi}
                  </Badge>
                </DialogDescription>
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
            {contact.notes && (
              <>
                {products.length > 0 && <div><strong>Produits:</strong> {products.length} souscription{products.length > 1 ? 's' : ''}</div>}
                {comments && <div><strong>Commentaires:</strong> {comments.substring(0, 50)}{comments.length > 50 ? '...' : ''}</div>}
              </>
            )}
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
                      {new Date(contact.date_naissance + "T00:00:00").toLocaleDateString(
                        "fr-FR"
                      )}
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
                          {new Date(parseInt(contact.date_dernier_contact) * 1000).toLocaleDateString('fr-FR')}
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
                          {new Date(parseInt(contact.date_prochain_suivi) * 1000).toLocaleDateString('fr-FR')}
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
                    onClick={() => setShowInvestissementForm(true)}
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
                              <p className="font-semibold">{inv.nom_produit}</p>
                              <Badge className={getTypeProduitColor(inv.type_produit)}>
                                {inv.type_produit}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground flex gap-4">
                              <span className="font-medium text-primary">
                                {formatEuro(inv.montant_initial)}
                              </span>
                              {inv.date_souscription && (
                                <span>
                                  {new Date(inv.date_souscription * 1000).toLocaleDateString("fr-FR")}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {inv.versement_programme && (
                                <Badge variant="outline" className="text-xs">
                                  VP
                                </Badge>
                              )}
                              {inv.reinvestissement_dividendes && (
                                <Badge variant="outline" className="text-xs">
                                  {inv.notes?.match(/Réinv\. (\d+)%/)?.[0] || "Réinv. 100%"}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Produits souscrits */}
            {products.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Produits souscrits ({products.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {products.map((product, index) => {
                    // Déterminer le type de produit pour la couleur
                    const produitStr = product.produit?.toUpperCase() || '';
                    
                    // Produits financiers : AV, SCPI, PER, FIP, FCPI, G3F
                    const isFinancialProduct = 
                      produitStr.includes('AV') ||
                      produitStr.includes('SCPI') ||
                      produitStr.includes('PER') ||
                      produitStr.includes('FIP') ||
                      produitStr.includes('FCPI') ||
                      produitStr.includes('G3F') ||
                      produitStr.includes('ASSURANCE');
                    
                    // Produits immobiliers : Pinel, Immobilier, Malraux, Denormandie, Deficit Foncier, Monument Historique, Colocation, LMNP, Nue
                    const isRealEstateProduct = 
                      produitStr.includes('PINEL') ||
                      produitStr.includes('IMMOBILIER') ||
                      produitStr.includes('MALRAUX') ||
                      produitStr.includes('DENORMANDIE') ||
                      produitStr.includes('DEFICIT') ||
                      produitStr.includes('FONCIER') ||
                      produitStr.includes('MONUMENT') ||
                      produitStr.includes('HISTORIQUE') ||
                      produitStr.includes('COLOCATION') ||
                      produitStr.includes('LMNP') ||
                      produitStr.includes('NUE');
                    
                    let borderColor, bgColor, textColor;
                    
                    if (isFinancialProduct) {
                      // Couleur rose/magenta pour produits financiers
                      borderColor = '#dc216e';
                      bgColor = 'rgba(220, 33, 110, 0.1)';
                      textColor = '#8b134e';
                    } else if (isRealEstateProduct) {
                      // Couleur verte pour produits immobiliers
                      borderColor = '#85ad39';
                      bgColor = 'rgba(133, 173, 57, 0.1)';
                      textColor = '#5a7327';
                    } else {
                      // Couleur bleue par défaut
                      borderColor = 'rgb(59, 130, 246)';
                      bgColor = 'rgb(239, 246, 255)';
                      textColor = 'rgb(30, 64, 175)';
                    }
                    
                    return (
                      <div 
                        key={index} 
                        className="pl-4 py-2 rounded-r"
                        style={{ 
                          borderLeft: `4px solid ${borderColor}`,
                          backgroundColor: bgColor
                        }}
                      >
                        <div className="grid grid-cols-2 gap-2 text-sm" style={{ color: textColor }}>
                        {product.produit && (
                          <div>
                            <span className="text-xs opacity-70">Produit:</span>
                            <p className="font-semibold">{product.produit}</p>
                          </div>
                        )}
                        {product.partenaire && (
                          <div>
                            <span className="text-xs opacity-70">Partenaire:</span>
                            <p className="font-semibold">{product.partenaire}</p>
                          </div>
                        )}
                        {product.date && (
                          <div>
                            <span className="text-xs opacity-70">Date de souscription:</span>
                            <p className="font-medium">{product.date}</p>
                          </div>
                        )}
                        {product.montant && (
                          <div>
                            <span className="text-xs opacity-70">Montant souscrit:</span>
                            <p className="font-medium" style={{ color: 'rgb(34, 139, 34)' }}>{product.montant}</p>
                          </div>
                        )}
                        {product.montantVP && (
                          <div>
                            <span className="text-xs opacity-70">Montant VP:</span>
                            <p className="font-medium" style={{ color: 'rgb(34, 139, 34)' }}>{product.montantVP}</p>
                          </div>
                        )}
                        {product.modeDetention && (
                          <div>
                            <span className="text-xs opacity-70">Mode de détention:</span>
                            <p className="font-medium">{product.modeDetention}</p>
                          </div>
                        )}
                        {product.reinvestissement && (
                          <div className="col-span-2">
                            <span className="text-xs opacity-70">Réinvestissement dividendes:</span>
                            <p className="font-medium">{product.reinvestissement}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Commentaires / Notes */}
            {comments && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Commentaires</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{comments}</p>
                </CardContent>
              </Card>
            )}

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
        onSuccess={() => {
          onUpdate();
          setShowEditForm(false);
        }}
      />

      {/* Formulaire d'ajout d'investissement */}
      <InvestissementForm
        open={showInvestissementForm}
        onOpenChange={setShowInvestissementForm}
        investissement={null}
        defaultContactId={contact?.id}
        onSuccess={loadInvestissements}
      />
    </>
  );
}
