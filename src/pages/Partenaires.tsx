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
import { Plus, Search, Mail, Phone, MapPin, Filter } from "lucide-react";
import { getAllPartenaires, deletePartenaire, type Partenaire } from "@/lib/api/tauri-partenaires";
import { PartenaireForm } from "@/components/partenaires/PartenaireForm";
import { PartenaireDetail } from "@/components/partenaires/PartenaireDetail";

export function Partenaires() {
  const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [niveauFilter, setNiveauFilter] = useState<string>("ALL");
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
    const search = searchQuery.toLowerCase();
    const matchesSearch =
      partenaire.raison_sociale?.toLowerCase().includes(search) ||
      partenaire.nom_contact?.toLowerCase().includes(search) ||
      partenaire.email?.toLowerCase().includes(search);

    // Filtre par type
    const matchesType = typeFilter === "ALL" || partenaire.type_partenaire === typeFilter;

    // Filtre par niveau
    const matchesNiveau = niveauFilter === "ALL" || partenaire.niveau_collaboration === niveauFilter;

    return matchesSearch && matchesType && matchesNiveau;
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

  const getTypeColor = (type: string) => {
    switch (type) {
      case "NOTAIRE":
        return "bg-blue-100 text-blue-800";
      case "AVOCAT":
        return "bg-purple-100 text-purple-800";
      case "EXPERT_COMPTABLE":
        return "bg-green-100 text-green-800";
      case "BANQUIER":
        return "bg-cyan-100 text-cyan-800";
      case "ASSUREUR":
        return "bg-orange-100 text-orange-800";
      case "COURTIER":
        return "bg-pink-100 text-pink-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getNiveauColor = (niveau?: string) => {
    switch (niveau) {
      case "PRIVILEGIE":
        return "bg-green-100 text-green-800";
      case "REGULIER":
        return "bg-blue-100 text-blue-800";
      case "OCCASIONNEL":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
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
            Gérez votre réseau de collaborateurs
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

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous les types</SelectItem>
                  <SelectItem value="NOTAIRE">Notaires</SelectItem>
                  <SelectItem value="AVOCAT">Avocats</SelectItem>
                  <SelectItem value="EXPERT_COMPTABLE">Experts-comptables</SelectItem>
                  <SelectItem value="BANQUIER">Banquiers</SelectItem>
                  <SelectItem value="ASSUREUR">Assureurs</SelectItem>
                  <SelectItem value="COURTIER">Courtiers</SelectItem>
                  <SelectItem value="AUTRE">Autres</SelectItem>
                </SelectContent>
              </Select>

              <Select value={niveauFilter} onValueChange={setNiveauFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous niveaux</SelectItem>
                  <SelectItem value="PRIVILEGIE">Privilégiés</SelectItem>
                  <SelectItem value="REGULIER">Réguliers</SelectItem>
                  <SelectItem value="OCCASIONNEL">Occasionnels</SelectItem>
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
          ) : filteredPartenaires.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex p-4 bg-muted rounded-full mb-4">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery || typeFilter !== "ALL" || niveauFilter !== "ALL"
                  ? "Aucun partenaire trouvé"
                  : "Aucun partenaire"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || typeFilter !== "ALL" || niveauFilter !== "ALL"
                  ? "Essayez de modifier vos critères de recherche"
                  : "Ajoutez vos collaborateurs et partenaires"}
              </p>
              {!searchQuery && typeFilter === "ALL" && niveauFilter === "ALL" && (
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter un partenaire
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPartenaires.map((partenaire) => (
                <div
                  key={partenaire.id}
                  className="p-4 border border-border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">
                          {partenaire.raison_sociale}
                        </h3>
                        <Badge className={getTypeColor(partenaire.type_partenaire)}>
                          {partenaire.type_partenaire}
                        </Badge>
                        {partenaire.niveau_collaboration && (
                          <Badge className={getNiveauColor(partenaire.niveau_collaboration)}>
                            {partenaire.niveau_collaboration}
                          </Badge>
                        )}
                      </div>
                      {(partenaire.nom_contact || partenaire.prenom_contact) && (
                        <div className="text-sm text-muted-foreground mb-1">
                          Contact: {partenaire.prenom_contact} {partenaire.nom_contact}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {partenaire.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-4 w-4" />
                            {partenaire.email}
                          </div>
                        )}
                        {partenaire.telephone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-4 w-4" />
                            {partenaire.telephone}
                          </div>
                        )}
                        {partenaire.ville && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {partenaire.ville}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewPartenaire(partenaire)}
                    >
                      Voir détails
                    </Button>
                  </div>
                </div>
              ))}
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
