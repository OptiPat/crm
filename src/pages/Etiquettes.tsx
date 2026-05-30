import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Tag, Trash2, Edit, Users, Zap, RefreshCw } from "lucide-react";
import {
  getAllEtiquettesWithCount,
  deleteEtiquette,
  seedDefaultEtiquettes,
  getContrastColor,
  type EtiquetteWithCount,
} from "@/lib/api/tauri-etiquettes";
import { EtiquetteForm } from "@/components/etiquettes/EtiquetteForm";
import { EtiquetteContactsPanel } from "@/components/etiquettes/EtiquetteContactsPanel";
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
import { textMatchesSearch } from "@/lib/search-utils";
import { getConditionTypeLabel } from "@/lib/etiquettes/etiquette-condition-labels";
import { runFullEtiquettesRecalc } from "@/lib/etiquettes/sync-etiquettes-auto";
import {
  notifyEtiquettesChanged,
  subscribeEtiquettesChanged,
} from "@/lib/etiquettes/etiquette-events";

interface EtiquettesProps {
  onOpenContact?: (contactId: number) => void;
}

export function Etiquettes({ onOpenContact }: EtiquettesProps) {
  const [etiquettes, setEtiquettes] = useState<EtiquetteWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedEtiquette, setSelectedEtiquette] = useState<EtiquetteWithCount | null>(null);
  const [viewingContacts, setViewingContacts] = useState<EtiquetteWithCount | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [etiquetteToDelete, setEtiquetteToDelete] = useState<EtiquetteWithCount | null>(null);
  const [syncing, setSyncing] = useState(false);

  const sortEtiquettes = useCallback((data: EtiquetteWithCount[]) => {
    return [...data].sort((a, b) => {
      if (b.contact_count !== a.contact_count) return b.contact_count - a.contact_count;
      return b.priorite - a.priorite;
    });
  }, []);

  const refreshEtiquetteCounts = useCallback(async () => {
    try {
      const data = sortEtiquettes(await getAllEtiquettesWithCount());
      setEtiquettes(data);
      setViewingContacts((prev) => {
        if (!prev) return prev;
        return data.find((e) => e.id === prev.id) ?? prev;
      });
    } catch (error) {
      console.error("Error refreshing etiquette counts:", error);
    }
  }, [sortEtiquettes]);

  const loadEtiquettes = async () => {
    try {
      setLoading(true);
      let data = await getAllEtiquettesWithCount();

      if (data.length === 0) {
        const created = await seedDefaultEtiquettes();
        if (created > 0) {
          toast.success(`${created} étiquettes par défaut créées`);
          data = await getAllEtiquettesWithCount();
        }
      }

      setEtiquettes(sortEtiquettes(data));
    } catch (error) {
      console.error("Error loading etiquettes:", error);
      toast.error("Erreur lors du chargement des étiquettes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEtiquettes();
  }, []);

  useEffect(() => {
    return subscribeEtiquettesChanged(() => {
      void refreshEtiquetteCounts();
    });
  }, [refreshEtiquetteCounts]);

  const filteredEtiquettes = etiquettes.filter((etiquette) =>
    textMatchesSearch(searchQuery, etiquette.nom, etiquette.description)
  );

  const handleEditEtiquette = (etiquette: EtiquetteWithCount) => {
    setSelectedEtiquette(etiquette);
    setShowForm(true);
  };

  const handleDeleteClick = (etiquette: EtiquetteWithCount) => {
    if (etiquette.is_default) {
      toast.error("Les étiquettes par défaut ne peuvent pas être supprimées");
      return;
    }
    setEtiquetteToDelete(etiquette);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!etiquetteToDelete) return;

    try {
      await deleteEtiquette(etiquetteToDelete.id);
      toast.success(`Étiquette « ${etiquetteToDelete.nom} » supprimée`);
      if (viewingContacts?.id === etiquetteToDelete.id) setViewingContacts(null);
      notifyEtiquettesChanged();
      await refreshEtiquetteCounts();
    } catch (error) {
      console.error("Error deleting etiquette:", error);
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(msg.includes("défaut") ? msg : "Erreur lors de la suppression");
    } finally {
      setDeleteDialogOpen(false);
      setEtiquetteToDelete(null);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setSelectedEtiquette(null);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const n = await runFullEtiquettesRecalc();
      await refreshEtiquetteCounts();
      toast.success(
        n > 0
          ? `${n} nouvelle${n > 1 ? "s" : ""} attribution${n > 1 ? "s" : ""}`
          : "Compteurs à jour"
      );
    } catch {
      toast.error("Erreur lors du recalcul");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">Étiquettes</h2>
          <p className="text-muted-foreground">
            Les règles auto se mettent à jour à chaque modification de contact ou d&apos;investissement.
            Utilisez « Recalculer les règles » après un import massif.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void handleSync()}
            disabled={syncing}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Recalculer les règles
          </Button>
          <Button className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle étiquette
          </Button>
        </div>
      </div>

      {viewingContacts && (
        <EtiquetteContactsPanel
          etiquette={viewingContacts}
          onClose={() => setViewingContacts(null)}
          onOpenContact={onOpenContact}
          onContactsChanged={loadEtiquettes}
        />
      )}

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Liste des étiquettes</CardTitle>
                <CardDescription>
                  {filteredEtiquettes.length} étiquette{filteredEtiquettes.length > 1 ? "s" : ""} sur{" "}
                  {etiquettes.length}
                </CardDescription>
              </div>
            </div>

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
            <div className="text-center py-8 text-muted-foreground">Chargement...</div>
          ) : filteredEtiquettes.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex p-4 bg-muted rounded-full mb-4">
                <Tag className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery ? "Aucune étiquette trouvée" : "Aucune étiquette"}
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
                  className={`p-4 border rounded-lg hover:shadow-md transition-all ${
                    viewingContacts?.id === etiquette.id
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-border"
                  } ${!etiquette.actif ? "opacity-60 bg-muted/30" : ""}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium shadow-sm"
                      style={{
                        backgroundColor: etiquette.couleur,
                        color: getContrastColor(etiquette.couleur),
                      }}
                    >
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
                      {!etiquette.is_default && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteClick(etiquette)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {etiquette.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {etiquette.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      disabled={etiquette.contact_count === 0}
                      onClick={() => setViewingContacts(etiquette)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full transition-colors ${
                        etiquette.contact_count > 0
                          ? "bg-muted hover:bg-primary/10 hover:text-primary cursor-pointer"
                          : "bg-muted opacity-60 cursor-default"
                      }`}
                      title={
                        etiquette.contact_count > 0
                          ? "Voir les contacts"
                          : "Aucun contact"
                      }
                    >
                      <Users className="h-3 w-3" />
                      <span>
                        {etiquette.contact_count} contact
                        {etiquette.contact_count > 1 ? "s" : ""}
                      </span>
                    </button>

                    <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded-full">
                      {etiquette.auto_condition_type ? (
                        <>
                          <Zap className="h-3 w-3 text-amber-500" />
                          <span>{getConditionTypeLabel(etiquette.auto_condition_type)}</span>
                        </>
                      ) : (
                        <>
                          <Tag className="h-3 w-3" />
                          <span>Manuel</span>
                        </>
                      )}
                    </div>

                    {etiquette.priorite > 0 && (
                      <div className="px-2 py-1 bg-muted rounded-full text-muted-foreground">
                        Priorité {etiquette.priorite}
                      </div>
                    )}

                    {!etiquette.actif && (
                      <div className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                        Désactivée
                      </div>
                    )}

                    {etiquette.is_default && (
                      <div className="px-2 py-1 bg-amber-50 text-amber-800 rounded-full">
                        Système
                      </div>
                    )}

                    {etiquette.email_actif && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                        <span>
                          📧{" "}
                          {etiquette.email_envoi_prevu
                            ? new Date(etiquette.email_envoi_prevu * 1000).toLocaleString("fr-FR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Campagne email"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <EtiquetteForm
        open={showForm}
        onOpenChange={handleFormClose}
        etiquette={selectedEtiquette}
        onSuccess={loadEtiquettes}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette étiquette ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;étiquette « {etiquetteToDelete?.nom} » sera supprimée définitivement.
              {etiquetteToDelete && etiquetteToDelete.contact_count > 0 && (
                <span className="block mt-2 text-destructive">
                  Attention : {etiquetteToDelete.contact_count} contact
                  {etiquetteToDelete.contact_count > 1 ? "s" : ""} perdront cette étiquette.
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
