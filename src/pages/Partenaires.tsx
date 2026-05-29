import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Building2, Shield, Home } from "lucide-react";
import { getAllPartenaires, deletePartenaire, type Partenaire } from "@/lib/api/tauri-partenaires";
import { PartenaireForm } from "@/components/partenaires/PartenaireForm";
import { PartenaireDetail } from "@/components/partenaires/PartenaireDetail";
import { textMatchesSearch } from "@/lib/search-utils";

// Helper pour afficher le type de partenaire
const getTypeInfo = (type: string) => {
  switch (type) {
    case "SOCIETE_GESTION_SCPI":
    case "SOCIETE_GESTION": // Rétrocompatibilité
      return { label: "Société de Gestion SCPI", icon: Building2, color: "bg-blue-100 text-blue-800" };
    case "SOCIETE_GESTION_FIP":
      return { label: "Société de Gestion FIP/FCPI/FCPR", icon: Building2, color: "bg-indigo-100 text-indigo-800" };
    case "ASSUREUR":
      return { label: "Assureur", icon: Shield, color: "bg-green-100 text-green-800" };
    case "PROMOTEUR":
      return { label: "Promoteur", icon: Home, color: "bg-orange-100 text-orange-800" };
    default:
      // Transformer les types inconnus proprement
      const cleanLabel = type
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
      return { label: cleanLabel, icon: Building2, color: "bg-gray-100 text-gray-800" };
  }
};

export function Partenaires() {
  const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedPartenaire, setSelectedPartenaire] = useState<Partenaire | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    loadPartenaires();
  }, []);

  const loadPartenaires = async () => {
    try {
      const data = await getAllPartenaires();
      setPartenaires(data);
    } catch (error) {
      console.error("Error loading partenaires:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPartenaires = partenaires.filter((partenaire) => {
    // Filtre de recherche textuelle
    const matchesSearch = textMatchesSearch(
      searchQuery,
      partenaire.raison_sociale,
      partenaire.nom_contact,
      partenaire.email
    );

    return matchesSearch;
  });

  const handleViewPartenaire = (partenaire: Partenaire) => {
    setSelectedPartenaire(partenaire);
    setShowDetail(true);
  };

  const handleDeletePartenaire = async (id: number) => {
    try {
      await deletePartenaire(id);
      await loadPartenaires();
    } catch (error) {
      console.error("Error deleting partenaire:", error);
      alert("Erreur lors de la suppression: " + String(error));
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Partenaires
          </h2>
          <p className="text-muted-foreground">
            Assureurs, sociétés de gestion et promoteurs
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Nouveau partenaire
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Liste des partenaires</CardTitle>
                <CardDescription>
                  {filteredPartenaires.length} partenaire{filteredPartenaires.length > 1 ? "s" : ""} sur {partenaires.length}
                </CardDescription>
              </div>
            </div>

            {/* Barre de recherche et filtres */}
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom, contact, email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : filteredPartenaires.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex p-4 bg-muted rounded-full mb-4">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery
                  ? "Aucun partenaire trouvé"
                  : "Aucun partenaire"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "Essayez de modifier vos critères de recherche"
                  : "Ajoutez vos collaborateurs et partenaires"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter un partenaire
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPartenaires.map((partenaire) => {
                const typeInfo = getTypeInfo(partenaire.type_partenaire);
                const TypeIcon = typeInfo.icon;
                return (
                  <div
                    key={partenaire.id}
                    className="p-4 border border-border rounded-lg hover:bg-accent transition-colors cursor-pointer flex items-center justify-between"
                    onClick={() => handleViewPartenaire(partenaire)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                      <h3 className="font-semibold text-lg">
                        {partenaire.raison_sociale}
                      </h3>
                    </div>
                    <Badge variant="outline" className={typeInfo.color}>
                      {typeInfo.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulaire de création */}
      <PartenaireForm
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={loadPartenaires}
      />

      {/* Fiche détaillée */}
      <PartenaireDetail
        open={showDetail}
        onOpenChange={setShowDetail}
        partenaire={selectedPartenaire}
        onDelete={handleDeletePartenaire}
        onUpdate={loadPartenaires}
      />
    </div>
  );
}
