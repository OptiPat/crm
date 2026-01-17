import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  TrendingUp,
  Target,
  FileText,
  Edit,
  Trash2,
  Coins,
  Wallet,
  User,
} from "lucide-react";
import { type Foyer } from "@/lib/api/tauri-foyers";
import { FoyerForm } from "./FoyerForm";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getInvestissementsByFoyer, type Investissement } from "@/lib/api/tauri-investissements";
import { InvestissementForm } from "@/components/investissements/InvestissementForm";

interface FoyerDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foyer: Foyer | null;
  onDelete: (id: number) => void;
  onUpdate: () => void;
}

export function FoyerDetail({
  open,
  onOpenChange,
  foyer,
  onDelete,
  onUpdate,
}: FoyerDetailProps) {
  const [showEditForm, setShowEditForm] = useState(false);
  const [showInvestissementForm, setShowInvestissementForm] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissements, setInvestissements] = useState<Investissement[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Charger les données du foyer
  useEffect(() => {
    if (foyer?.id && open) {
      loadFoyerData();
    }
  }, [foyer?.id, open]);

  const loadFoyerData = async () => {
    if (!foyer?.id) return;

    setLoadingData(true);
    try {
      const [allContacts, foyerInvestissements] = await Promise.all([
        getAllContacts(),
        getInvestissementsByFoyer(foyer.id),
      ]);

      // Filtrer les contacts du foyer
      const foyerContacts = allContacts.filter((c) => c.foyer_id === foyer.id);
      setContacts(foyerContacts);
      setInvestissements(foyerInvestissements);
    } catch (error) {
      console.error("Error loading foyer data:", error);
    } finally {
      setLoadingData(false);
    }
  };

  // Calculer le total patrimoine du foyer (investissements communs uniquement)
  const totalPatrimoineFoyer = investissements.reduce(
    (total, inv) => total + (inv.montant_initial || 0),
    0
  );

  // Formatage des montants
  const formatEuro = (centimes?: number) => {
    if (!centimes) return "-";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(centimes / 100);
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
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Formatage du type de produit
  const formatTypeProduit = (type: string) => {
    const labels: Record<string, string> = {
      "SCPI": "SCPI",
      "SCPI_DEMEMBREMENT": "SCPI Démembrement",
      "ASSURANCE_VIE": "Assurance Vie",
      "PER": "PER",
      "IMMOBILIER": "Immobilier",
      "FIP_FCPI": "FIP/FCPI",
      "FCPR": "FCPR",
      "G3F": "G3F",
      "PINEL": "Pinel",
      "AUTRE": "Autre",
    };
    return labels[type] || type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  if (!foyer) return null;

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

  const handleDelete = () => {
    if (
      window.confirm(
        `Êtes-vous sûr de vouloir supprimer le foyer "${foyer.nom}" ?`
      )
    ) {
      onDelete(foyer.id);
      onOpenChange(false);
    }
  };

  const formatCurrency = (value?: number) => {
    if (!value) return "Non renseigné";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-2xl">{foyer.nom}</DialogTitle>
                <DialogDescription className="sr-only">
                  Détails du foyer fiscal et patrimoine associé
                </DialogDescription>
                <div className="flex gap-2 mt-2">
                  <Badge className={getTypeColor(foyer.type_foyer)}>
                    {foyer.type_foyer}
                  </Badge>
                  {foyer.tranche_imposition && (
                    <Badge variant="outline">
                      TMI {foyer.tranche_imposition}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowEditForm(true)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleDelete}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {/* Informations fiscales */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Coins className="h-5 w-5" />
                  Informations fiscales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Parts fiscales
                    </div>
                    <div className="text-lg font-semibold">
                      {foyer.nombre_parts_fiscales || "Non renseigné"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Tranche marginale d'imposition
                    </div>
                    <div className="text-lg font-semibold">
                      {foyer.tranche_imposition || "Non renseigné"}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    Revenu fiscal de référence
                  </div>
                  <div className="text-lg font-semibold">
                    {formatCurrency(foyer.revenu_fiscal_reference)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Situation patrimoniale */}
            {foyer.situation_patrimoniale && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Situation patrimoniale
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">
                    {foyer.situation_patrimoniale}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Objectifs patrimoniaux */}
            {foyer.objectifs_patrimoniaux && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Objectifs patrimoniaux
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">
                    {foyer.objectifs_patrimoniaux}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Membres du foyer */}
            {contacts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Membres du foyer ({contacts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                      >
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium">
                            {contact.prenom} {contact.nom}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {contact.email || contact.telephone}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Investissements du foyer */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      Patrimoine du foyer
                    </CardTitle>
                    <div className="text-xl font-bold text-primary">
                      {formatEuro(totalPatrimoineFoyer)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowInvestissementForm(true)}
                  >
                    Ajouter un investissement
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingData ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    Chargement des investissements...
                  </div>
                ) : investissements.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    Aucun investissement commun pour ce foyer
                  </div>
                ) : (
                  <div className="space-y-3">
                    {investissements.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={getTypeProduitColor(inv.type_produit)}>
                              {formatTypeProduit(inv.type_produit)}
                            </Badge>
                            {inv.versement_programme && (
                              <Badge variant="outline" className="text-xs">
                                VP
                              </Badge>
                            )}
                            {inv.reinvestissement_dividendes && (
                              <Badge variant="outline" className="text-xs">
                                Reinv. dividendes
                              </Badge>
                            )}
                          </div>
                          <div className="font-medium">{inv.nom_produit}</div>
                          {inv.date_souscription && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Souscrit le{" "}
                              {new Date(inv.date_souscription * 1000).toLocaleDateString(
                                "fr-FR"
                              )}
                            </div>
                          )}
                          {inv.date_fin_demembrement && (
                            <div className="text-xs text-orange-600 mt-1">
                              Fin démembrement:{" "}
                              {new Date(
                                inv.date_fin_demembrement * 1000
                              ).toLocaleDateString("fr-FR")}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold">
                            {formatEuro(inv.montant_initial)}
                          </div>
                          {inv.versement_programme && (
                            <div className="text-xs text-muted-foreground">
                              + {formatEuro(inv.montant_versement_programme)} /{" "}
                              {inv.frequence_versement?.toLowerCase()}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            {foyer.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{foyer.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Métadonnées */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informations système</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <div>
                  Créé le:{" "}
                  {new Date(foyer.created_at * 1000).toLocaleString("fr-FR")}
                </div>
                <div>
                  Mis à jour le:{" "}
                  {new Date(foyer.updated_at * 1000).toLocaleString("fr-FR")}
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Formulaire de modification */}
      <FoyerForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        foyer={foyer}
        onSuccess={() => {
          onUpdate();
          setShowEditForm(false);
        }}
      />

      {/* Formulaire d'ajout d'investissement */}
      {foyer && (
        <InvestissementForm
          open={showInvestissementForm}
          onOpenChange={setShowInvestissementForm}
          investissement={null}
          defaultContactId={contacts.length > 0 ? contacts[0]?.id : undefined}
          defaultFoyerId={foyer.id}
          onSuccess={() => {
            loadFoyerData();
            setShowInvestissementForm(false);
          }}
        />
      )}
    </>
  );
}
