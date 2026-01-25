import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Users, ChevronDown, ChevronUp, Home } from "lucide-react";
import { getAllContacts, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import { getAllFoyers, type Foyer } from "@/lib/api/tauri-foyers";
import { getInvestissementsByContact, getInvestissementsByFoyer, type Investissement } from "@/lib/api/tauri-investissements";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Rôles familiaux disponibles
const ROLES_FAMILLE = [
  { value: "PERE", label: "👨 Père", icon: "👨", priority: 1 },
  { value: "MERE", label: "👩 Mère", icon: "👩", priority: 2 },
  { value: "CONJOINT", label: "💑 Conjoint(e)", icon: "💑", priority: 3 },
  { value: "FILS", label: "👦 Fils", icon: "👦", priority: 4 },
  { value: "FILLE", label: "👧 Fille", icon: "👧", priority: 5 },
  { value: "FRERE", label: "👨 Frère", icon: "👨", priority: 6 },
  { value: "SOEUR", label: "👩 Sœur", icon: "👩", priority: 7 },
  { value: "GRAND_PERE", label: "👴 Grand-père", icon: "👴", priority: 0 },
  { value: "GRAND_MERE", label: "👵 Grand-mère", icon: "👵", priority: 0 },
  { value: "PETIT_FILS", label: "👦 NOM3-fils", icon: "👦", priority: 8 },
  { value: "PETITE_FILLE", label: "👧 NOM3e-fille", icon: "👧", priority: 8 },
  { value: "AUTRE", label: "👤 Autre", icon: "👤", priority: 10 },
];

const getRoleFamilleIcon = (role?: string): string => {
  if (!role) return "👤";
  const found = ROLES_FAMILLE.find(r => r.value === role);
  return found ? found.icon : "👤";
};

const getRolePriority = (role?: string): number => {
  if (!role) return 99;
  const found = ROLES_FAMILLE.find(r => r.value === role);
  return found ? found.priority : 99;
};

// 🎨 Couleurs des investissements (mêmes que ContactDetail)
const getTypeProduitBgColor = (type: string, origine?: string): string => {
  // Si "à côté" (existant client) → gris
  if (origine === "EXISTANT_CLIENT") {
    return "#9ca3af"; // gray-400
  }
  // 🏠 Immobilier et dérivés : vert
  const immobilierTypes = [
    "IMMOBILIER", "LMNP", "LMP", "PINEL", "MALRAUX", "DENORMANDIE", 
    "RP", "RS", "DEFICIT_FONCIER", "MONUMENT_HISTORIQUE", "LOCATIF", 
    "LOCATIF_CLASSIQUE", "NUE_PROPRIETE", "RESIDENCE_PRINCIPALE",
    "COLOCATION", "MONOLOCATION", "SCI"
  ];
  if (immobilierTypes.includes(type)) return "#85ad39";
  // Tout le reste : rose foncé
  return "#dc216e";
};

// 🔥 Interface étendue pour tracker les investissements communs
interface InvestWithCommun extends Investissement {
  isCommun?: boolean; // true si c'est un investissement partagé du foyer
}

interface MemberWithInvestments {
  contact: Contact;
  investissements: InvestWithCommun[];
  patrimoine: number;
  patrimoinePerso: number; // 🔥 Patrimoine personnel (sans les communs)
  patrimoineCommun: number; // 🔥 Patrimoine commun du foyer
  avecMoiPerso: number; // 🔥 Patrimoine personnel "avec moi"
  avecMoiCommun: number; // 🔥 Patrimoine commun "avec moi"
  avecMoiTotal: number; // 🔥 Total "avec moi"
  isSpouse: boolean; // true si c'est un conjoint d'une autre famille
  spouseOf?: string; // "Conjoint de X"
}

interface FamilleGroup {
  nom: string;
  membres: MemberWithInvestments[];
  foyers: Foyer[];
  patrimoineTotal: number;
  patrimoineAvecMoi: number; // 🔥 Patrimoine "avec moi" uniquement
}

export function Familles() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [foyers, setFoyers] = useState<Foyer[]>([]);
  const [investissementsByContact, setInvestissementsByContact] = useState<Record<number, Investissement[]>>({});
  const [investissementsByFoyer, setInvestissementsByFoyer] = useState<Record<number, Investissement[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFamilles, setExpandedFamilles] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [dataContacts, dataFoyers] = await Promise.all([
        getAllContacts(),
        getAllFoyers(),
      ]);
      setContacts(dataContacts);
      setFoyers(dataFoyers);

      // 🔥 FIX: Charger les investissements par CONTACT et par FOYER
      const investsByContact: Record<number, Investissement[]> = {};
      const investsByFoyer: Record<number, Investissement[]> = {};

      // Charger les investissements par contact
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

      // Charger les investissements par foyer
      await Promise.all(
        dataFoyers.map(async (foyer) => {
          try {
            const invests = await getInvestissementsByFoyer(foyer.id);
            investsByFoyer[foyer.id] = invests;
          } catch {
            investsByFoyer[foyer.id] = [];
          }
        })
      );

      setInvestissementsByContact(investsByContact);
      setInvestissementsByFoyer(investsByFoyer);
      setLoading(false);
    } catch (error) {
      console.error("Erreur chargement contacts:", error);
      setLoading(false);
    }
  };

  // 🔥 Calculer le patrimoine d'un contact avec distinction perso/commun et avec moi/total
  // Tous les investissements sont affichés, mais les communs sont marqués
  const getContactPatrimoine = (contact: Contact): { 
    investissements: InvestWithCommun[], 
    patrimoinePerso: number, 
    patrimoineCommun: number,
    total: number,
    avecMoiPerso: number, // 🔥 Patrimoine personnel "avec moi"
    avecMoiCommun: number, // 🔥 Patrimoine commun "avec moi"
    avecMoiTotal: number // 🔥 Total "avec moi"
  } => {
    // Investissements personnels (liés directement au contact)
    const contactInvests: InvestWithCommun[] = (investissementsByContact[contact.id] || [])
      .map(inv => ({ ...inv, isCommun: false }));
    
    // Investissements communs du foyer (sans contact_id spécifique)
    let foyerInvests: InvestWithCommun[] = [];
    if (contact.foyer_id) {
      const allFoyerInvests = investissementsByFoyer[contact.foyer_id] || [];
      // Investissements du foyer sans contact_id spécifique (= communs au couple)
      foyerInvests = allFoyerInvests
        .filter(inv => !inv.contact_id)
        .map(inv => ({ ...inv, isCommun: true })); // 🏠 Marqué comme commun
    }

    const allInvests = [...contactInvests, ...foyerInvests];
    const patrimoinePerso = contactInvests.reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
    const patrimoineCommun = foyerInvests.reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
    const total = patrimoinePerso + patrimoineCommun;
    
    // 🔥 Calcul "avec moi" (origine === MON_CONSEIL)
    const avecMoiPerso = contactInvests
      .filter(inv => inv.origine === "MON_CONSEIL")
      .reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
    const avecMoiCommun = foyerInvests
      .filter(inv => inv.origine === "MON_CONSEIL")
      .reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
    const avecMoiTotal = avecMoiPerso + avecMoiCommun;

    return { investissements: allInvests, patrimoinePerso, patrimoineCommun, total, avecMoiPerso, avecMoiCommun, avecMoiTotal };
  };

  // 🔥 GROUPEMENT DYNAMIQUE PAR NOM DE FAMILLE + CONJOINTS
  const familleGroups = useMemo<FamilleGroup[]>(() => {
    const groupMap = new Map<string, Contact[]>();
    
    // Grouper les contacts par nom de famille
    contacts.forEach(contact => {
      const nomNormalized = contact.nom.trim().toUpperCase();
      if (!groupMap.has(nomNormalized)) {
        groupMap.set(nomNormalized, []);
      }
      groupMap.get(nomNormalized)!.push(contact);
    });

    // Convertir en array avec membres enrichis
    const groups: FamilleGroup[] = [];
    groupMap.forEach((membres, nom) => {
      // Ne garder que les familles avec 2+ membres
      if (membres.length >= 2) {
        // Trouver les foyers des membres
        const foyerIds = new Set(membres.map(m => m.foyer_id).filter(Boolean));
        const famillesFoyers = foyers.filter(f => foyerIds.has(f.id));
        
        // D'abord trier les membres par rôle
        const membresSorted = [...membres].sort((a, b) => 
          getRolePriority(a.role_famille) - getRolePriority(b.role_famille)
        );

        // Construire la liste avec conjoints JUSTE APRÈS leur partenaire
        const membresWithInvests: MemberWithInvestments[] = [];
        const spousesAdded = new Set<number>(); // Pour éviter les doublons
        const foyersCommunsCounted = new Set<number>(); // 🔥 Pour compter les communs UNE SEULE fois

        membresSorted.forEach(membre => {
          const { investissements, patrimoinePerso, patrimoineCommun, total, avecMoiPerso, avecMoiCommun, avecMoiTotal } = getContactPatrimoine(membre);
          
          membresWithInvests.push({
            contact: membre,
            investissements,
            patrimoine: total,
            patrimoinePerso,
            patrimoineCommun,
            avecMoiPerso,
            avecMoiCommun,
            avecMoiTotal,
            isSpouse: false,
          });

          // 🔥 Ajouter le conjoint JUSTE APRÈS ce membre s'il a un nom différent
          if (membre.foyer_id) {
            const foyerMembers = contacts.filter(
              c => c.foyer_id === membre.foyer_id && c.id !== membre.id
            );
            foyerMembers.forEach(spouse => {
              // Si le conjoint a un nom différent et n'a pas encore été ajouté
              if (spouse.nom.toUpperCase() !== nom && !spousesAdded.has(spouse.id)) {
                spousesAdded.add(spouse.id);
                const spouseData = getContactPatrimoine(spouse);
                membresWithInvests.push({
                  contact: spouse,
                  investissements: spouseData.investissements,
                  patrimoine: spouseData.total,
                  patrimoinePerso: spouseData.patrimoinePerso,
                  patrimoineCommun: spouseData.patrimoineCommun,
                  avecMoiPerso: spouseData.avecMoiPerso,
                  avecMoiCommun: spouseData.avecMoiCommun,
                  avecMoiTotal: spouseData.avecMoiTotal,
                  isSpouse: true,
                  spouseOf: `Conjoint de ${membre.prenom}`,
                });
              }
            });
          }
        });

        // 🔥 Calculer le patrimoine total SANS doubler les communs
        // Pour chaque membre : on compte le perso + le commun (mais commun 1 seule fois par foyer)
        let patrimoineTotal = 0;
        let patrimoineAvecMoi = 0;
        const foyersAvecMoiCounted = new Set<number>(); // Pour compter avecMoi communs UNE SEULE fois
        
        membresWithInvests.forEach(m => {
          // Toujours ajouter le patrimoine personnel
          patrimoineTotal += m.patrimoinePerso;
          patrimoineAvecMoi += m.avecMoiPerso;
          
          // Ajouter le patrimoine commun SEULEMENT si ce foyer n'a pas encore été compté
          if (m.contact.foyer_id && !foyersCommunsCounted.has(m.contact.foyer_id)) {
            patrimoineTotal += m.patrimoineCommun;
            foyersCommunsCounted.add(m.contact.foyer_id);
          }
          
          // 🔥 Patrimoine "avec moi" commun (compter 1 fois par foyer)
          if (m.contact.foyer_id && !foyersAvecMoiCounted.has(m.contact.foyer_id)) {
            patrimoineAvecMoi += m.avecMoiCommun;
            foyersAvecMoiCounted.add(m.contact.foyer_id);
          }
        });

        groups.push({
          nom,
          membres: membresWithInvests,
          foyers: famillesFoyers,
          patrimoineTotal,
          patrimoineAvecMoi,
        });
      }
    });

    // Trier par nom
    groups.sort((a, b) => a.nom.localeCompare(b.nom));
    
    return groups;
  }, [contacts, foyers, investissementsByContact, investissementsByFoyer]);

  // Filtrage
  const filteredFamilles = useMemo(() => {
    if (!searchQuery) return familleGroups;
    const query = searchQuery.toLowerCase();
    return familleGroups.filter(
      (f) =>
        f.nom.toLowerCase().includes(query) ||
        f.membres.some((m) => `${m.contact.prenom} ${m.contact.nom}`.toLowerCase().includes(query))
    );
  }, [familleGroups, searchQuery]);

  const toggleExpand = (familleNom: string) => {
    const newExpanded = new Set(expandedFamilles);
    if (newExpanded.has(familleNom)) {
      newExpanded.delete(familleNom);
    } else {
      newExpanded.add(familleNom);
    }
    setExpandedFamilles(newExpanded);
  };

  // Mettre à jour le rôle familial d'un membre
  const handleRoleFamilleChange = async (contact: Contact, newRole: string) => {
    try {
      await updateContact(contact.id, {
        ...contact,
        role_famille: newRole,
        date_naissance: contact.date_naissance 
          ? new Date(contact.date_naissance * 1000).toISOString() 
          : undefined,
        // Dates CLIENT
        date_dernier_contact: contact.date_dernier_contact 
          ? new Date(contact.date_dernier_contact * 1000).toISOString() 
          : undefined,
        date_prochain_suivi: contact.date_prochain_suivi 
          ? new Date(contact.date_prochain_suivi * 1000).toISOString() 
          : undefined,
        // Dates FILLEUL
        date_dernier_contact_filleul: contact.date_dernier_contact_filleul 
          ? new Date(contact.date_dernier_contact_filleul * 1000).toISOString() 
          : undefined,
        date_prochain_suivi_filleul: contact.date_prochain_suivi_filleul 
          ? new Date(contact.date_prochain_suivi_filleul * 1000).toISOString() 
          : undefined,
      });
      
      // Mettre à jour le state local
      setContacts(contacts.map(c => 
        c.id === contact.id ? { ...c, role_famille: newRole } : c
      ));
    } catch (error) {
      console.error("Erreur mise à jour rôle famille:", error);
    }
  };

  // Trouver le foyer d'un membre
  const getFoyerForMember = (contact: Contact): Foyer | undefined => {
    if (!contact.foyer_id) return undefined;
    return foyers.find(f => f.id === contact.foyer_id);
  };

  // Formater le montant
  const formatEuro = (centimes: number): string => {
    return (centimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
  };

  // Formater la date
  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return "";
    return new Date(timestamp * 1000).toLocaleDateString("fr-FR");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Familles</h1>
          <p className="text-muted-foreground">
            Groupement automatique par nom de famille (2+ personnes)
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">👨‍👩‍👧‍👦 Familles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{familleGroups.length}</div>
            <p className="text-xs text-muted-foreground">avec 2+ membres</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">👥 Membres en famille</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {familleGroups.reduce((sum, f) => sum + f.membres.length, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">🏠 Foyers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{foyers.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recherche */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une famille ou un membre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Liste des familles */}
      <div className="space-y-4">
        {filteredFamilles.map((famille) => (
          <Card key={famille.nom} className="overflow-hidden">
            <CardHeader
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => toggleExpand(famille.nom)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      Famille {famille.nom}
                      <Badge variant="secondary">{famille.membres.filter(m => !m.isSpouse).length} membre{famille.membres.filter(m => !m.isSpouse).length > 1 ? "s" : ""}</Badge>
                      {famille.foyers.length > 0 && (
                        <Badge variant="outline">
                          <Home className="h-3 w-3 mr-1" />
                          {famille.foyers.length} foyer{famille.foyers.length > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {famille.membres.filter(m => !m.isSpouse).slice(0, 4).map((m) => `${getRoleFamilleIcon(m.contact.role_famille)} ${m.contact.prenom}`).join(", ")}
                      {famille.membres.filter(m => !m.isSpouse).length > 4 && ` +${famille.membres.filter(m => !m.isSpouse).length - 4}`}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-lg font-semibold text-green-600">
                      💰 {formatEuro(famille.patrimoineAvecMoi)} avec moi
                    </div>
                    {famille.patrimoineTotal > famille.patrimoineAvecMoi && (
                      <div className="text-sm text-gray-400">
                        ({formatEuro(famille.patrimoineTotal)} total)
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">Patrimoine famille</div>
                  </div>
                  {expandedFamilles.has(famille.nom) ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>

            {expandedFamilles.has(famille.nom) && (
              <CardContent className="border-t bg-muted/20 pt-4">
                {/* Arborescence des membres */}
                <div className="space-y-1">
                  <h4 className="font-medium text-sm text-muted-foreground mb-4">
                    🌳 Arborescence famille {famille.nom}
                  </h4>
                  
                  {famille.membres.map((membre, index) => {
                    const foyer = getFoyerForMember(membre.contact);
                    const isLast = index === famille.membres.length - 1;
                    const isSpouseAndPreviousWasSpouseOf = membre.isSpouse && index > 0 && 
                      famille.membres[index - 1].contact.foyer_id === membre.contact.foyer_id;
                    
                    return (
                      <div key={membre.contact.id} className="relative">
                        {/* Membre principal */}
                        <div className={`flex items-start gap-2 ${membre.isSpouse ? 'ml-8' : ''}`}>
                          {/* Ligne de connexion visuelle */}
                          <div className="flex flex-col items-center w-6 text-muted-foreground font-mono text-lg select-none">
                            {membre.isSpouse ? (
                              isSpouseAndPreviousWasSpouseOf ? "│" : "└─"
                            ) : (
                              index === 0 ? "┌" : isLast ? "└" : "├"
                            )}
                          </div>
                          
                          {/* Carte du membre */}
                          <div className={`flex-1 rounded-lg border ${membre.isSpouse ? 'bg-blue-50 border-blue-200' : 'bg-background'} p-3`}>
                            {/* En-tête du membre */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div className="text-2xl">
                                  {/* Pour les conjoints externes : toujours 💑, sinon le rôle stocké */}
                                  {membre.isSpouse ? "💑" : getRoleFamilleIcon(membre.contact.role_famille)}
                                </div>
                                <div>
                                  <div className="font-semibold flex items-center gap-2">
                                    {membre.contact.prenom} {membre.contact.nom}
                                    {membre.isSpouse && (
                                      <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs">
                                        💑 {membre.spouseOf}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                                    {foyer ? (
                                      <>
                                        <Home className="h-3 w-3" />
                                        <span>{foyer.nom}</span>
                                      </>
                                    ) : (
                                      <span className="text-orange-500">Sans foyer</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-3">
                                {/* Sélecteur de rôle : uniquement pour les membres de la famille (pas les conjoints externes) */}
                                {!membre.isSpouse ? (
                                  <Select
                                    value={membre.contact.role_famille || ""}
                                    onValueChange={(value) => handleRoleFamilleChange(membre.contact, value)}
                                  >
                                    <SelectTrigger className="h-8 text-sm w-36">
                                      <SelectValue placeholder="Définir rôle..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ROLES_FAMILLE.map((role) => (
                                        <SelectItem key={role.value} value={role.value}>
                                          {role.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Badge variant="outline" className="h-8 px-3 text-blue-600 border-blue-300">
                                    💑 Conjoint(e)
                                  </Badge>
                                )}
                                
                                {/* Patrimoine avec moi + total */}
                                <div className="flex items-center gap-2">
                                  <Badge className="bg-green-100 text-green-700 border-green-300 font-semibold">
                                    💰 {formatEuro(membre.avecMoiTotal)}
                                  </Badge>
                                  {membre.patrimoine > membre.avecMoiTotal && (
                                    <span className="text-xs text-gray-400">
                                      ({formatEuro(membre.patrimoine)} total)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* Liste des investissements */}
                            {membre.investissements.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-dashed">
                                <div className="grid gap-1">
                                  {membre.investissements.map((inv) => (
                                    <div 
                                      key={inv.id} 
                                      className={`flex items-center justify-between text-sm py-1.5 px-2 rounded ${
                                        inv.isCommun ? 'bg-blue-50 border border-blue-200' : 'bg-muted/30'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Badge 
                                          className="text-xs text-white px-2 py-0.5"
                                          style={{ backgroundColor: getTypeProduitBgColor(inv.type_produit, inv.origine) }}
                                        >
                                          {inv.type_produit.replace(/_/g, " ")}
                                        </Badge>
                                        {/* Nom du produit seulement s'il est différent du type */}
                                        {inv.nom_produit && 
                                         inv.nom_produit.trim() !== "" && 
                                         inv.nom_produit.toUpperCase().replace(/[- ]/g, "") !== inv.type_produit?.toUpperCase().replace(/_/g, "") && (
                                          <span className="font-medium">{inv.nom_produit}</span>
                                        )}
                                        {/* 🏠 Badge "Commun" pour les investissements partagés */}
                                        {inv.isCommun && (
                                          <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-xs">
                                            🏠 Commun
                                          </Badge>
                                        )}
                                        {inv.date_souscription && (
                                          <span className="text-muted-foreground text-xs">
                                            {formatDate(inv.date_souscription)}
                                          </span>
                                        )}
                                      </div>
                                      <span className="font-semibold" style={{ color: getTypeProduitBgColor(inv.type_produit, inv.origine) }}>
                                        {formatEuro(inv.montant_initial || 0)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {membre.investissements.length === 0 && (
                              <div className="mt-2 pt-2 border-t border-dashed">
                                <div className="text-sm text-muted-foreground italic">
                                  Aucun investissement
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Ligne verticale de connexion */}
                        {!isLast && !membre.isSpouse && (
                          <div className="absolute left-3 top-full h-1 w-px bg-muted-foreground/30"></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        ))}

        {filteredFamilles.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {searchQuery ? (
                <p>Aucune famille ne correspond à votre recherche.</p>
              ) : (
                <div className="space-y-2">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p>Aucune famille détectée.</p>
                  <p className="text-sm">
                    Les familles apparaissent quand 2+ contacts ont le même nom de famille.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
