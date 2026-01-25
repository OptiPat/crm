import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Home,
  Briefcase,
  PiggyBank,
  TrendingUp,
  Building2,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from "lucide-react";
import type { ExtractedData } from "@/lib/pdf";
import type { OrigineInvestissement, NewInvestissement } from "@/lib/api/tauri-investissements";

// Types de patrimoine détectés dans un RIO
interface PatrimoineItem {
  id: string;
  type: "IMMOBILIER" | "ASSURANCE_VIE" | "PER" | "SCPI" | "AUTRE" | "EPARGNE_BANCAIRE";
  label: string;
  montant: number;
  autoOrigine?: OrigineInvestissement; // Si défini, pas de question (ex: Livret A → toujours EXISTANT_CLIENT)
  origine?: OrigineInvestissement; // Choix de l'utilisateur
}

interface PatrimoineTriDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractedData: ExtractedData;
  contactId: number;
  onComplete: (investissements: NewInvestissement[]) => void;
  onCancel: () => void;
}

// Extraire les éléments de patrimoine depuis les données du RIO
function extractPatrimoineItems(data: ExtractedData): PatrimoineItem[] {
  const items: PatrimoineItem[] = [];

  // === ÉPARGNE BANCAIRE (automatiquement "À côté") ===
  if (data.livretA && data.livretA > 0) {
    items.push({
      id: "livret-a",
      type: "EPARGNE_BANCAIRE",
      label: "Livret A",
      montant: data.livretA,
      autoOrigine: "EXISTANT_CLIENT",
    });
  }
  
  if (data.ldd && data.ldd > 0) {
    items.push({
      id: "ldd",
      type: "EPARGNE_BANCAIRE",
      label: "LDD (Livret Développement Durable)",
      montant: data.ldd,
      autoOrigine: "EXISTANT_CLIENT",
    });
  }
  
  if (data.compteCourant && data.compteCourant > 0) {
    items.push({
      id: "compte-courant",
      type: "EPARGNE_BANCAIRE",
      label: "Compte courant",
      montant: data.compteCourant,
      autoOrigine: "EXISTANT_CLIENT",
    });
  }
  
  if (data.livretEpargne && data.livretEpargne > 0) {
    items.push({
      id: "livret-epargne",
      type: "EPARGNE_BANCAIRE",
      label: "Livret d'épargne",
      montant: data.livretEpargne,
      autoOrigine: "EXISTANT_CLIENT",
    });
  }

  // === IMMOBILIER (à trier) ===
  // Nouvelle structure : utiliser biensImmobiliers si disponible
  if (data.biensImmobiliers && data.biensImmobiliers.length > 0) {
    for (const bien of data.biensImmobiliers) {
      if (bien.valeur && bien.valeur > 0) {
        items.push({
          id: bien.id,
          type: "IMMOBILIER",
          label: bien.nom,
          montant: bien.valeur,
        });
      }
    }
  } else {
    // Fallback : ancienne structure
    if (data.residencePrincipale?.valeur && data.residencePrincipale.valeur > 0) {
      items.push({
        id: "residence-principale",
        type: "IMMOBILIER",
        label: "Résidence principale",
        montant: data.residencePrincipale.valeur,
      });
    }
    
    if (data.residenceSecondaire?.valeur && data.residenceSecondaire.valeur > 0) {
      items.push({
        id: "residence-secondaire",
        type: "IMMOBILIER",
        label: "Résidence secondaire",
        montant: data.residenceSecondaire.valeur,
      });
    }
    
    if (data.immobilierLocatif?.valeur && data.immobilierLocatif.valeur > 0) {
      items.push({
        id: "immobilier-locatif",
        type: "IMMOBILIER",
        label: "Immobilier locatif",
        montant: data.immobilierLocatif.valeur,
      });
    }
  }

  // === ASSURANCE-VIE (à trier) ===
  if (data.assuranceVie && data.assuranceVie > 0) {
    items.push({
      id: "assurance-vie",
      type: "ASSURANCE_VIE",
      label: "Assurance-vie",
      montant: data.assuranceVie,
    });
  }

  // === PER (à trier) ===
  if (data.per && data.per > 0) {
    items.push({
      id: "per",
      type: "PER",
      label: "PER (Plan Épargne Retraite)",
      montant: data.per,
    });
  }

  // === SCPI (à trier) ===
  if (data.scpi && data.scpi > 0) {
    items.push({
      id: "scpi",
      type: "SCPI",
      label: "SCPI",
      montant: data.scpi,
    });
  }

  // === Autres placements (à trier) ===
  if (data.actionsObligations && data.actionsObligations > 0) {
    items.push({
      id: "actions-obligations",
      type: "AUTRE",
      label: "Actions / Obligations",
      montant: data.actionsObligations,
    });
  }

  return items;
}

// Formater un montant en euros
function formatEuro(montant: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(montant);
}

// Icône par type de patrimoine
function getTypeIcon(type: PatrimoineItem["type"]) {
  switch (type) {
    case "IMMOBILIER":
      return <Home className="h-5 w-5" />;
    case "ASSURANCE_VIE":
      return <Briefcase className="h-5 w-5" />;
    case "PER":
      return <TrendingUp className="h-5 w-5" />;
    case "SCPI":
      return <Building2 className="h-5 w-5" />;
    case "EPARGNE_BANCAIRE":
      return <PiggyBank className="h-5 w-5" />;
    default:
      return <Briefcase className="h-5 w-5" />;
  }
}

// Couleur par type de patrimoine
function getTypeColor(type: PatrimoineItem["type"]) {
  switch (type) {
    case "IMMOBILIER":
      return "bg-orange-100 text-orange-700";
    case "ASSURANCE_VIE":
      return "bg-blue-100 text-blue-700";
    case "PER":
      return "bg-green-100 text-green-700";
    case "SCPI":
      return "bg-purple-100 text-purple-700";
    case "EPARGNE_BANCAIRE":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export function PatrimoineTriDialog({
  open,
  onOpenChange,
  extractedData,
  contactId,
  onComplete,
  onCancel,
}: PatrimoineTriDialogProps) {
  const [items, setItems] = useState<PatrimoineItem[]>(() => 
    extractPatrimoineItems(extractedData)
  );

  // Séparer les items automatiques des items à trier
  const autoItems = items.filter(item => item.autoOrigine);
  const toTriItems = items.filter(item => !item.autoOrigine);

  // Vérifier si tous les items à trier ont été traités
  const allTriCompleted = toTriItems.every(item => item.origine);

  // Compteurs
  const avecMoiCount = items.filter(item => item.origine === "MON_CONSEIL" || (item.autoOrigine === "MON_CONSEIL")).length;
  const aCoteCount = items.filter(item => item.origine === "EXISTANT_CLIENT" || (item.autoOrigine === "EXISTANT_CLIENT")).length;

  // Mettre à jour l'origine d'un item
  const setOrigine = (itemId: string, origine: OrigineInvestissement) => {
    setItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, origine } : item
    ));
  };

  // Valider et créer les investissements
  const handleValidate = () => {
    const investissements: NewInvestissement[] = items
      .filter(item => {
        // Exclure l'épargne bancaire de la création d'investissements
        // (on la stocke juste pour info dans les notes du contact)
        return item.type !== "EPARGNE_BANCAIRE";
      })
      .map(item => ({
        contact_id: contactId,
        type_produit: item.type === "IMMOBILIER" ? "IMMOBILIER" : 
                      item.type === "ASSURANCE_VIE" ? "ASSURANCE_VIE" :
                      item.type === "PER" ? "PER" :
                      item.type === "SCPI" ? "SCPI" : "AUTRE",
        nom_produit: item.label,
        montant_initial: Math.round(item.montant * 100), // En centimes
        origine: item.origine || item.autoOrigine || "EXISTANT_CLIENT",
      }));

    onComplete(investissements);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  // Calculer les totaux
  const totalAvecMoi = items
    .filter(i => i.origine === "MON_CONSEIL")
    .reduce((sum, i) => sum + i.montant, 0);
  const totalACote = items
    .filter(i => i.origine === "EXISTANT_CLIENT" || i.autoOrigine === "EXISTANT_CLIENT")
    .reduce((sum, i) => sum + i.montant, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-blue-600" />
            Tri du patrimoine
          </DialogTitle>
          <DialogDescription>
            Pour chaque investissement détecté, indiquez s'il a été placé <strong>avec vous</strong> ou s'il existait <strong>à côté</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Épargne bancaire (automatique) */}
          {autoItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-gray-400" />
                Épargne bancaire (stockée automatiquement "À côté")
              </h3>
              <div className="space-y-2 pl-6">
                {autoItems.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${getTypeColor(item.type)}`}>
                        {getTypeIcon(item.type)}
                      </div>
                      <div>
                        <p className="font-medium">{item.label}</p>
                        <p className="text-sm text-muted-foreground">{formatEuro(item.montant)}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-gray-500">
                      📋 À côté
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Investissements à trier */}
          {toTriItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-blue-500" />
                Investissements à trier ({toTriItems.filter(i => i.origine).length}/{toTriItems.length})
              </h3>
              <div className="space-y-3">
                {toTriItems.map(item => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      item.origine === "MON_CONSEIL" 
                        ? "border-green-500 bg-green-50" 
                        : item.origine === "EXISTANT_CLIENT"
                        ? "border-gray-400 bg-gray-50"
                        : "border-blue-300 bg-blue-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${getTypeColor(item.type)}`}>
                          {getTypeIcon(item.type)}
                        </div>
                        <div>
                          <p className="font-semibold">{item.label}</p>
                          <p className="text-lg font-bold text-primary">{formatEuro(item.montant)}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant={item.origine === "MON_CONSEIL" ? "default" : "outline"}
                        size="sm"
                        className={`flex-1 ${item.origine === "MON_CONSEIL" ? "bg-green-600 hover:bg-green-700" : ""}`}
                        onClick={() => setOrigine(item.id, "MON_CONSEIL")}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        🎯 Avec moi
                      </Button>
                      <Button
                        variant={item.origine === "EXISTANT_CLIENT" ? "default" : "outline"}
                        size="sm"
                        className={`flex-1 ${item.origine === "EXISTANT_CLIENT" ? "bg-gray-600 hover:bg-gray-700" : ""}`}
                        onClick={() => setOrigine(item.id, "EXISTANT_CLIENT")}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        📋 À côté
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aucun patrimoine détecté */}
          {items.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <PiggyBank className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Aucun patrimoine détecté dans ce document.</p>
            </div>
          )}

          {/* Résumé */}
          {items.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-3">Résumé</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-700 font-medium">🎯 Avec moi</p>
                  <p className="text-xl font-bold text-green-800">{formatEuro(totalAvecMoi)}</p>
                  <p className="text-xs text-green-600">{avecMoiCount} investissement(s)</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-700 font-medium">📋 À côté</p>
                  <p className="text-xl font-bold text-gray-800">{formatEuro(totalACote)}</p>
                  <p className="text-xs text-gray-600">{aCoteCount} élément(s)</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Annuler
          </Button>
          <Button 
            onClick={handleValidate}
            disabled={!allTriCompleted && toTriItems.length > 0}
          >
            {allTriCompleted || toTriItems.length === 0
              ? "Valider l'import"
              : `Trier les ${toTriItems.length - toTriItems.filter(i => i.origine).length} restant(s)`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
