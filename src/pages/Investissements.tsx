import { useEffect, useState } from "react";
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
import { Plus, Search, Filter, Trash2, Eye, Pencil } from "lucide-react";
import {
  getInvestissementsWithDetails,
  deleteInvestissement,
  type InvestissementWithDetails,
} from "@/lib/api/tauri-investissements";
import { InvestissementForm } from "@/components/investissements/InvestissementForm";

export function Investissements() {
  const [investissements, setInvestissements] = useState<InvestissementWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [partenaireFilter, setPartenaireFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [selectedInvestissement, setSelectedInvestissement] = useState<any>(null);

  useEffect(() => {
    loadInvestissements();
  }, []);

  const loadInvestissements = async () => {
    try {
      const data = await getInvestissementsWithDetails();
      setInvestissements(data);
    } catch (error) {
      console.error("Error loading investissements:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet investissement ?")) {
      return;
    }

    try {
      await deleteInvestissement(id);
      await loadInvestissements();
    } catch (error) {
      console.error("Error deleting investissement:", error);
      alert("Erreur lors de la suppression: " + String(error));
    }
  };

  // Formatage des montants
  const formatEuro = (centimes?: number) => {
    if (!centimes) return "-";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(centimes / 100);
  };

  // Formatage des dates
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "-";
    return new Date(timestamp * 1000).toLocaleDateString("fr-FR");
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
      case "FIP_FCPI":
        return "bg-orange-100 text-orange-800";
      case "FCPR":
        return "bg-pink-100 text-pink-800";
      case "G3F":
        return "bg-cyan-100 text-cyan-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Label lisible pour les types de produits
  const getTypeProduitLabel = (type: string) => {
    switch (type) {
      case "SCPI":
        return "SCPI";
      case "SCPI_DEMEMBREMENT":
        return "SCPI Démembrement";
      case "ASSURANCE_VIE":
        return "Assurance Vie";
      case "PER":
        return "PER";
      case "IMMOBILIER":
        return "Immobilier";
      case "FIP_FCPI":
        return "FIP/FCPI";
      case "FCPR":
        return "FCPR";
      case "G3F":
        return "G3F";
      case "AUTRE":
        return "Autre";
      default:
        return type;
    }
  };

  // Filtrage
  const filteredInvestissements = investissements
    .filter((inv) => {
      const search = searchQuery.toLowerCase();
      const matchesSearch =
        inv.nom_produit?.toLowerCase().includes(search) ||
        inv.contact_nom?.toLowerCase().includes(search) ||
        inv.contact_prenom?.toLowerCase().includes(search) ||
        inv.partenaire_nom?.toLowerCase().includes(search);

      const matchesType = typeFilter === "ALL" || inv.type_produit === typeFilter;
      
      const matchesPartenaire =
        partenaireFilter === "ALL" || inv.partenaire_nom === partenaireFilter;

      return matchesSearch && matchesType && matchesPartenaire;
    })
    .sort((a, b) => {
      // Tri par date de souscription (récent → ancien)
      if (!a.date_souscription) return 1;
      if (!b.date_souscription) return -1;
      return b.date_souscription - a.date_souscription;
    });

  // Liste unique des partenaires pour le filtre
  const uniquePartenaires = Array.from(
    new Set(investissements.map((inv) => inv.partenaire_nom).filter(Boolean))
  ).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Investissements
          </h2>
          <p className="text-muted-foreground">
            Gérez les investissements de vos clients
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Nouvel investissement
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Liste des investissements</CardTitle>
                <CardDescription>
                  {filteredInvestissements.length} investissement
                  {filteredInvestissements.length > 1 ? "s" : ""} sur {investissements.length}
                </CardDescription>
              </div>
            </div>

            {/* Barre de recherche et filtres */}
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par produit, client, partenaire..."
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
                  <SelectItem value="SCPI">SCPI</SelectItem>
                  <SelectItem value="SCPI_DEMEMBREMENT">SCPI Démembrement</SelectItem>
                  <SelectItem value="ASSURANCE_VIE">Assurance Vie</SelectItem>
                  <SelectItem value="PER">PER</SelectItem>
                  <SelectItem value="IMMOBILIER">Immobilier</SelectItem>
                  <SelectItem value="FIP_FCPI">FIP/FCPI</SelectItem>
                  <SelectItem value="FCPR">FCPR</SelectItem>
                  <SelectItem value="G3F">G3F</SelectItem>
                  <SelectItem value="AUTRE">Autre</SelectItem>
                </SelectContent>
              </Select>

              {uniquePartenaires.length > 0 && (
                <Select value={partenaireFilter} onValueChange={setPartenaireFilter}>
                  <SelectTrigger className="w-[200px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tous les partenaires</SelectItem>
                    {uniquePartenaires.map((partenaire) => (
                      <SelectItem key={partenaire} value={partenaire || ""}>
                        {partenaire}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : filteredInvestissements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery || typeFilter !== "ALL" || partenaireFilter !== "ALL"
                ? "Aucun investissement trouvé"
                : "Aucun investissement. Commencez par en créer un !"}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInvestissements.map((inv) => (
                <div
                  key={inv.id}
                  className="p-4 border border-border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      {/* Ligne 1 : Nom du produit + Type */}
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{inv.nom_produit}</h3>
                        <Badge className={getTypeProduitColor(inv.type_produit)}>
                          {getTypeProduitLabel(inv.type_produit)}
                        </Badge>
                      </div>

                      {/* Ligne 2 : Client + Partenaire */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Client :</span>
                          <span>
                            {inv.contact_prenom} {inv.contact_nom}
                          </span>
                        </div>
                        {inv.partenaire_nom && (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Partenaire :</span>
                            <span>{inv.partenaire_nom}</span>
                          </div>
                        )}
                      </div>

                      {/* Ligne 3 : Montant + Date + Options */}
                      <div className="flex items-center gap-4 text-sm">
                        <div className="font-semibold text-primary">
                          {formatEuro(inv.montant_initial)}
                        </div>
                        <div className="text-muted-foreground">
                          Souscrit le {formatDate(inv.date_souscription)}
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
                        {inv.date_fin_demembrement && (
                          <div className="text-xs text-purple-600 font-medium">
                            Fin démembrement : {formatDate(inv.date_fin_demembrement)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedInvestissement(inv);
                          setShowForm(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(inv.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulaire */}
      <InvestissementForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) {
            setSelectedInvestissement(null);
          }
        }}
        onSuccess={loadInvestissements}
        investissement={selectedInvestissement}
      />
    </div>
  );
}
