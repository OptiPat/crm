import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Tag, Trash2, Edit, Users, Zap } from "lucide-react";
import { 
  getAllEtiquettesWithCount, 
  deleteEtiquette, 
  seedDefaultEtiquettes,
  getContrastColor,
  type EtiquetteWithCount 
} from "@/lib/api/tauri-etiquettes";
import { EtiquetteForm } from "@/components/etiquettes/EtiquetteForm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export function Etiquettes() {
  const [etiquettes, setEtiquettes] = useState<EtiquetteWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedEtiquette, setSelectedEtiquette] = useState<EtiquetteWithCount | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [etiquetteToDelete, setEtiquetteToDelete] = useState<EtiquetteWithCount | null>(null);

  useEffect(() => {
    loadEtiquettes();
  }, []);

  const loadEtiquettes = async () => {
    try {
      setLoading(true);
      
      // Vérifier si des étiquettes existent, sinon créer les étiquettes par défaut
      let data = await getAllEtiquettesWithCount();
      
      if (data.length === 0) {
        // Premier lancement : créer les étiquettes par défaut
        const created = await seedDefaultEtiquettes();
        if (created > 0) {
          toast.success(`${created} étiquettes par défaut créées`);
          data = await getAllEtiquettesWithCount();
        }
      }
      
      setEtiquettes(data);
    } catch (error) {
      console.error("Error loading etiquettes:", error);
      toast.error("Erreur lors du chargement des étiquettes");
    } finally {
      setLoading(false);
    }
  };

  const filteredEtiquettes = etiquettes.filter((etiquette) => {
    const search = searchQuery.toLowerCase();
    return (
      etiquette.nom.toLowerCase().includes(search) ||
      etiquette.description?.toLowerCase().includes(search)
    );
  });

  const handleEditEtiquette = (etiquette: EtiquetteWithCount) => {
    setSelectedEtiquette(etiquette);
    setShowForm(true);
  };

  const handleDeleteClick = (etiquette: EtiquetteWithCount) => {
    setEtiquetteToDelete(etiquette);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!etiquetteToDelete) return;
    
    try {
      await deleteEtiquette(etiquetteToDelete.id);
      toast.success(`Étiquette "${etiquetteToDelete.nom}" supprimée`);
      await loadEtiquettes();
    } catch (error) {
      console.error("Error deleting etiquette:", error);
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleteDialogOpen(false);
      setEtiquetteToDelete(null);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setSelectedEtiquette(null);
  };

  const getConditionLabel = (type: string | null): string => {
    switch (type) {
      case "DELAI_SANS_CONTACT":
        return "Délai sans contact";
      case "DATE_APPROCHE":
        return "Date approche";
      case "PERIODE_ANNEE":
        return "Période de l'année";
      case "TYPE_PRODUIT":
        return "Type de produit";
      default:
        return "Manuel";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Étiquettes
          </h2>
          <p className="text-muted-foreground">
            Personnalisez les étiquettes pour organiser et suivre vos contacts
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Nouvelle étiquette
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Liste des étiquettes</CardTitle>
                <CardDescription>
                  {filteredEtiquettes.length} étiquette{filteredEtiquettes.length > 1 ? "s" : ""} sur {etiquettes.length}
                </CardDescription>
              </div>
            </div>

            {/* Barre de recherche */}
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom ou description..."
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
          ) : filteredEtiquettes.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex p-4 bg-muted rounded-full mb-4">
                <Tag className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery
                  ? "Aucune étiquette trouvée"
                  : "Aucune étiquette"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "Essayez de modifier vos critères de recherche"
                  : "Créez des étiquettes pour organiser vos contacts"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Créer une étiquette
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredEtiquettes.map((etiquette) => (
                <div
                  key={etiquette.id}
                  className="p-4 border border-border rounded-lg hover:shadow-md transition-all"
                >
                  {/* Badge de l'étiquette */}
                  <div className="flex items-start justify-between mb-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium shadow-sm"
                      style={{
                        backgroundColor: etiquette.couleur,
                        color: getContrastColor(etiquette.couleur)
                      }}
                    >
                      {etiquette.icone && <span>{etiquette.icone}</span>}
                      <span>{etiquette.nom}</span>
                    </span>
                    
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditEtiquette(etiquette)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteClick(etiquette)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Description */}
                  {etiquette.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {etiquette.description}
                    </p>
                  )}

                  {/* Infos */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {/* Compteur de contacts */}
                    <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded-full">
                      <Users className="h-3 w-3" />
                      <span>{etiquette.contact_count} contact{etiquette.contact_count > 1 ? "s" : ""}</span>
                    </div>
                    
                    {/* Type d'attribution */}
                    <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded-full">
                      {etiquette.auto_condition_type ? (
                        <>
                          <Zap className="h-3 w-3 text-amber-500" />
                          <span>{getConditionLabel(etiquette.auto_condition_type)}</span>
                        </>
                      ) : (
                        <>
                          <Tag className="h-3 w-3" />
                          <span>Manuel</span>
                        </>
                      )}
                    </div>

                    {/* Email actif */}
                    {etiquette.email_actif && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                        <span>📧 Email dans {etiquette.email_delai_jours}j</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulaire de création/édition */}
      <EtiquetteForm
        open={showForm}
        onOpenChange={handleFormClose}
        etiquette={selectedEtiquette}
        onSuccess={loadEtiquettes}
      />

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette étiquette ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'étiquette "{etiquetteToDelete?.nom}" sera supprimée définitivement.
              {etiquetteToDelete && etiquetteToDelete.contact_count > 0 && (
                <span className="block mt-2 text-destructive">
                  Attention : {etiquetteToDelete.contact_count} contact{etiquetteToDelete.contact_count > 1 ? "s" : ""} perdra cette étiquette.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
