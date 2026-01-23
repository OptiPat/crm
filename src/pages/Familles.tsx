import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Users, ChevronDown, ChevronUp, Home } from "lucide-react";
import { getAllContacts, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import { getAllFoyers, type Foyer } from "@/lib/api/tauri-foyers";
import { getInvestissementsByContact } from "@/lib/api/tauri-investissements";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Rôles familiaux disponibles
const ROLES_FAMILLE = [
  { value: "PERE", label: "👨 Père", icon: "👨" },
  { value: "MERE", label: "👩 Mère", icon: "👩" },
  { value: "FILS", label: "👦 Fils", icon: "👦" },
  { value: "FILLE", label: "👧 Fille", icon: "👧" },
  { value: "CONJOINT", label: "💑 Conjoint(e)", icon: "💑" },
  { value: "FRERE", label: "👨 Frère", icon: "👨" },
  { value: "SOEUR", label: "👩 Sœur", icon: "👩" },
  { value: "GRAND_PERE", label: "👴 Grand-père", icon: "👴" },
  { value: "GRAND_MERE", label: "👵 Grand-mère", icon: "👵" },
  { value: "PETIT_FILS", label: "👦 NOM3-fils", icon: "👦" },
  { value: "PETITE_FILLE", label: "👧 NOM3e-fille", icon: "👧" },
  { value: "AUTRE", label: "👤 Autre", icon: "👤" },
];

const getRoleFamilleIcon = (role?: string): string => {
  if (!role) return "👤";
  const found = ROLES_FAMILLE.find(r => r.value === role);
  return found ? found.icon : "👤";
};

interface FamilleGroup {
  nom: string;
  membres: Contact[];
  foyers: Foyer[];
  patrimoineTotal: number;
}

export function Familles() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [foyers, setFoyers] = useState<Foyer[]>([]);
  const [patrimoineByContact, setPatrimoineByContact] = useState<Record<number, number>>({});
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

      // Charger le patrimoine de chaque contact
      const patrimoineMap: Record<number, number> = {};
      await Promise.all(
        dataContacts.map(async (contact) => {
          try {
            const invests = await getInvestissementsByContact(contact.id);
            patrimoineMap[contact.id] = invests.reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
          } catch {
            patrimoineMap[contact.id] = 0;
          }
        })
      );
      setPatrimoineByContact(patrimoineMap);
      setLoading(false);
    } catch (error) {
      console.error("Erreur chargement contacts:", error);
      setLoading(false);
    }
  };

  // 🔥 GROUPEMENT DYNAMIQUE PAR NOM DE FAMILLE
  // Plus besoin de famille_id en base - on groupe simplement par contact.nom
  const familleGroups = useMemo<FamilleGroup[]>(() => {
    const groupMap = new Map<string, Contact[]>();
    
    // Grouper les contacts par nom de famille (en majuscules pour éviter les doublons)
    contacts.forEach(contact => {
      const nomNormalized = contact.nom.trim().toUpperCase();
      if (!groupMap.has(nomNormalized)) {
        groupMap.set(nomNormalized, []);
      }
      groupMap.get(nomNormalized)!.push(contact);
    });

    // Convertir en array et enrichir avec les données
    const groups: FamilleGroup[] = [];
    groupMap.forEach((membres, nom) => {
      // Ne garder que les familles avec 2+ membres
      if (membres.length >= 2) {
        // Trouver les foyers des membres
        const foyerIds = new Set(membres.map(m => m.foyer_id).filter(Boolean));
        const famillesFoyers = foyers.filter(f => foyerIds.has(f.id));
        
        // Calculer le patrimoine total
        const patrimoineTotal = membres.reduce((sum, m) => sum + (patrimoineByContact[m.id] || 0), 0);

        groups.push({
          nom,
          membres,
          foyers: famillesFoyers,
          patrimoineTotal,
        });
      }
    });

    // Trier par nom
    groups.sort((a, b) => a.nom.localeCompare(b.nom));
    
    return groups;
  }, [contacts, foyers, patrimoineByContact]);

  // Filtrage
  const filteredFamilles = useMemo(() => {
    if (!searchQuery) return familleGroups;
    const query = searchQuery.toLowerCase();
    return familleGroups.filter(
      (f) =>
        f.nom.toLowerCase().includes(query) ||
        f.membres.some((m) => `${m.prenom} ${m.nom}`.toLowerCase().includes(query))
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
        date_dernier_contact: contact.date_dernier_contact 
          ? new Date(contact.date_dernier_contact * 1000).toISOString() 
          : undefined,
        date_prochain_suivi: contact.date_prochain_suivi 
          ? new Date(contact.date_prochain_suivi * 1000).toISOString() 
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

  // Obtenir les autres membres du foyer
  const getFoyerMembers = (contact: Contact): Contact[] => {
    if (!contact.foyer_id) return [];
    return contacts.filter(c => c.foyer_id === contact.foyer_id && c.id !== contact.id);
  };

  // Trouver le foyer d'un membre
  const getFoyerForMember = (contact: Contact): Foyer | undefined => {
    if (!contact.foyer_id) return undefined;
    return foyers.find(f => f.id === contact.foyer_id);
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
                      <Badge variant="secondary">{famille.membres.length} membre{famille.membres.length > 1 ? "s" : ""}</Badge>
                      {famille.foyers.length > 0 && (
                        <Badge variant="outline">
                          <Home className="h-3 w-3 mr-1" />
                          {famille.foyers.length} foyer{famille.foyers.length > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {famille.membres.slice(0, 4).map((m) => `${getRoleFamilleIcon(m.role_famille)} ${m.prenom}`).join(", ")}
                      {famille.membres.length > 4 && ` +${famille.membres.length - 4}`}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-lg font-semibold text-green-600">
                      💰 {(famille.patrimoineTotal / 100).toLocaleString("fr-FR")} €
                    </div>
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
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground mb-3">
                    🌳 Membres de la famille {famille.nom}
                  </h4>
                  
                  {famille.membres.map((membre, index) => {
                    const foyer = getFoyerForMember(membre);
                    const foyerMembers = getFoyerMembers(membre);
                    const patrimoine = patrimoineByContact[membre.id] || 0;
                    
                    return (
                      <div
                        key={membre.id}
                        className="flex items-center gap-4 p-3 bg-background rounded-lg border"
                      >
                        {/* Ligne de connexion visuelle */}
                        <div className="flex items-center gap-2 w-8 text-muted-foreground font-mono">
                          {index === 0 ? "┌" : index === famille.membres.length - 1 ? "└" : "├"}
                        </div>
                        
                        {/* Icône du rôle */}
                        <div className="text-2xl w-8 text-center">
                          {getRoleFamilleIcon(membre.role_famille)}
                        </div>
                        
                        {/* Infos du membre */}
                        <div className="flex-1">
                          <div className="font-medium">
                            {membre.prenom} {membre.nom}
                          </div>
                          {foyer && (
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Home className="h-3 w-3" />
                              {foyer.nom}
                              {foyerMembers.length > 0 && (
                                <span className="text-xs">
                                  (avec {foyerMembers.map(m => m.prenom).join(", ")})
                                </span>
                              )}
                            </div>
                          )}
                          {!foyer && (
                            <div className="text-sm text-muted-foreground">
                              Sans foyer
                            </div>
                          )}
                        </div>
                        
                        {/* Sélecteur de rôle */}
                        <div className="w-44">
                          <Select
                            value={membre.role_famille || ""}
                            onValueChange={(value) => handleRoleFamilleChange(membre, value)}
                          >
                            <SelectTrigger className="h-8 text-sm">
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
                        </div>
                        
                        {/* Patrimoine */}
                        <div className="text-right w-28">
                          <Badge variant="outline" className="text-green-600">
                            {(patrimoine / 100).toLocaleString("fr-FR")} €
                          </Badge>
                        </div>
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
