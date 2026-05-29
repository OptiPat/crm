import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Filter, Trash2, Pencil } from "lucide-react";
import {
  getInvestissementsWithDetails,
  deleteInvestissement,
  type InvestissementWithDetails,
} from "@/lib/api/tauri-investissements";
import { InvestissementForm } from "@/components/investissements/InvestissementForm";
import { InvestissementCard } from "@/components/investissements/InvestissementCard";
import { textMatchesSearch } from "@/lib/search-utils";

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

  // Filtrage
  const filteredInvestissements = investissements
    .filter((inv) => {
      const matchesSearch = textMatchesSearch(
        searchQuery,
        inv.nom_produit,
        inv.contact_nom,
        inv.contact_prenom,
        inv.partenaire_nom
      );

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
              {filteredInvestissements.map((inv) => {
                const ownerLabel = inv.foyer_nom
                  ? inv.foyer_nom
                  : [inv.contact_prenom, inv.contact_nom]
                      .filter(Boolean)
                      .join(" ")
                      .trim();
                return (
                  <InvestissementCard
                    key={inv.id}
                    inv={inv}
                    partenaireNom={inv.partenaire_nom}
                    proprietaireLabel={ownerLabel || undefined}
                    proprietaireVariant={inv.foyer_id ? "foyer" : "member"}
                    actions={
                      <>
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
                      </>
                    }
                  />
                );
              })}
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
