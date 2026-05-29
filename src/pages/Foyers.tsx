import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Users, Coins, Filter } from "lucide-react";
import { getAllFoyers, deleteFoyer, type Foyer } from "@/lib/api/tauri-foyers";
import { cleanupOrphanedData, getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import {
  formatFoyerMemberLabel,
  getContactsForFoyer,
} from "@/lib/foyers/foyer-utils";
import { FoyerForm } from "@/components/foyers/FoyerForm";
import { FoyerDetail } from "@/components/foyers/FoyerDetail";
import { textMatchesSearch } from "@/lib/search-utils";

export function Foyers() {
  const [foyers, setFoyers] = useState<Foyer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [selectedFoyer, setSelectedFoyer] = useState<Foyer | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    loadFoyers();
  }, []);

  const loadFoyers = async () => {
    try {
      await cleanupOrphanedData();
      const [foyersData, contactsData] = await Promise.all([
        getAllFoyers(),
        getAllContacts(),
      ]);
      setFoyers(foyersData);
      setContacts(contactsData);
    } catch (error) {
      console.error("Error loading foyers:", error);
    } finally {
      setLoading(false);
    }
  };

  const membresParFoyerId = useMemo(() => {
    const map = new Map<number, Contact[]>();
    for (const foyer of foyers) {
      map.set(foyer.id, getContactsForFoyer(contacts, foyer.id));
    }
    return map;
  }, [foyers, contacts]);

  const filteredFoyers = foyers.filter((foyer) => {
    // Filtre de recherche textuelle
    const membres = membresParFoyerId.get(foyer.id) ?? [];
    const membresText = membres
      .map((c) => `${c.prenom} ${c.nom}`)
      .join(" ");
    const matchesSearch =
      textMatchesSearch(searchQuery, foyer.nom, membresText);

    // Filtre par type
    const matchesType = typeFilter === "ALL" || foyer.type_foyer === typeFilter;

    return matchesSearch && matchesType;
  });

  const handleViewFoyer = (foyer: Foyer) => {
    setSelectedFoyer(foyer);
    setShowDetail(true);
  };

  const handleDeleteFoyer = async (id: number) => {
    try {
      await deleteFoyer(id);
      await loadFoyers();
    } catch (error) {
      console.error("Error deleting foyer:", error);
      alert("Erreur lors de la suppression: " + String(error));
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "COUPLE":
        return "bg-purple-100 text-purple-800";
      case "FAMILLE":
        return "bg-blue-100 text-blue-800";
      case "CELIBATAIRE":
        return "bg-gray-100 text-gray-800";
      case "DIVORCE":
        return "bg-orange-100 text-orange-800";
      case "VEUF":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatCurrency = (value?: number) => {
    if (!value) return null;
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Foyers
          </h2>
          <p className="text-muted-foreground">
            Gérez les foyers fiscaux de vos clients
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Nouveau foyer
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Liste des foyers</CardTitle>
                <CardDescription>
                  {filteredFoyers.length} foyer{filteredFoyers.length > 1 ? "s" : ""} sur {foyers.length}
                </CardDescription>
              </div>
            </div>

            {/* Barre de recherche et filtres */}
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous les types</SelectItem>
                  <SelectItem value="COUPLE">Couples</SelectItem>
                  <SelectItem value="FAMILLE">Familles</SelectItem>
                  <SelectItem value="CELIBATAIRE">Célibataires</SelectItem>
                  <SelectItem value="DIVORCE">Divorcé(e)s</SelectItem>
                  <SelectItem value="VEUF">Veuf(ve)s</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : filteredFoyers.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex p-4 bg-muted rounded-full mb-4">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery || typeFilter !== "ALL"
                  ? "Aucun foyer trouvé"
                  : "Aucun foyer"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || typeFilter !== "ALL"
                  ? "Essayez de modifier vos critères de recherche"
                  : "Créez votre premier foyer fiscal pour commencer"}
              </p>
              {!searchQuery && typeFilter === "ALL" && (
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Créer un foyer
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFoyers.map((foyer) => {
                const membres = membresParFoyerId.get(foyer.id) ?? [];
                return (
                  <div
                    key={foyer.id}
                    role="button"
                    tabIndex={0}
                    className="p-4 border border-border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                    onClick={() => handleViewFoyer(foyer)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleViewFoyer(foyer);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="font-semibold text-lg">{foyer.nom}</h3>
                          <Badge className={getTypeColor(foyer.type_foyer)}>
                            {foyer.type_foyer}
                          </Badge>
                          <Badge variant="secondary">
                            {membres.length} membre
                            {membres.length > 1 ? "s" : ""}
                          </Badge>
                          {foyer.tranche_imposition && (
                            <Badge variant="outline">
                              TMI {foyer.tranche_imposition}
                            </Badge>
                          )}
                        </div>
                        {membres.length > 0 ? (
                          <p className="text-sm text-muted-foreground mb-2">
                            {membres
                              .map((c) =>
                                formatFoyerMemberLabel(c, c.role_foyer)
                              )
                              .join(" · ")}
                          </p>
                        ) : (
                          <p className="text-sm text-amber-700 mb-2">
                            Aucun contact rattaché
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          {foyer.nombre_parts_fiscales && (
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {foyer.nombre_parts_fiscales} parts
                            </div>
                          )}
                          {foyer.revenu_fiscal_reference && (
                            <div className="flex items-center gap-1">
                              <Coins className="h-4 w-4" />
                              RFR: {formatCurrency(foyer.revenu_fiscal_reference)}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewFoyer(foyer);
                        }}
                      >
                        Voir détails
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulaire de création */}
      <FoyerForm
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={loadFoyers}
      />

      {/* Fiche détaillée */}
      <FoyerDetail
        open={showDetail}
        onOpenChange={setShowDetail}
        foyer={selectedFoyer}
        onDelete={handleDeleteFoyer}
        onUpdate={loadFoyers}
      />
    </div>
  );
}
