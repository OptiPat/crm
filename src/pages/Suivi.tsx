import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Check, X, RefreshCw, Mail, Clock } from "lucide-react";
import {
  getAlertesNonTraitees,
  marquerAlerteTraitee,
  deleteAlerte,
  genererAlertesAutomatiques,
  checkAndCreateDemembrementAlerts,
  type Alerte,
} from "@/lib/api/tauri-alertes";
import { getContactById, updateContact } from "@/lib/api/tauri-contacts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Suivi() {
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingAlertes, setGeneratingAlertes] = useState(false);

  useEffect(() => {
    loadAlertes();
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

      // Mettre à jour le contact
      await updateContact(alerte.contact_id, {
        ...contact,
        date_prochain_suivi: nextDateTimestamp,
        date_dernier_contact: Math.floor(now.getTime() / 1000).toString(),
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

      {alertes.length > 0 && (
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <p className="text-sm font-medium text-orange-900">
                Vous avez {alertes.length} alerte{alertes.length > 1 ? "s" : ""} à traiter
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
