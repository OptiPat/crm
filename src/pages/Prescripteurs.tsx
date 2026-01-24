import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Users, ChevronDown, ChevronUp, ChevronRight, TrendingUp, Eye, EyeOff } from "lucide-react";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getInvestissementsByContact, getInvestissementsByFoyer, type Investissement } from "@/lib/api/tauri-investissements";

// 🎨 Couleurs des investissements (mêmes que Familles)
const getTypeProduitBgColor = (type: string, origine?: string): string => {
  if (origine === "EXISTANT_CLIENT") return "#9ca3af"; // gray-400
  if (type === "IMMOBILIER") return "#85ad39"; // vert
  return "#dc216e"; // rose foncé
};

// 🎨 Couleurs par niveau de l'arbre
const getNiveauStyles = (niveau: number): { bg: string; border: string; text: string } => {
  switch (niveau) {
    case 0:
      return { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-900" };
    case 1:
      return { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-800" };
    case 2:
      return { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700" };
    default:
      return { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-600" };
  }
};

// Interface pour investissement avec flag "commun" et propriétaire
interface InvestWithCommun extends Investissement {
  isCommun: boolean;
  ownerName?: string; // Prénom du propriétaire (pour investissements perso dans un foyer)
}

// Interface pour un nœud de l'arbre de prescriptions
interface PrescripteurNode {
  contact: Contact;
  patrimoine: number;
  investissements: InvestWithCommun[];
  clientsRecommandes: PrescripteurNode[];
  niveau: number;
}

// Interface pour les stats d'un prescripteur
interface PrescripteurStats {
  contact: Contact;
  patrimoinePersonnel: number;
  nombreClientsDirects: number;
  patrimoineApporteTotal: number;
  nombreClientsTotal: number;
}

// Interface pour les infos d'un foyer
interface FoyerInfo {
  id: number;
  nom: string; // Nom de famille commun
  membres: Contact[];
  displayName: string; // "Foyer B (Didier + Sylvie)"
}

export function Prescripteurs() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissementsByContact, setInvestissementsByContact] = useState<Record<number, Investissement[]>>({});
  const [investissementsByFoyer, setInvestissementsByFoyer] = useState<Record<number, Investissement[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPrescripteurs, setExpandedPrescripteurs] = useState<Set<number>>(new Set());
  const [expandedInvestissements, setExpandedInvestissements] = useState<Set<number>>(new Set()); // Mode compact

  useEffect(() => {
    loadData();
  }, []);

  // 🏠 Construire les infos des foyers
  const foyersInfo = useMemo<Record<number, FoyerInfo>>(() => {
    const foyers: Record<number, FoyerInfo> = {};
    
    // Grouper les contacts par foyer_id
    contacts.forEach(contact => {
      if (contact.foyer_id) {
        if (!foyers[contact.foyer_id]) {
          foyers[contact.foyer_id] = {
            id: contact.foyer_id,
            nom: contact.nom,
            membres: [],
            displayName: "",
          };
        }
        foyers[contact.foyer_id].membres.push(contact);
      }
    });
    
    // Construire le displayName pour chaque foyer
    Object.values(foyers).forEach(foyer => {
      const prenoms = foyer.membres.map(m => m.prenom).join(" + ");
      foyer.displayName = `🏠 Foyer ${foyer.nom} (${prenoms})`;
    });
    
    return foyers;
  }, [contacts]);

  // Helper pour obtenir le displayName d'un contact (foyer ou individuel)
  const getContactDisplayName = (contact: Contact): string => {
    if (contact.foyer_id && foyersInfo[contact.foyer_id]) {
      const foyer = foyersInfo[contact.foyer_id];
      // Si c'est le premier membre du foyer, afficher le nom du foyer
      if (foyer.membres[0]?.id === contact.id) {
        return foyer.displayName;
      }
    }
    return `👤 ${contact.prenom} ${contact.nom}`;
  };

  // Helper pour vérifier si un contact match la recherche (incluant foyer)
  const contactMatchesSearch = (contact: Contact, query: string): boolean => {
    const q = query.toLowerCase();
    
    // Match direct sur nom/prénom
    if (contact.nom.toLowerCase().includes(q) || contact.prenom.toLowerCase().includes(q)) {
      return true;
    }
    
    // Match sur le foyer (tous les membres)
    if (contact.foyer_id && foyersInfo[contact.foyer_id]) {
      const foyer = foyersInfo[contact.foyer_id];
      // Match sur le nom de famille du foyer
      if (foyer.nom.toLowerCase().includes(q)) {
        return true;
      }
      // Match sur les prénoms des membres du foyer
      if (foyer.membres.some(m => m.prenom.toLowerCase().includes(q))) {
        return true;
      }
    }
    
    return false;
  };

  const loadData = async () => {
    try {
      const dataContacts = await getAllContacts();
      setContacts(dataContacts);

      // Charger les investissements par contact
      const investsByContact: Record<number, Investissement[]> = {};
      const investsByFoyer: Record<number, Investissement[]> = {};

      await Promise.all(
        dataContacts.map(async (contact) => {
          try {
            const invests = await getInvestissementsByContact(contact.id);
            investsByContact[contact.id] = invests;
          } catch {
            investsByContact[contact.id] = [];
          }
        })
      );

      // Charger les investissements par foyer (pour les investissements communs)
      const foyerIds = new Set(dataContacts.map(c => c.foyer_id).filter(Boolean));
      await Promise.all(
        Array.from(foyerIds).map(async (foyerId) => {
          if (foyerId) {
            try {
              const invests = await getInvestissementsByFoyer(foyerId);
              investsByFoyer[foyerId] = invests;
            } catch {
              investsByFoyer[foyerId] = [];
            }
          }
        })
      );

      setInvestissementsByContact(investsByContact);
      setInvestissementsByFoyer(investsByFoyer);
      setLoading(false);
    } catch (error) {
      console.error("Erreur chargement données:", error);
      setLoading(false);
    }
  };

  // Calculer le patrimoine et investissements d'un contact
  // foyersProcessed: Set pour tracker les foyers dont les investissements ont déjà été attribués
  const getContactPatrimoineWithInvests = (
    contact: Contact, 
    foyersProcessed: Set<number>
  ): { total: number; investissements: InvestWithCommun[]; foyerAdded: boolean } => {
    let total = 0;
    let allInvests: InvestWithCommun[] = [];
    let foyerAdded = false;
    
    // Si le contact fait partie d'un foyer ET que le foyer n'a pas encore été traité
    if (contact.foyer_id && !foyersProcessed.has(contact.foyer_id) && foyersInfo[contact.foyer_id]) {
      const foyer = foyersInfo[contact.foyer_id];
      
      // 🏠 Ajouter les investissements personnels de TOUS les membres du foyer
      foyer.membres.forEach(membre => {
        const membreInvests = investissementsByContact[membre.id] || [];
        const membreTotal = membreInvests.reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
        total += membreTotal;
        
        // Marquer chaque investissement avec le nom du propriétaire
        allInvests = [
          ...allInvests,
          ...membreInvests.map(inv => ({ 
            ...inv, 
            isCommun: false, 
            ownerName: membre.prenom // Ex: "Didier" ou "Sylvie"
          }))
        ];
      });
      
      // Ajouter les investissements communs du foyer
      const foyerInvests = investissementsByFoyer[contact.foyer_id] || [];
      const foyerOnlyInvests = foyerInvests.filter(inv => !inv.contact_id);
      const foyerTotal = foyerOnlyInvests.reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
      total += foyerTotal;
      
      // Marquer les investissements foyer comme COMMUNS
      allInvests = [
        ...allInvests, 
        ...foyerOnlyInvests.map(inv => ({ ...inv, isCommun: true }))
      ];
      
      foyerAdded = true;
    } else {
      // Contact individuel (pas de foyer ou foyer déjà traité)
      const contactInvests = investissementsByContact[contact.id] || [];
      total = contactInvests.reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
      allInvests = contactInvests.map(inv => ({ ...inv, isCommun: false }));
    }
    
    return { total, investissements: allInvests, foyerAdded };
  };

  // 🏠 Option B: Trouver les membres du même foyer (pour éviter doublons)
  const getFoyerMembersIds = (foyerId: number | undefined): Set<number> => {
    if (!foyerId) return new Set();
    return new Set(contacts.filter(c => c.foyer_id === foyerId).map(c => c.id));
  };

  // Construire l'arbre des prescriptions récursivement
  const buildPrescripteurTree = (
    prescripteur: Contact, 
    niveau: number = 0, 
    visitedIds: Set<number> = new Set(),
    foyersProcessed: Set<number> = new Set(),
    foyerMembersInTree: Set<number> = new Set() // 🏠 Option B: membres de foyers déjà dans l'arbre
  ): PrescripteurNode => {
    // Éviter les boucles infinies
    if (visitedIds.has(prescripteur.id)) {
      return {
        contact: prescripteur,
        patrimoine: 0,
        investissements: [],
        clientsRecommandes: [],
        niveau,
      };
    }
    
    const newVisitedIds = new Set(visitedIds);
    newVisitedIds.add(prescripteur.id);
    
    // 🏠 Option B: Marquer les membres du foyer comme "dans l'arbre"
    const newFoyerMembersInTree = new Set(foyerMembersInTree);
    if (prescripteur.foyer_id) {
      const foyerMembers = getFoyerMembersIds(prescripteur.foyer_id);
      foyerMembers.forEach(id => newFoyerMembersInTree.add(id));
    }
    
    // Calculer patrimoine (en passant foyersProcessed pour éviter double comptage)
    const { total, investissements, foyerAdded } = getContactPatrimoineWithInvests(prescripteur, foyersProcessed);
    
    // Si on a ajouté les investissements du foyer, marquer ce foyer comme traité
    if (foyerAdded && prescripteur.foyer_id) {
      foyersProcessed.add(prescripteur.foyer_id);
    }
    
    // Trouver tous les contacts recommandés par ce prescripteur
    // 🏠 Option B: Exclure les membres du même foyer déjà présents dans l'arbre
    const clientsRecommandes = contacts.filter(c => 
      c.prescripteur_id === prescripteur.id && 
      !newFoyerMembersInTree.has(c.id) // Exclure si déjà dans l'arbre via le foyer
    );
    
    return {
      contact: prescripteur,
      patrimoine: total,
      investissements,
      clientsRecommandes: clientsRecommandes.map(client => 
        buildPrescripteurTree(client, niveau + 1, newVisitedIds, foyersProcessed, newFoyerMembersInTree)
      ),
      niveau,
    };
  };

  // Calculer le patrimoine total d'un arbre
  const calculateTreePatrimoine = (node: PrescripteurNode): number => {
    let total = node.patrimoine;
    for (const child of node.clientsRecommandes) {
      total += calculateTreePatrimoine(child);
    }
    return total;
  };

  // Compter le nombre total de clients dans un arbre
  const countTreeClients = (node: PrescripteurNode): number => {
    let count = node.clientsRecommandes.length;
    for (const child of node.clientsRecommandes) {
      count += countTreeClients(child);
    }
    return count;
  };

  // Trouver tous les prescripteurs "racines"
  const prescripteursRacines = useMemo<PrescripteurStats[]>(() => {
    // Un prescripteur racine est quelqu'un qui :
    // 1. A recommandé au moins un client (quelqu'un a son ID comme prescripteur_id)
    // 2. N'a pas de prescripteur lui-même (prescripteur_id est null)
    // OU
    // 3. A la catégorie "PRESCRIPTEUR" (créé manuellement comme prescripteur)
    
    const prescripteurIds = new Set(
      contacts
        .filter(c => c.prescripteur_id)
        .map(c => c.prescripteur_id!)
    );
    
    const racines = contacts.filter(c => 
      // Soit il a recommandé quelqu'un et n'a pas été recommandé lui-même
      (prescripteurIds.has(c.id) && !c.prescripteur_id) ||
      // Soit c'est un prescripteur créé manuellement (catégorie PRESCRIPTEUR)
      (c.categorie === "PRESCRIPTEUR" && !c.prescripteur_id)
    );
    
    return racines.map(prescripteur => {
      // Créer un nouveau Set pour chaque arbre (ne pas réutiliser entre prescripteurs)
      const foyersProcessedForTree = new Set<number>();
      const foyerMembersInTree = new Set<number>();
      const tree = buildPrescripteurTree(prescripteur, 0, new Set(), foyersProcessedForTree, foyerMembersInTree);
      
      // Calculer le patrimoine personnel avec un nouveau Set (pour les stats affichées)
      const { total: patrimoinePersonnel } = getContactPatrimoineWithInvests(prescripteur, new Set());
      
      // 🏠 Option B: Compter les clients directs en excluant les doublons de foyer
      const clientsDirects = contacts.filter(c => c.prescripteur_id === prescripteur.id);
      const foyersVus = new Set<number>();
      let nombreClientsDirectsSansFoyerDoublons = 0;
      for (const client of clientsDirects) {
        if (client.foyer_id) {
          if (!foyersVus.has(client.foyer_id)) {
            foyersVus.add(client.foyer_id);
            nombreClientsDirectsSansFoyerDoublons++;
          }
          // Si foyer déjà vu, on ne compte pas ce client
        } else {
          nombreClientsDirectsSansFoyerDoublons++;
        }
      }
      
      return {
        contact: prescripteur,
        patrimoinePersonnel,
        nombreClientsDirects: nombreClientsDirectsSansFoyerDoublons,
        patrimoineApporteTotal: calculateTreePatrimoine(tree) - patrimoinePersonnel,
        nombreClientsTotal: countTreeClients(tree),
      };
    }).sort((a, b) => b.patrimoineApporteTotal - a.patrimoineApporteTotal);
  }, [contacts, investissementsByContact, investissementsByFoyer]);

  // Filtrer les prescripteurs (avec recherche par foyer)
  const filteredPrescripteurs = useMemo(() => {
    if (!searchQuery) return prescripteursRacines;
    return prescripteursRacines.filter(p => contactMatchesSearch(p.contact, searchQuery));
  }, [prescripteursRacines, searchQuery, foyersInfo]);

  const toggleExpand = (id: number) => {
    setExpandedPrescripteurs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Toggle pour les investissements (mode compact)
  const toggleInvestissements = (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Ne pas propager le clic
    setExpandedInvestissements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const formatEuro = (cents: number): string => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  // Formater une date timestamp
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Composant récursif pour afficher l'arbre
  const TreeNode = ({ node, isLast = false }: { node: PrescripteurNode; isLast?: boolean }) => {
    const hasChildren = node.clientsRecommandes.length > 0;
    const isExpanded = expandedPrescripteurs.has(node.contact.id);
    const showInvestissements = expandedInvestissements.has(node.contact.id);
    
    // 🎨 Couleurs par niveau
    const styles = getNiveauStyles(node.niveau);
    
    // 📈 Stats de la branche (incluant ce nœud)
    const brancheClients = countTreeClients(node);
    const branchePatrimoine = calculateTreePatrimoine(node) - node.patrimoine; // Exclure le patrimoine personnel
    
    return (
      <div className="relative mb-2">
        {/* En-tête du contact */}
        <div className={`rounded-lg border ${styles.bg} ${styles.border}`}>
          <div 
            className="flex items-center gap-3 py-2 px-3 cursor-pointer hover:opacity-80"
            onClick={() => hasChildren && toggleExpand(node.contact.id)}
          >
            {/* Indentation visuelle */}
            {node.niveau > 0 && (
              <span className="text-muted-foreground text-sm font-mono">
                {isLast ? "└" : "├"}─
              </span>
            )}
            
            {/* Icône expand/collapse enfants */}
            {hasChildren ? (
              <button className="p-1 hover:bg-white/50 rounded">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <div className="w-6" />
            )}
            
            {/* Infos du contact (avec nom du foyer si applicable) */}
            <div className={`flex-1 flex items-center gap-2 flex-wrap ${styles.text}`}>
              <span className="font-semibold">
                {getContactDisplayName(node.contact)}
              </span>
              
              {node.contact.categorie === "CLIENT" && (
                <Badge className="bg-green-100 text-green-700 text-xs">Client</Badge>
              )}
              {node.contact.categorie === "PRESCRIPTEUR" && (
                <Badge className="bg-purple-100 text-purple-700 text-xs">Prescripteur</Badge>
              )}
              {node.contact.filleul_categorie && (
                <Badge className="bg-amber-100 text-amber-700 text-xs">
                  Filleul {node.contact.filleul_categorie}
                </Badge>
              )}
            </div>
            
            {/* Patrimoine personnel */}
            <Badge className="bg-emerald-100 text-emerald-700 font-semibold">
              💰 {formatEuro(node.patrimoine)}
            </Badge>
            
            {/* Toggle investissements (mode compact) */}
            {node.investissements.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={(e) => toggleInvestissements(node.contact.id, e)}
              >
                {showInvestissements ? (
                  <EyeOff className="h-3 w-3 mr-1" />
                ) : (
                  <Eye className="h-3 w-3 mr-1" />
                )}
                <span className="text-xs">{node.investissements.length}</span>
              </Button>
            )}
          </div>
          
          {/* 📈 Stats de la branche (si a des enfants) */}
          {hasChildren && (
            <div className="px-3 py-1 border-t border-dashed text-xs text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-3 w-3" />
              <span>
                📈 Branche : {brancheClients} client{brancheClients > 1 ? "s" : ""} • {formatEuro(branchePatrimoine)} apporté
              </span>
            </div>
          )}
          
          {/* Détail des investissements (MODE COMPACT: caché par défaut) */}
          {showInvestissements && node.investissements.length > 0 && (
            <div className="px-3 pb-2 pt-1 border-t border-dashed space-y-1">
              {node.investissements.map((inv) => (
                <div 
                  key={inv.id} 
                  className={`flex items-center justify-between text-sm py-1 px-2 rounded ${
                    inv.isCommun ? 'bg-blue-100/50' : 'bg-white/50'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge 
                      className="text-xs text-white px-2 py-0.5"
                      style={{ backgroundColor: getTypeProduitBgColor(inv.type_produit, inv.origine) }}
                    >
                      {inv.type_produit.replace(/_/g, " ")}
                    </Badge>
                    {inv.isCommun ? (
                      <Badge className="bg-blue-200 text-blue-800 text-xs px-2 py-0.5">
                        🏠 Commun
                      </Badge>
                    ) : inv.ownerName && (
                      <Badge className="bg-slate-200 text-slate-700 text-xs px-2 py-0.5">
                        👤 {inv.ownerName}
                      </Badge>
                    )}
                    <span className="font-medium">{inv.nom_produit}</span>
                    {inv.date_souscription && (
                      <span className="text-muted-foreground text-xs">
                        📅 {formatDate(inv.date_souscription)}
                      </span>
                    )}
                    {inv.notes && inv.notes.includes("Mode de détention:") && (
                      <Badge variant="outline" className="text-xs">
                        {inv.notes.split("Mode de détention:")[1]?.split("|")[0]?.trim()}
                      </Badge>
                    )}
                  </div>
                  <span 
                    className="font-semibold ml-2"
                    style={{ color: getTypeProduitBgColor(inv.type_produit, inv.origine) }}
                  >
                    {formatEuro(inv.montant_initial || 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Enfants (récursif) */}
        {hasChildren && isExpanded && (
          <div className="ml-8 mt-2 border-l-2 border-muted-foreground/20 pl-4">
            {node.clientsRecommandes.map((child, index) => (
              <TreeNode 
                key={child.contact.id} 
                node={child}
                isLast={index === node.clientsRecommandes.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement des prescripteurs...</p>
        </div>
      </div>
    );
  }

  // Stats globales
  const totalPrescripteurs = prescripteursRacines.length;
  const totalClientsApportes = prescripteursRacines.reduce((sum, p) => sum + p.nombreClientsTotal, 0);
  const totalPatrimoineApporte = prescripteursRacines.reduce((sum, p) => sum + p.patrimoineApporteTotal, 0);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Prescripteurs</h1>
        <p className="text-muted-foreground mt-1">
          Arbre des recommandations clients
        </p>
      </div>

      {/* Stats globales */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prescripteurs actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {totalPrescripteurs}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clients recommandés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              {totalClientsApportes}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Patrimoine apporté
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatEuro(totalPatrimoineApporte)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recherche */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un prescripteur ou un foyer..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Liste des prescripteurs avec arbres */}
      {filteredPrescripteurs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Aucun prescripteur</h3>
            <p className="text-muted-foreground">
              Les prescripteurs apparaîtront ici quand vous assignerez un prescripteur à vos contacts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredPrescripteurs.map((prescripteur) => {
            const tree = buildPrescripteurTree(prescripteur.contact);
            const isExpanded = expandedPrescripteurs.has(prescripteur.contact.id);
            
            return (
              <Card key={prescripteur.contact.id} className="overflow-hidden">
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(prescripteur.contact.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          🌳 {getContactDisplayName(prescripteur.contact).replace(/^(👤|🏠)\s*/, '')}
                          {prescripteur.contact.categorie === "CLIENT" && (
                            <Badge className="bg-green-100 text-green-700 text-xs">Client</Badge>
                          )}
                          {prescripteur.contact.categorie === "PRESCRIPTEUR" && (
                            <Badge className="bg-purple-100 text-purple-700 text-xs">Prescripteur</Badge>
                          )}
                          {prescripteur.contact.filleul_categorie && (
                            <Badge className="bg-amber-100 text-amber-700 text-xs">
                              Filleul {prescripteur.contact.filleul_categorie}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {prescripteur.nombreClientsDirects} client{prescripteur.nombreClientsDirects > 1 ? "s" : ""} recommandé{prescripteur.nombreClientsDirects > 1 ? "s" : ""} directement
                          {prescripteur.nombreClientsTotal > prescripteur.nombreClientsDirects && (
                            <span> • {prescripteur.nombreClientsTotal} au total dans l'arbre</span>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <div className="text-sm text-muted-foreground">Patrimoine personnel</div>
                        <div className="font-semibold">{formatEuro(prescripteur.patrimoinePersonnel)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Patrimoine apporté</div>
                        <div className="font-semibold text-emerald-600">
                          {formatEuro(prescripteur.patrimoineApporteTotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                {isExpanded && (
                  <CardContent className="border-t pt-4">
                    <div className="text-sm font-medium text-muted-foreground mb-3">
                      🌳 Arbre des recommandations
                    </div>
                    <TreeNode node={tree} />
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
