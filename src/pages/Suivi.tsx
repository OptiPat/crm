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
  formatAlerteContactLabel,
} from "@/lib/api/tauri-alertes";
import { getContactById, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import {
  addMonthsLocal,
  contactToUpdatePayload,
  getClientLabel,
  getFilleulLabel,
  isAlerteSuiviFilleul,
  suiviDatesOverrides,
  todayLocal,
} from "@/lib/contacts/contact-form-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [etiquettes, setEtiquettes] = useState<EtiquetteWithCount[]>([]);
  const [selectedEtiquette, setSelectedEtiquette] = useState<EtiquetteWithCount | null>(null);
  const [etiquetteContacts, setEtiquetteContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [activeTab, setActiveTab] = useState("alertes");
  const [reporterSelectKeys, setReporterSelectKeys] = useState<Record<number, number>>({});
  const [alerteATraiter, setAlerteATraiter] = useState<Alerte | null>(null);
  const [dateDernierSuivi, setDateDernierSuivi] = useState(todayLocal());
  const [submittingTraiter, setSubmittingTraiter] = useState(false);

  useEffect(() => {
    void loadAlertes();
    loadEtiquettes();
  }, []);

  useEffect(() => {
    if (activeTab !== "alertes") return;
    const interval = window.setInterval(() => {
      void loadAlertes({ silent: true });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    const onFocus = () => void loadAlertes({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const loadAlertes = async (options?: { silent?: boolean }) => {
    const showLoading = !options?.silent;
    try {
      if (showLoading) setLoading(true);

      try {
        await checkAndApplyAutoEtiquettes();
      } catch (error) {
        console.error("Error applying auto etiquettes:", error);
      }

      try {
        await checkAndCreateDemembrementAlerts();
      } catch (error) {
        console.error("Error demembrement alerts:", error);
      }

      try {
        await genererAlertesAutomatiques();
      } catch (error) {
        console.error("Error generating alertes:", error);
        if (showLoading) toast.error("Erreur lors de la génération des alertes");
      }

      const data = await getAlertesNonTraitees();
      setAlertes(data);
    } catch (error) {
      console.error("Error loading alertes:", error);
      if (showLoading) toast.error("Erreur lors du chargement des alertes");
    } finally {
      if (showLoading) setLoading(false);
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

  const openTraiterDialog = (alerte: Alerte) => {
    setAlerteATraiter(alerte);
    setDateDernierSuivi(todayLocal());
  };

  const confirmTraiter = async () => {
    if (!alerteATraiter) return;
    setSubmittingTraiter(true);
    try {
      const contact = await getContactById(alerteATraiter.contact_id);
      await updateContact(
        alerteATraiter.contact_id,
        contactToUpdatePayload(
          contact,
          suiviDatesOverrides(alerteATraiter.type_alerte, {
            dernierContact: dateDernierSuivi,
          })
        )
      );
      await marquerAlerteTraitee(alerteATraiter.id);
      setAlertes((prev) => prev.filter((a) => a.id !== alerteATraiter.id));
      setAlerteATraiter(null);
      toast.success("Suivi enregistré sur le contact");
      void loadAlertes({ silent: true });
    } catch (error) {
      console.error("Error marking alerte as treated:", error);
      toast.error("Erreur lors du traitement");
    } finally {
      setSubmittingTraiter(false);
    }
  };

  const handleReporterSuivi = async (alerte: Alerte, mois: number) => {
    try {
      const contact = await getContactById(alerte.contact_id);

      await updateContact(
        alerte.contact_id,
        contactToUpdatePayload(
          contact,
          suiviDatesOverrides(alerte.type_alerte, {
            dernierContact: todayLocal(),
            prochainSuivi: addMonthsLocal(mois),
          })
        )
      );

      await marquerAlerteTraitee(alerte.id);
      setAlertes((prev) => prev.filter((a) => a.id !== alerte.id));
      setReporterSelectKeys((prev) => ({
        ...prev,
        [alerte.id]: (prev[alerte.id] ?? 0) + 1,
      }));
      toast.success(`Suivi reporté de ${mois} mois`);
      void loadAlertes({ silent: true });
    } catch (error) {
      console.error("Error reporting suivi:", error);
      toast.error("Erreur lors du report du suivi");
    }
  };

  const handleSupprimer = async (id: number) => {
    try {
      await deleteAlerte(id);
      setAlertes((prev) => prev.filter((a) => a.id !== id));
      toast.success("Alerte supprimée");
      void loadAlertes({ silent: true });
    } catch (error) {
      console.error("Error deleting alerte:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const getTypeAlerteColor = (type: string) => {
    switch (type) {
      case "SUIVI_CLIENT_1AN":
      case "SUIVI_CLIENT_ANNUEL":
      case "CLIENT_JAMAIS_SUIVI":
      case "SUIVI_FILLEUL_1AN":
        return "bg-red-100 text-red-800";
      case "LEAD_SUIVI_6MOIS":
      case "SUIVI_PROSPECT_6MOIS":
      case "LEAD_JAMAIS_CONTACTE":
      case "FILLEUL_SUIVI_6MOIS":
      case "FILLEUL_JAMAIS_CONTACTE":
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
      case "SUIVI_CLIENT_1AN":
      case "SUIVI_CLIENT_ANNUEL":
        return "Suivi client +1 an";
      case "CLIENT_JAMAIS_SUIVI":
        return "Client jamais suivi";
      case "LEAD_SUIVI_6MOIS":
      case "SUIVI_PROSPECT_6MOIS":
        return "Suivi prospect +6 mois";
      case "LEAD_JAMAIS_CONTACTE":
        return "Prospect jamais contacté";
      case "SUIVI_FILLEUL_1AN":
        return "Filleul suivi +1 an";
      case "FILLEUL_SUIVI_6MOIS":
        return "Filleul suivi +6 mois";
      case "FILLEUL_JAMAIS_CONTACTE":
        return "Filleul jamais contacté";
      case "FIN_DEMEMBREMENT":
        return "Fin démembrement";
      case "ANNIVERSAIRE":
        return "Anniversaire";
      default:
        return type.replace(/_/g, " ").toLowerCase();
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
        {loading && (
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        )}
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
                    Aucune alerte en attente dans la liste de suivi.
                  </p>
                  {totalContactsAvecEtiquettes > 0 && (
                    <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                      Des contacts peuvent toutefois avoir une étiquette de relance
                      (onglet Étiquettes). Les alertes se créent à partir des dates de
                      dernier contact.
                    </p>
                  )}
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
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => openTraiterDialog(alerte)}
                        >
                          <Check className="h-4 w-4" />
                          Marquer comme traité
                        </Button>

                        <Select
                          key={`reporter-${alerte.id}-${reporterSelectKeys[alerte.id] ?? 0}`}
                          onValueChange={(value) =>
                            handleReporterSuivi(alerte, parseInt(value, 10))
                          }
                        >
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
                          type="button"
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
                          type="button"
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
                            {[
                              getFilleulLabel(contact.filleul_categorie),
                              getClientLabel(contact.categorie),
                            ]
                              .filter(Boolean)
                              .join(" · ") || contact.categorie}
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

      <Dialog
        open={alerteATraiter !== null}
        onOpenChange={(open) => {
          if (!open) setAlerteATraiter(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marquer le suivi comme effectué</DialogTitle>
            <DialogDescription>
              {alerteATraiter && (
                <>
                  <span className="font-medium text-foreground">
                    {formatAlerteContactLabel(
                      alerteATraiter.message,
                      alerteATraiter.type_alerte
                    )}
                  </span>
                  {" · "}
                  {getTypeAlerteLabel(alerteATraiter.type_alerte)}
                  {isAlerteSuiviFilleul(alerteATraiter.type_alerte)
                    ? " — mise à jour de la date de dernier contact filleul."
                    : " — mise à jour de la date de dernier contact."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="date-dernier-suivi">Date du dernier suivi</Label>
            <Input
              id="date-dernier-suivi"
              type="date"
              value={dateDernierSuivi}
              onChange={(e) => setDateDernierSuivi(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAlerteATraiter(null)}
              disabled={submittingTraiter}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={() => void confirmTraiter()}
              disabled={submittingTraiter || !dateDernierSuivi}
            >
              {submittingTraiter ? "Enregistrement…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
