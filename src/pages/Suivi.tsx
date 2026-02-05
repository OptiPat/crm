import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Check, X, RefreshCw, Mail, Clock, Tag, Users } from "lucide-react";
import {
  getAlertesNonTraitees,
  marquerAlerteTraitee,
  deleteAlerte,
  genererAlertesAutomatiques,
  checkAndCreateDemembrementAlerts,
  type Alerte,
} from "@/lib/api/tauri-alertes";
import { getContactById, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAllEtiquettesWithCount,
  getContactsByEtiquette,
  retirerEtiquette,
  checkAndApplyAutoEtiquettes,
  getContrastColor,
  type EtiquetteWithCount,
} from "@/lib/api/tauri-etiquettes";
import { toast } from "sonner";

export function Suivi() {
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingAlertes, setGeneratingAlertes] = useState(false);
  const [etiquettes, setEtiquettes] = useState<EtiquetteWithCount[]>([]);
  const [selectedEtiquette, setSelectedEtiquette] = useState<EtiquetteWithCount | null>(null);
  const [etiquetteContacts, setEtiquetteContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [activeTab, setActiveTab] = useState("alertes");

  useEffect(() => {
    loadAlertes();
    loadEtiquettes();
  }, []);

  const loadAlertes = async () => {
    try {
      // Vérifier et créer les alertes de fin de démembrement
      await checkAndCreateDemembrementAlerts();
      
      // Charger toutes les alertes non traitées
      const data = await getAlertesNonTraitees();
      setAlertes(data);
    } catch (error) {
      console.error("Error loading alertes:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadEtiquettes = async () => {
    try {
      // Appliquer les étiquettes automatiques
      await checkAndApplyAutoEtiquettes();
      
      // Charger les étiquettes avec compteur
      const data = await getAllEtiquettesWithCount();
      // Trier par nombre de contacts (desc) puis par priorité
      const sorted = data.sort((a, b) => {
        if (b.contact_count !== a.contact_count) {
          return b.contact_count - a.contact_count;
        }
        return b.priorite - a.priorite;
      });
      setEtiquettes(sorted);
      
      // Sélectionner la première étiquette avec des contacts
      const firstWithContacts = sorted.find(e => e.contact_count > 0);
      if (firstWithContacts) {
        handleSelectEtiquette(firstWithContacts);
      }
    } catch (error) {
      console.error("Error loading etiquettes:", error);
    }
  };

  const handleSelectEtiquette = async (etiquette: EtiquetteWithCount) => {
    setSelectedEtiquette(etiquette);
    setLoadingContacts(true);
    try {
      const contacts = await getContactsByEtiquette(etiquette.id) as Contact[];
      setEtiquetteContacts(contacts);
    } catch (error) {
      console.error("Error loading contacts for etiquette:", error);
      setEtiquetteContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleRetirerEtiquetteContact = async (contactId: number) => {
    if (!selectedEtiquette) return;
    
    try {
      await retirerEtiquette(contactId, selectedEtiquette.id);
      toast.success("Étiquette retirée");
      
      // Recharger les contacts et les étiquettes
      await handleSelectEtiquette(selectedEtiquette);
      await loadEtiquettes();
    } catch (error) {
      console.error("Error removing etiquette:", error);
      toast.error("Erreur lors du retrait de l'étiquette");
    }
  };

  const handleGenererAlertes = async () => {
    setGeneratingAlertes(true);
    try {
      const count = await genererAlertesAutomatiques();
      alert(`${count} nouvelle(s) alerte(s) générée(s)`);
      await loadAlertes();
    } catch (error) {
      console.error("Error generating alertes:", error);
      alert("Erreur lors de la génération des alertes");
    } finally {
      setGeneratingAlertes(false);
    }
  };

  const handleTraiter = async (id: number) => {
    try {
      await marquerAlerteTraitee(id);
      await loadAlertes();
    } catch (error) {
      console.error("Error marking alerte as treated:", error);
      alert("Erreur lors du traitement");
    }
  };

  const handleReporterSuivi = async (alerte: Alerte, mois: number) => {
    try {
      // Récupérer le contact
      const contact = await getContactById(alerte.contact_id);

      // Calculer la nouvelle date de prochain suivi
      const now = new Date();
      const nextDate = new Date(now.getTime() + mois * 30 * 24 * 60 * 60 * 1000);
      const nextDateTimestamp = Math.floor(nextDate.getTime() / 1000).toString();

      // Mettre à jour le contact (ne passer que les champs nécessaires)
      await updateContact(alerte.contact_id, {
        nom: contact.nom,
        prenom: contact.prenom,
        categorie: contact.categorie,
        civilite: contact.civilite,
        email: contact.email,
        telephone: contact.telephone,
        adresse: contact.adresse,
        code_postal: contact.code_postal,
        ville: contact.ville,
        profession: contact.profession,
        situation_familiale: contact.situation_familiale,
        source_lead: contact.source_lead,
        profil_risque_sri: contact.profil_risque_sri,
        statut_suivi: contact.statut_suivi,
        notes: contact.notes,
        foyer_id: contact.foyer_id,
        // Dates CLIENT
        date_prochain_suivi: nextDateTimestamp,
        date_dernier_contact: Math.floor(now.getTime() / 1000).toString(),
        // Préserver les dates FILLEUL
        date_dernier_contact_filleul: contact.date_dernier_contact_filleul 
          ? new Date(contact.date_dernier_contact_filleul * 1000).toISOString() 
          : undefined,
        date_prochain_suivi_filleul: contact.date_prochain_suivi_filleul 
          ? new Date(contact.date_prochain_suivi_filleul * 1000).toISOString() 
          : undefined,
      });

      // Marquer l'alerte comme traitée
      await marquerAlerteTraitee(alerte.id);
      await loadAlertes();
    } catch (error) {
      console.error("Error reporting suivi:", error);
      alert("Erreur lors du report du suivi");
    }
  };

  const handleSupprimer = async (id: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette alerte ?")) return;

    try {
      await deleteAlerte(id);
      await loadAlertes();
    } catch (error) {
      console.error("Error deleting alerte:", error);
      alert("Erreur lors de la suppression");
    }
  };

  const getTypeAlerteColor = (type: string) => {
    switch (type) {
      case "SUIVI_CLIENT_ANNUEL":
        return "bg-red-100 text-red-800";
      case "SUIVI_PROSPECT_6MOIS":
        return "bg-orange-100 text-orange-800";
      case "FIN_DEMEMBREMENT":
        return "bg-blue-100 text-blue-800";
      case "ANNIVERSAIRE":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeAlerteLabel = (type: string) => {
    switch (type) {
      case "SUIVI_CLIENT_ANNUEL":
        return "Suivi client annuel";
      case "SUIVI_PROSPECT_6MOIS":
        return "Suivi prospect 6 mois";
      case "FIN_DEMEMBREMENT":
        return "Fin démembrement";
      case "ANNIVERSAIRE":
        return "Anniversaire";
      default:
        return type;
    }
  };

  // Compter le total de contacts avec étiquettes
  const totalContactsAvecEtiquettes = etiquettes.reduce((sum, e) => sum + e.contact_count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Suivi des contacts
          </h2>
          <p className="text-muted-foreground">
            Gérez les alertes et le suivi de vos contacts
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={handleGenererAlertes}
          disabled={generatingAlertes}
        >
          <RefreshCw className={`h-4 w-4 ${generatingAlertes ? "animate-spin" : ""}`} />
          Générer les alertes
        </Button>
      </div>

      {/* Résumé */}
      {(alertes.length > 0 || totalContactsAvecEtiquettes > 0) && (
        <div className="flex gap-4">
          {alertes.length > 0 && (
            <Card className="bg-orange-50 border-orange-200 flex-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  <p className="text-sm font-medium text-orange-900">
                    {alertes.length} alerte{alertes.length > 1 ? "s" : ""} à traiter
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {totalContactsAvecEtiquettes > 0 && (
            <Card className="bg-blue-50 border-blue-200 flex-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-blue-600" />
                  <p className="text-sm font-medium text-blue-900">
                    {totalContactsAvecEtiquettes} contact{totalContactsAvecEtiquettes > 1 ? "s" : ""} étiquetté{totalContactsAvecEtiquettes > 1 ? "s" : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="alertes" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Alertes
            {alertes.length > 0 && (
              <Badge variant="secondary" className="ml-1">{alertes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="etiquettes" className="gap-2">
            <Tag className="h-4 w-4" />
            Étiquettes
            {totalContactsAvecEtiquettes > 0 && (
              <Badge variant="secondary" className="ml-1">{totalContactsAvecEtiquettes}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Onglet Alertes */}
        <TabsContent value="alertes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Alertes de suivi</CardTitle>
              <CardDescription>
                {alertes.length} alerte{alertes.length > 1 ? "s" : ""} non traitée{alertes.length > 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Chargement...
                </div>
              ) : alertes.length === 0 ? (
                <div className="text-center py-8">
                  <Check className="h-12 w-12 mx-auto mb-4 text-green-600" />
                  <p className="text-muted-foreground">
                    Aucune alerte en attente. Tous vos contacts sont à jour !
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alertes.map((alerte) => (
                    <div
                      key={alerte.id}
                      className="p-4 border border-border rounded-lg bg-card"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle className="h-5 w-5 text-orange-600" />
                            <h3 className="font-semibold">{alerte.message}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getTypeAlerteColor(alerte.type_alerte)}>
                              {getTypeAlerteLabel(alerte.type_alerte)}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(alerte.date_alerte * 1000).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleTraiter(alerte.id)}
                        >
                          <Check className="h-4 w-4" />
                          Marquer comme traité
                        </Button>

                        <Select onValueChange={(value) => handleReporterSuivi(alerte, parseInt(value))}>
                          <SelectTrigger className="w-[180px] h-9">
                            <Clock className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="Reporter le suivi" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">Dans 3 mois</SelectItem>
                            <SelectItem value="6">Dans 6 mois</SelectItem>
                            <SelectItem value="12">Dans 12 mois</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          disabled
                          title="Fonctionnalité disponible prochainement"
                        >
                          <Mail className="h-4 w-4" />
                          Envoyer un email
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleSupprimer(alerte.id)}
                        >
                          <X className="h-4 w-4" />
                          Supprimer
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Étiquettes */}
        <TabsContent value="etiquettes" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Liste des étiquettes */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">Étiquettes actives</CardTitle>
                <CardDescription>
                  Sélectionnez une étiquette pour voir les contacts
                </CardDescription>
              </CardHeader>
              <CardContent>
                {etiquettes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Aucune étiquette
                  </p>
                ) : (
                  <div className="space-y-2">
                    {etiquettes.filter(e => e.contact_count > 0).map((etiquette) => (
                      <button
                        key={etiquette.id}
                        onClick={() => handleSelectEtiquette(etiquette)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                          selectedEtiquette?.id === etiquette.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: etiquette.couleur,
                            color: getContrastColor(etiquette.couleur)
                          }}
                        >
                          {etiquette.icone && <span>{etiquette.icone}</span>}
                          <span>{etiquette.nom}</span>
                        </span>
                        <Badge variant="secondary">
                          {etiquette.contact_count}
                        </Badge>
                      </button>
                    ))}
                    
                    {etiquettes.filter(e => e.contact_count > 0).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Aucun contact étiqueté
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contacts de l'étiquette sélectionnée */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      {selectedEtiquette ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
                          style={{
                            backgroundColor: selectedEtiquette.couleur,
                            color: getContrastColor(selectedEtiquette.couleur)
                          }}
                        >
                          {selectedEtiquette.icone && <span>{selectedEtiquette.icone}</span>}
                          <span>{selectedEtiquette.nom}</span>
                        </span>
                      ) : (
                        "Contacts"
                      )}
                    </CardTitle>
                    <CardDescription>
                      {selectedEtiquette
                        ? `${etiquetteContacts.length} contact${etiquetteContacts.length > 1 ? "s" : ""}`
                        : "Sélectionnez une étiquette"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!selectedEtiquette ? (
                  <div className="text-center py-8">
                    <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Sélectionnez une étiquette pour voir les contacts associés
                    </p>
                  </div>
                ) : loadingContacts ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Chargement...
                  </div>
                ) : etiquetteContacts.length === 0 ? (
                  <div className="text-center py-8">
                    <Check className="h-12 w-12 mx-auto mb-4 text-green-600" />
                    <p className="text-muted-foreground">
                      Aucun contact avec cette étiquette
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {etiquetteContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50"
                      >
                        <div>
                          <p className="font-medium">
                            {contact.prenom} {contact.nom}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {contact.categorie}
                            {contact.email && ` • ${contact.email}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled
                            title="Fonctionnalité disponible prochainement"
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-muted-foreground hover:text-destructive"
                            onClick={() => contact.id && handleRetirerEtiquetteContact(contact.id)}
                            title="Retirer l'étiquette"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
