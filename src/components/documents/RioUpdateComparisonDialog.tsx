import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Home,
  TrendingUp,
  Building2,
  PiggyBank,
  RefreshCw,
  Plus,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import type { ExtractedData } from "@/lib/pdf";
import type { Investissement, NewInvestissement, OrigineInvestissement } from "@/lib/api/tauri-investissements";
import { getInvestissementsByContact, updateInvestissement, createInvestissement } from "@/lib/api/tauri-investissements";
import { getAllPartenaires, type Partenaire } from "@/lib/api/tauri-partenaires";

interface RioUpdateComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractedData: ExtractedData;
  contactId: number;
  contactNom: string;
  onComplete: () => void;
  onCancel: () => void;
}

// Représente un investissement extrait du RIO
interface ExtractedInvestissement {
  id: string;
  type: string;
  label: string;
  montant: number;
  origine?: OrigineInvestissement;
  // Données optionnelles extraites du RIO
  creditCRD?: number;
  mensualiteCredit?: number;
  loyerAnnuel?: number;
  dateFinCredit?: string;
}

// Représente une comparaison entre ancien et nouveau
interface InvestissementComparison {
  id: string;
  type: string;
  label: string;
  editedLabel: string;
  editedType: string;
  selectedPartenaireId: number | null;
  existingInvestissement?: Investissement;
  linkedToExistingId: number | null;
  newMontant: number;
  editedMontant: number;
  oldMontant?: number;
  isNew: boolean;
  isChanged: boolean;
  selectedForUpdate: boolean;
  selectedOrigine: OrigineInvestissement;
  compatibleExisting: Investissement[];
  // Options avancées
  versementProgramme: boolean;
  montantVersement?: number;
  frequenceVersement: string;
  reinvestissementDividendes: boolean;
  pourcentageReinvestissement?: number;
  dateSouscription?: string;
  // Options immobilier
  loyerMensuel?: number;
  mensualiteCredit?: number;
  creditCRD?: number;
}

// Fréquences de versement disponibles
const FREQUENCES_VERSEMENT = [
  { value: "MENSUEL", label: "Mensuel" },
  { value: "TRIMESTRIEL", label: "Trimestriel" },
  { value: "SEMESTRIEL", label: "Semestriel" },
  { value: "ANNUEL", label: "Annuel" },
];

// Types de produits disponibles
const PRODUCT_TYPES = [
  { value: "ASSURANCE_VIE", label: "Assurance-vie" },
  { value: "PER", label: "PER" },
  { value: "SCPI", label: "SCPI" },
  { value: "SCPI_DEMEMBREMENT", label: "SCPI Démembrement" },
  { value: "IMMOBILIER", label: "Immobilier" },
  { value: "PINEL", label: "Pinel" },
  { value: "LMNP", label: "LMNP" },
  { value: "LMP", label: "LMP" },
  { value: "RP", label: "Résidence Principale" },
  { value: "RS", label: "Résidence Secondaire" },
  { value: "LOCATIF", label: "Locatif" },
  { value: "EPARGNE_BANCAIRE", label: "Épargne Bancaire" },
  { value: "AUTRE", label: "Autre" },
];

function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function extractInvestissementsFromRIO(data: ExtractedData): ExtractedInvestissement[] {
  const items: ExtractedInvestissement[] = [];

  // Biens immobiliers (nouvelle structure)
  if (data.biensImmobiliers && data.biensImmobiliers.length > 0) {
    for (const bien of data.biensImmobiliers) {
      if (bien.valeur && bien.valeur > 0) {
        let type = bien.type || "IMMOBILIER";
        if (type === "RESIDENCE_PRINCIPALE") {
          type = "RP";
        }
        
        items.push({
          id: bien.id,
          type,
          label: bien.nom,
          montant: bien.valeur,
          creditCRD: bien.creditCRD,
          mensualiteCredit: bien.mensualiteCredit,
          loyerAnnuel: bien.loyersAnnuels,
          dateFinCredit: bien.dateFinCredit,
        });
      }
    }
  } else {
    if (data.residencePrincipale?.valeur && data.residencePrincipale.valeur > 0) {
      items.push({
        id: "residence-principale",
        type: "IMMOBILIER",
        label: "Résidence principale",
        montant: data.residencePrincipale.valeur,
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

  if (data.assuranceVie && data.assuranceVie > 0) {
    items.push({
      id: "assurance-vie",
      type: "ASSURANCE_VIE",
      label: "Assurance-vie",
      montant: data.assuranceVie,
    });
  }

  if (data.per && data.per > 0) {
    items.push({
      id: "per",
      type: "PER",
      label: "PER (Plan Épargne Retraite)",
      montant: data.per,
    });
  }

  if (data.scpi && data.scpi > 0) {
    items.push({
      id: "scpi",
      type: "SCPI",
      label: "SCPI",
      montant: data.scpi,
    });
  }

  if (data.livretA && data.livretA > 0) {
    items.push({
      id: "livret-a",
      type: "EPARGNE_BANCAIRE",
      label: "Livret A",
      montant: data.livretA,
      origine: "EXISTANT_CLIENT",
    });
  }
  if (data.ldd && data.ldd > 0) {
    items.push({
      id: "ldd",
      type: "EPARGNE_BANCAIRE",
      label: "LDD",
      montant: data.ldd,
      origine: "EXISTANT_CLIENT",
    });
  }
  if (data.compteCourant && data.compteCourant > 0) {
    items.push({
      id: "compte-courant",
      type: "EPARGNE_BANCAIRE",
      label: "Compte courant",
      montant: data.compteCourant,
      origine: "EXISTANT_CLIENT",
    });
  }

  return items;
}

const COMPATIBLE_TYPES: Record<string, string[]> = {
  IMMOBILIER: ["IMMOBILIER", "LMNP", "LMP", "PINEL", "RP", "RS", "LOCATIF", "RESIDENCE_PRINCIPALE"],
  LOCATIF: ["IMMOBILIER", "LMNP", "LMP", "PINEL", "LOCATIF"],
  PINEL: ["IMMOBILIER", "LMNP", "LMP", "PINEL", "LOCATIF"],
  LMNP: ["IMMOBILIER", "LMNP", "LMP", "PINEL", "LOCATIF"],
  LMP: ["IMMOBILIER", "LMNP", "LMP", "PINEL", "LOCATIF"],
  RP: ["IMMOBILIER", "RP", "RESIDENCE_PRINCIPALE"],
  RESIDENCE_PRINCIPALE: ["IMMOBILIER", "RP", "RESIDENCE_PRINCIPALE"],
  ASSURANCE_VIE: ["ASSURANCE_VIE"],
  PER: ["PER"],
  SCPI: ["SCPI", "SCPI_DEMEMBREMENT"],
  SCPI_DEMEMBREMENT: ["SCPI", "SCPI_DEMEMBREMENT"],
  EPARGNE_BANCAIRE: ["EPARGNE_BANCAIRE"],
};

function findCompatibleExisting(
  extractedType: string,
  existingInvestissements: Investissement[]
): Investissement[] {
  const compatibleTypes = COMPATIBLE_TYPES[extractedType] || [extractedType];
  return existingInvestissements.filter(inv => 
    compatibleTypes.includes(inv.type_produit) || 
    Object.values(COMPATIBLE_TYPES).some(types => 
      types.includes(extractedType) && types.includes(inv.type_produit)
    )
  );
}

function findBestMatch(
  extracted: ExtractedInvestissement,
  existingInvestissements: Investissement[]
): Investissement | undefined {
  const extractedNormalized = normalizeForComparison(extracted.label);
  const extractedType = extracted.type;

  let bestMatch: Investissement | undefined;
  let bestScore = 0;

  for (const existing of existingInvestissements) {
    let score = 0;
    const existingNomNormalized = normalizeForComparison(existing.nom_produit);
    const existingType = existing.type_produit;

    if (extractedNormalized === existingNomNormalized) {
      score += 100;
    } else if (extractedNormalized.includes(existingNomNormalized) || 
               existingNomNormalized.includes(extractedNormalized)) {
      score += 50;
    } else if (extractedNormalized.substring(0, 6) === existingNomNormalized.substring(0, 6)) {
      score += 30;
    }

    if (extractedType === existingType) {
      score += 40;
    } else if (
      (extractedType === "IMMOBILIER" && ["LMNP", "LMP", "PINEL", "RP", "RS", "LOCATIF"].includes(existingType)) ||
      (["LMNP", "LMP", "PINEL", "RP", "RS", "LOCATIF"].includes(extractedType) && existingType === "IMMOBILIER")
    ) {
      score += 20;
    }

    if (score > bestScore && score >= 50) {
      bestScore = score;
      bestMatch = existing;
    }
  }

  return bestMatch;
}

function formatEuro(montant: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(montant);
}

function getTypeIcon(type: string) {
  switch (type) {
    case "IMMOBILIER":
    case "LMNP":
    case "LMP":
    case "PINEL":
    case "RP":
    case "LOCATIF":
      return <Home className="h-4 w-4" />;
    case "ASSURANCE_VIE":
      return <PiggyBank className="h-4 w-4" />;
    case "PER":
      return <TrendingUp className="h-4 w-4" />;
    case "SCPI":
    case "SCPI_DEMEMBREMENT":
      return <Building2 className="h-4 w-4" />;
    default:
      return <PiggyBank className="h-4 w-4" />;
  }
}

export function RioUpdateComparisonDialog({
  open,
  onOpenChange,
  extractedData,
  contactId,
  contactNom,
  onComplete,
  onCancel,
}: RioUpdateComparisonDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingInvestissements, setExistingInvestissements] = useState<Investissement[]>([]);
  const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
  const [comparisons, setComparisons] = useState<InvestissementComparison[]>([]);

  useEffect(() => {
    if (open && contactId) {
      loadExistingInvestissements();
    }
  }, [open, contactId]);

  const loadExistingInvestissements = async () => {
    setLoading(true);
    try {
      const [invs, parts] = await Promise.all([
        getInvestissementsByContact(contactId),
        getAllPartenaires(),
      ]);
      setExistingInvestissements(invs);
      setPartenaires(parts);
      
      const extracted = extractInvestissementsFromRIO(extractedData);
      const usedExistingIds = new Set<number>();
      const newComparisons: InvestissementComparison[] = [];

      for (const ext of extracted) {
        const availableInvs = invs.filter(i => !usedExistingIds.has(i.id));
        const match = findBestMatch(ext, availableInvs);
        const compatibleExisting = findCompatibleExisting(ext.type, invs);
        
        if (match) {
          usedExistingIds.add(match.id);
          const oldMontant = match.montant_initial ? match.montant_initial / 100 : 0;
          const isChanged = Math.abs(oldMontant - ext.montant) > 1;

          newComparisons.push({
            id: ext.id,
            type: ext.type,
            label: ext.label,
            editedLabel: ext.label,
            editedType: ext.type,
            selectedPartenaireId: match.partenaire_id || null,
            existingInvestissement: match,
            linkedToExistingId: match.id,
            newMontant: ext.montant,
            editedMontant: ext.montant,
            oldMontant,
            isNew: false,
            isChanged,
            selectedForUpdate: isChanged,
            selectedOrigine: match.origine,
            compatibleExisting,
            versementProgramme: match.versement_programme || false,
            montantVersement: match.montant_versement_programme ? match.montant_versement_programme / 100 : undefined,
            frequenceVersement: match.frequence_versement || "MENSUEL",
            reinvestissementDividendes: match.reinvestissement_dividendes || false,
            pourcentageReinvestissement: undefined,
            dateSouscription: match.date_souscription ? new Date(match.date_souscription * 1000).toISOString().split("T")[0] : undefined,
            loyerMensuel: undefined,
            mensualiteCredit: undefined,
            creditCRD: undefined,
          });
        } else {
          newComparisons.push({
            id: ext.id,
            type: ext.type,
            label: ext.label,
            editedLabel: ext.label,
            editedType: ext.type,
            selectedPartenaireId: null,
            linkedToExistingId: null,
            newMontant: ext.montant,
            editedMontant: ext.montant,
            isNew: true,
            isChanged: false,
            selectedForUpdate: true,
            selectedOrigine: ext.origine || "EXISTANT_CLIENT",
            compatibleExisting,
            versementProgramme: false,
            montantVersement: undefined,
            frequenceVersement: "MENSUEL",
            reinvestissementDividendes: false,
            pourcentageReinvestissement: undefined,
            dateSouscription: undefined,
            loyerMensuel: ext.loyerAnnuel ? Math.round(ext.loyerAnnuel / 12) : undefined,
            mensualiteCredit: ext.mensualiteCredit,
            creditCRD: ext.creditCRD,
          });
        }
      }

      setComparisons(newComparisons);
    } catch (error) {
      console.error("Erreur chargement investissements:", error);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const toUpdate = comparisons.filter(c => !c.isNew && c.isChanged && c.selectedForUpdate);
    const toAdd = comparisons.filter(c => c.isNew && c.selectedForUpdate);
    const unchanged = comparisons.filter(c => !c.isNew && !c.isChanged);
    const avecMoi = comparisons.filter(c => c.existingInvestissement?.origine === "MON_CONSEIL");
    return { toUpdate, toAdd, unchanged, avecMoi };
  }, [comparisons]);

  const handleToggleUpdate = (id: string) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, selectedForUpdate: !c.selectedForUpdate } : c
    ));
  };

  const handleChangeOrigine = (id: string, origine: OrigineInvestissement) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, selectedOrigine: origine } : c
    ));
  };

  const handleChangeLabel = (id: string, newLabel: string) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, editedLabel: newLabel } : c
    ));
  };

  const handleChangeMontant = (id: string, newMontant: number) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, editedMontant: newMontant } : c
    ));
  };

  const handleChangeType = (id: string, newType: string) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, editedType: newType } : c
    ));
  };

  const handleChangePartenaire = (id: string, partenaireId: number | null) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, selectedPartenaireId: partenaireId } : c
    ));
  };

  const handleChangeVersementProgramme = (id: string, enabled: boolean) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, versementProgramme: enabled } : c
    ));
  };

  const handleChangeMontantVersement = (id: string, montant: number | undefined) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, montantVersement: montant } : c
    ));
  };

  const handleChangeFrequenceVersement = (id: string, frequence: string) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, frequenceVersement: frequence } : c
    ));
  };

  const handleChangeReinvestissement = (id: string, enabled: boolean) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, reinvestissementDividendes: enabled } : c
    ));
  };

  const handleChangePourcentageReinvestissement = (id: string, pourcentage: number | undefined) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, pourcentageReinvestissement: pourcentage } : c
    ));
  };

  const handleChangeLoyerMensuel = (id: string, loyer: number | undefined) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, loyerMensuel: loyer } : c
    ));
  };

  const handleChangeMensualiteCredit = (id: string, mensualite: number | undefined) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, mensualiteCredit: mensualite } : c
    ));
  };

  const handleChangeCreditCRD = (id: string, crd: number | undefined) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, creditCRD: crd } : c
    ));
  };

  const handleChangeDateSouscription = (id: string, date: string | undefined) => {
    setComparisons(prev => prev.map(c => 
      c.id === id ? { ...c, dateSouscription: date } : c
    ));
  };

  const handleChangeLinkToExisting = (id: string, existingId: number | null) => {
    setComparisons(prev => prev.map(c => {
      if (c.id !== id) return c;
      
      if (existingId === null) {
        return {
          ...c,
          linkedToExistingId: null,
          existingInvestissement: undefined,
          isNew: true,
          isChanged: false,
          oldMontant: undefined,
        };
      } else {
        const existing = existingInvestissements.find(inv => inv.id === existingId);
        if (!existing) return c;
        
        const oldMontant = existing.montant_initial ? existing.montant_initial / 100 : 0;
        const isChanged = Math.abs(oldMontant - c.editedMontant) > 1;
        
        return {
          ...c,
          linkedToExistingId: existingId,
          existingInvestissement: existing,
          isNew: false,
          isChanged,
          oldMontant,
          selectedOrigine: existing.origine,
        };
      }
    }));
  };

  const handleSelectAll = () => {
    setComparisons(prev => prev.map(c => ({
      ...c,
      selectedForUpdate: c.isNew || c.isChanged,
    })));
  };

  const handleDeselectAll = () => {
    setComparisons(prev => prev.map(c => ({
      ...c,
      selectedForUpdate: false,
    })));
  };

  const handleApply = async () => {
    setSaving(true);
    try {
      let updated = 0;
      let added = 0;

      for (const comp of comparisons) {
        if (!comp.selectedForUpdate) continue;

        if (comp.linkedToExistingId === null) {
          const newInv: NewInvestissement = {
            contact_id: contactId,
            type_produit: comp.editedType,
            nom_produit: comp.editedLabel,
            montant_initial: Math.round(comp.editedMontant * 100),
            origine: comp.selectedOrigine,
            partenaire_id: comp.selectedPartenaireId || undefined,
            versement_programme: comp.versementProgramme,
            montant_versement_programme: comp.montantVersement ? Math.round(comp.montantVersement * 100) : undefined,
            frequence_versement: comp.versementProgramme ? comp.frequenceVersement : undefined,
            reinvestissement_dividendes: comp.reinvestissementDividendes,
            date_souscription: comp.dateSouscription || undefined,
          };
          await createInvestissement(newInv);
          added++;
        } else {
          const existing = existingInvestissements.find(inv => inv.id === comp.linkedToExistingId);
          if (!existing) continue;
          
          const updatedInv: NewInvestissement = {
            contact_id: contactId,
            type_produit: existing.type_produit,
            nom_produit: existing.nom_produit,
            montant_initial: Math.round(comp.editedMontant * 100),
            origine: comp.selectedOrigine,
            partenaire_id: comp.selectedPartenaireId ?? existing.partenaire_id,
            notes: existing.notes,
            versement_programme: comp.versementProgramme,
            montant_versement_programme: comp.montantVersement ? Math.round(comp.montantVersement * 100) : existing.montant_versement_programme,
            frequence_versement: comp.frequenceVersement || existing.frequence_versement,
            reinvestissement_dividendes: comp.reinvestissementDividendes,
            date_souscription: comp.dateSouscription || (existing.date_souscription ? new Date(existing.date_souscription * 1000).toISOString().split("T")[0] : undefined),
          };
          await updateInvestissement(existing.id, updatedInv);
          updated++;
        }
      }

      alert(`✅ Mise à jour terminée !\n\n• ${updated} investissement(s) mis à jour\n• ${added} investissement(s) ajouté(s)`);
      onComplete();
    } catch (error) {
      console.error("Erreur lors de la mise à jour:", error);
      alert("❌ Erreur lors de la mise à jour:\n\n" + String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Mise à jour du RIO : {contactNom}
          </DialogTitle>
          <DialogDescription>
            Comparez les données du nouveau RIO avec les investissements existants.
            Sélectionnez les éléments à mettre à jour.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              Chargement des données...
            </div>
          ) : (
            <>
              {/* Stats résumé */}
              <div className="grid grid-cols-4 gap-2 text-sm">
                <div className="p-2 bg-blue-50 rounded text-center">
                  <div className="font-bold text-blue-700">{stats.toUpdate.length}</div>
                  <div className="text-blue-600">À mettre à jour</div>
                </div>
                <div className="p-2 bg-green-50 rounded text-center">
                  <div className="font-bold text-green-700">{stats.toAdd.length}</div>
                  <div className="text-green-600">Nouveaux</div>
                </div>
                <div className="p-2 bg-gray-50 rounded text-center">
                  <div className="font-bold text-gray-700">{stats.unchanged.length}</div>
                  <div className="text-gray-600">Inchangés</div>
                </div>
                <div className="p-2 bg-purple-50 rounded text-center">
                  <div className="font-bold text-purple-700">{stats.avecMoi.length}</div>
                  <div className="text-purple-600">Avec moi</div>
                </div>
              </div>

              {/* Tous les investissements détectés */}
              {comparisons.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium flex items-center gap-2">
                    <Plus className="h-4 w-4 text-green-600" />
                    Investissements détectés dans le RIO
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Pour chaque élément, choisissez s'il s'agit d'un nouvel investissement ou s'il correspond à un existant.
                  </p>
                  <div className="space-y-2">
                    {comparisons.map(comp => (
                      <div 
                        key={comp.id}
                        className={`p-3 border rounded-lg ${
                          !comp.selectedForUpdate 
                            ? "bg-gray-50 border-gray-200 opacity-60"
                            : comp.linkedToExistingId === null
                            ? "bg-green-50 border-green-200" 
                            : "bg-blue-50 border-blue-200"
                        }`}
                      >
                        <div className="space-y-2">
                          {/* Ligne 1 : Checkbox + Label + Montant */}
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={comp.selectedForUpdate}
                              onCheckedChange={() => handleToggleUpdate(comp.id)}
                            />
                            <div className="flex-1 flex items-center gap-2">
                              {getTypeIcon(comp.type)}
                              <span className="font-medium text-sm">{comp.label}</span>
                              <span className="text-muted-foreground">→</span>
                              <Input
                                type="number"
                                value={comp.editedMontant}
                                onChange={(e) => handleChangeMontant(comp.id, parseFloat(e.target.value) || 0)}
                                className="h-8 text-sm text-right w-32"
                                disabled={!comp.selectedForUpdate}
                              />
                              <span className="text-sm text-muted-foreground">€</span>
                            </div>
                          </div>
                          
                          {/* Ligne 2 : Dropdown associer à */}
                          {comp.selectedForUpdate && (
                            <div className="ml-8 space-y-2">
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground w-20">Associer à :</span>
                                <select
                                  value={comp.linkedToExistingId === null ? "new" : comp.linkedToExistingId.toString()}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleChangeLinkToExisting(comp.id, val === "new" ? null : parseInt(val));
                                  }}
                                  className="text-sm border rounded px-2 py-1 flex-1"
                                >
                                  <option value="new">🆕 Créer nouvel investissement</option>
                                  {comp.compatibleExisting.length > 0 && (
                                    <optgroup label="Investissements existants">
                                      {comp.compatibleExisting.map(existing => {
                                        const partenaireNom = existing.partenaire_id 
                                          ? partenaires.find(p => p.id === existing.partenaire_id)?.raison_sociale 
                                          : null;
                                        const dateStr = existing.date_souscription 
                                          ? new Date(existing.date_souscription * 1000).toLocaleDateString("fr-FR")
                                          : null;
                                        return (
                                          <option key={existing.id} value={existing.id.toString()}>
                                            {existing.type_produit} - {existing.nom_produit} ({formatEuro(existing.montant_initial ? existing.montant_initial / 100 : 0)})
                                            {partenaireNom ? ` | ${partenaireNom}` : ""}
                                            {dateStr ? ` | ${dateStr}` : ""}
                                            {existing.origine === "MON_CONSEIL" ? " 🎯" : " 📋"}
                                          </option>
                                        );
                                      })}
                                    </optgroup>
                                  )}
                                </select>
                                
                                {/* Badge */}
                                {comp.linkedToExistingId === null ? (
                                  <Badge className="bg-green-600 text-xs">Nouveau</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">
                                    MAJ {comp.oldMontant ? `(${formatEuro(comp.oldMontant)} → ${formatEuro(comp.editedMontant)})` : ""}
                                  </Badge>
                                )}
                              </div>
                              
                              {/* Détails du nouvel investissement */}
                              {comp.linkedToExistingId === null && (
                                <div className="p-3 bg-green-50/50 border border-green-200 rounded-lg space-y-3">
                                  <div className="text-xs font-medium text-green-700">Détails du nouvel investissement</div>
                                  
                                  <div className="grid grid-cols-4 gap-2">
                                    <div>
                                      <label className="text-xs text-muted-foreground">Nom</label>
                                      <Input
                                        value={comp.editedLabel}
                                        onChange={(e) => handleChangeLabel(comp.id, e.target.value)}
                                        className="h-8 text-sm"
                                        placeholder="Nom du produit"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs text-muted-foreground">Type</label>
                                      <select
                                        value={comp.editedType}
                                        onChange={(e) => handleChangeType(comp.id, e.target.value)}
                                        className="w-full h-8 text-sm border rounded px-2"
                                      >
                                        {PRODUCT_TYPES.map(t => (
                                          <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-xs text-muted-foreground">Partenaire</label>
                                      <select
                                        value={comp.selectedPartenaireId?.toString() || ""}
                                        onChange={(e) => handleChangePartenaire(comp.id, e.target.value ? parseInt(e.target.value) : null)}
                                        className="w-full h-8 text-sm border rounded px-2"
                                      >
                                        <option value="">Aucun</option>
                                        {partenaires.map(p => (
                                          <option key={p.id} value={p.id.toString()}>{p.raison_sociale}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-xs text-muted-foreground">Origine</label>
                                      <select
                                        value={comp.selectedOrigine}
                                        onChange={(e) => handleChangeOrigine(comp.id, e.target.value as OrigineInvestissement)}
                                        className="w-full h-8 text-sm border rounded px-2"
                                      >
                                        <option value="EXISTANT_CLIENT">À côté</option>
                                        <option value="MON_CONSEIL">Avec moi</option>
                                      </select>
                                    </div>
                                  </div>
                                  
                                  {/* Options avancées conditionnelles selon le type */}
                                  <div className="pt-2 border-t border-green-200">
                                    <div className="text-xs font-medium text-green-700 mb-2">Options avancées</div>
                                    
                                    {/* === OPTIONS IMMOBILIER === */}
                                    {["RP", "IMMOBILIER", "LOCATIF", "PINEL", "LMNP", "LMP"].includes(comp.editedType) && (
                                      <div className="grid grid-cols-4 gap-2">
                                        <div>
                                          <label className="text-xs text-muted-foreground">Date d'achat</label>
                                          <Input
                                            type="date"
                                            value={comp.dateSouscription || ""}
                                            onChange={(e) => handleChangeDateSouscription(comp.id, e.target.value || undefined)}
                                            className="h-7 text-xs"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-xs text-muted-foreground">Mensualité crédit</label>
                                          <Input
                                            type="number"
                                            placeholder="€/mois"
                                            value={comp.mensualiteCredit || ""}
                                            onChange={(e) => handleChangeMensualiteCredit(comp.id, e.target.value ? parseFloat(e.target.value) : undefined)}
                                            className="h-7 text-xs"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-xs text-muted-foreground">CRD (Capital)</label>
                                          <Input
                                            type="number"
                                            placeholder="€"
                                            value={comp.creditCRD || ""}
                                            onChange={(e) => handleChangeCreditCRD(comp.id, e.target.value ? parseFloat(e.target.value) : undefined)}
                                            className="h-7 text-xs"
                                          />
                                        </div>
                                        {/* Loyer mensuel (sauf RP) */}
                                        {comp.editedType !== "RP" && (
                                          <div>
                                            <label className="text-xs text-muted-foreground">Loyer mensuel</label>
                                            <Input
                                              type="number"
                                              placeholder="€/mois"
                                              value={comp.loyerMensuel || ""}
                                              onChange={(e) => handleChangeLoyerMensuel(comp.id, e.target.value ? parseFloat(e.target.value) : undefined)}
                                              className="h-7 text-xs"
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* === OPTIONS SCPI === */}
                                    {["SCPI", "SCPI_DEMEMBREMENT"].includes(comp.editedType) && (
                                      <div className="space-y-2">
                                        <div className="grid grid-cols-3 gap-2">
                                          <div>
                                            <label className="text-xs text-muted-foreground">Date souscription</label>
                                            <Input
                                              type="date"
                                              value={comp.dateSouscription || ""}
                                              onChange={(e) => handleChangeDateSouscription(comp.id, e.target.value || undefined)}
                                              className="h-7 text-xs"
                                            />
                                          </div>
                                          <div className="flex items-end gap-2">
                                            <Checkbox
                                              id={`vp-${comp.id}`}
                                              checked={comp.versementProgramme}
                                              onCheckedChange={(checked) => handleChangeVersementProgramme(comp.id, !!checked)}
                                            />
                                            <label htmlFor={`vp-${comp.id}`} className="text-xs">Versement prog.</label>
                                          </div>
                                          {comp.versementProgramme && (
                                            <div className="flex gap-1">
                                              <Input
                                                type="number"
                                                placeholder="Montant"
                                                value={comp.montantVersement || ""}
                                                onChange={(e) => handleChangeMontantVersement(comp.id, e.target.value ? parseFloat(e.target.value) : undefined)}
                                                className="h-7 text-xs w-20"
                                              />
                                              <select
                                                value={comp.frequenceVersement}
                                                onChange={(e) => handleChangeFrequenceVersement(comp.id, e.target.value)}
                                                className="h-7 text-xs border rounded px-1"
                                              >
                                                {FREQUENCES_VERSEMENT.map(f => (
                                                  <option key={f.value} value={f.value}>{f.label}</option>
                                                ))}
                                              </select>
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Checkbox
                                            id={`reinv-${comp.id}`}
                                            checked={comp.reinvestissementDividendes}
                                            onCheckedChange={(checked) => handleChangeReinvestissement(comp.id, !!checked)}
                                          />
                                          <label htmlFor={`reinv-${comp.id}`} className="text-xs">Réinvestissement dividendes</label>
                                          {comp.reinvestissementDividendes && (
                                            <div className="flex items-center gap-1">
                                              <Input
                                                type="number"
                                                placeholder="%"
                                                value={comp.pourcentageReinvestissement || ""}
                                                onChange={(e) => handleChangePourcentageReinvestissement(comp.id, e.target.value ? parseFloat(e.target.value) : undefined)}
                                                className="h-7 text-xs w-16"
                                              />
                                              <span className="text-xs">%</span>
                                            </div>
                                          )}
                                        </div>
                                        {/* Crédit SCPI si CRD ou mensualité pré-rempli */}
                                        {(comp.creditCRD || comp.mensualiteCredit) && (
                                          <div className="grid grid-cols-2 gap-2">
                                            <div>
                                              <label className="text-xs text-muted-foreground">Mensualité crédit</label>
                                              <Input
                                                type="number"
                                                placeholder="€/mois"
                                                value={comp.mensualiteCredit || ""}
                                                onChange={(e) => handleChangeMensualiteCredit(comp.id, e.target.value ? parseFloat(e.target.value) : undefined)}
                                                className="h-7 text-xs"
                                              />
                                            </div>
                                            <div>
                                              <label className="text-xs text-muted-foreground">CRD (Capital)</label>
                                              <Input
                                                type="number"
                                                placeholder="€"
                                                value={comp.creditCRD || ""}
                                                onChange={(e) => handleChangeCreditCRD(comp.id, e.target.value ? parseFloat(e.target.value) : undefined)}
                                                className="h-7 text-xs"
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* === OPTIONS ASSURANCE-VIE / PER / PEA === */}
                                    {["ASSURANCE_VIE", "PER", "PEA", "COMPTE_TITRE"].includes(comp.editedType) && (
                                      <div className="grid grid-cols-3 gap-2">
                                        <div>
                                          <label className="text-xs text-muted-foreground">Date souscription</label>
                                          <Input
                                            type="date"
                                            value={comp.dateSouscription || ""}
                                            onChange={(e) => handleChangeDateSouscription(comp.id, e.target.value || undefined)}
                                            className="h-7 text-xs"
                                          />
                                        </div>
                                        <div className="flex items-end gap-2">
                                          <Checkbox
                                            id={`vp2-${comp.id}`}
                                            checked={comp.versementProgramme}
                                            onCheckedChange={(checked) => handleChangeVersementProgramme(comp.id, !!checked)}
                                          />
                                          <label htmlFor={`vp2-${comp.id}`} className="text-xs">Versement prog.</label>
                                        </div>
                                        {comp.versementProgramme && (
                                          <div className="flex gap-1">
                                            <Input
                                              type="number"
                                              placeholder="Montant"
                                              value={comp.montantVersement || ""}
                                              onChange={(e) => handleChangeMontantVersement(comp.id, e.target.value ? parseFloat(e.target.value) : undefined)}
                                              className="h-7 text-xs w-20"
                                            />
                                            <select
                                              value={comp.frequenceVersement}
                                              onChange={(e) => handleChangeFrequenceVersement(comp.id, e.target.value)}
                                              className="h-7 text-xs border rounded px-1"
                                            >
                                              {FREQUENCES_VERSEMENT.map(f => (
                                                <option key={f.value} value={f.value}>{f.label}</option>
                                              ))}
                                            </select>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* === OPTIONS PEL UNIQUEMENT === */}
                                    {comp.editedType === "PEL" && (
                                      <div className="grid grid-cols-3 gap-2">
                                        <div>
                                          <label className="text-xs text-muted-foreground">Date d'ouverture</label>
                                          <Input
                                            type="date"
                                            value={comp.dateSouscription || ""}
                                            onChange={(e) => handleChangeDateSouscription(comp.id, e.target.value || undefined)}
                                            className="h-7 text-xs"
                                          />
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* FIP, FCPI, GFF : pas d'options avancées */}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Message si aucun changement */}
              {comparisons.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  Aucun investissement détecté dans ce RIO.
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAll} disabled={loading}>
                Tout sélectionner
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDeselectAll} disabled={loading}>
                Tout désélectionner
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onCancel} disabled={saving}>
                Annuler
              </Button>
              <Button onClick={handleApply} disabled={loading || saving}>
                {saving ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Mise à jour...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Appliquer les modifications
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
