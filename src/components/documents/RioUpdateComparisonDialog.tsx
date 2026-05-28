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
  AlertCircle,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import type { ExtractedData } from "@/lib/pdf";
import type { Investissement, NewInvestissement, OrigineInvestissement } from "@/lib/api/tauri-investissements";
import { getInvestissementsByContact, updateInvestissement, createInvestissement } from "@/lib/api/tauri-investissements";
import { getAllPartenaires, type Partenaire } from "@/lib/api/tauri-partenaires";
import { getContactById, updateContact } from "@/lib/api/tauri-contacts";

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
  const [notesRio, setNotesRio] = useState<string>("");

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
            // Pré-remplir avec les valeurs du RIO (priorité) ou existantes
            loyerMensuel: ext.loyerAnnuel ? Math.round(ext.loyerAnnuel / 12) : undefined,
            mensualiteCredit: ext.mensualiteCredit,
            creditCRD: ext.creditCRD,
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
    
    // Calcul patrimoine avant/après
    const patrimoineAvant = comparisons.reduce((sum, c) => sum + (c.oldMontant || 0), 0);
    const patrimoineApres = comparisons.reduce((sum, c) => sum + c.editedMontant, 0);
    const difference = patrimoineApres - patrimoineAvant;
    const pourcentage = patrimoineAvant > 0 ? ((difference / patrimoineAvant) * 100) : 0;
    
    // Catégorisation par type
    const byCategory = {
      immobilier: comparisons.filter(c => ["RP", "IMMOBILIER", "LOCATIF", "PINEL", "LMNP", "LMP"].includes(c.editedType)),
      scpi: comparisons.filter(c => ["SCPI", "SCPI_DEMEMBREMENT"].includes(c.editedType)),
      assuranceViePer: comparisons.filter(c => ["ASSURANCE_VIE", "PER", "PEA", "COMPTE_TITRE"].includes(c.editedType)),
      epargne: comparisons.filter(c => ["EPARGNE_BANCAIRE", "LIVRET_A", "LDDS", "PEL", "CEL"].includes(c.editedType)),
      autres: comparisons.filter(c => !["RP", "IMMOBILIER", "LOCATIF", "PINEL", "LMNP", "LMP", "SCPI", "SCPI_DEMEMBREMENT", "ASSURANCE_VIE", "PER", "PEA", "COMPTE_TITRE", "EPARGNE_BANCAIRE", "LIVRET_A", "LDDS", "PEL", "CEL"].includes(c.editedType)),
    };
    
    return { toUpdate, toAdd, unchanged, avecMoi, patrimoineAvant, patrimoineApres, difference, pourcentage, byCategory };
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
        // Nouveau investissement : réinitialiser les champs
        return {
          ...c,
          linkedToExistingId: null,
          existingInvestissement: undefined,
          isNew: true,
          isChanged: false,
          oldMontant: undefined,
          dateSouscription: undefined,
          versementProgramme: false,
          montantVersement: undefined,
          frequenceVersement: "MENSUEL",
          reinvestissementDividendes: false,
        };
      } else {
        const existing = existingInvestissements.find(inv => inv.id === existingId);
        if (!existing) return c;
        
        const oldMontant = existing.montant_initial ? existing.montant_initial / 100 : 0;
        const isChanged = Math.abs(oldMontant - c.editedMontant) > 1;
        
        // Mettre à jour TOUS les champs avec les valeurs de l'investissement existant
        return {
          ...c,
          linkedToExistingId: existingId,
          existingInvestissement: existing,
          isNew: false,
          isChanged,
          oldMontant,
          selectedOrigine: existing.origine,
          // Pré-remplir avec les valeurs de l'investissement sélectionné
          dateSouscription: existing.date_souscription 
            ? new Date(existing.date_souscription * 1000).toISOString().split("T")[0] 
            : undefined,
          versementProgramme: existing.versement_programme || false,
          montantVersement: existing.montant_versement_programme 
            ? existing.montant_versement_programme / 100 
            : undefined,
          frequenceVersement: existing.frequence_versement || "MENSUEL",
          reinvestissementDividendes: existing.reinvestissement_dividendes || false,
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
            // Format RFC3339 requis par le backend Rust
            date_souscription: comp.dateSouscription ? `${comp.dateSouscription}T00:00:00Z` : undefined,
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
            // Format RFC3339 : utiliser la date éditée ou préserver l'existante
            date_souscription: comp.dateSouscription 
              ? `${comp.dateSouscription}T00:00:00Z` 
              : (existing.date_souscription ? new Date(existing.date_souscription * 1000).toISOString() : undefined),
          };
          await updateInvestissement(existing.id, updatedInv);
          updated++;
        }
      }

      // Ajouter les notes au contact si renseignées
      if (notesRio.trim()) {
        try {
          const contact = await getContactById(contactId);
          const dateNow = new Date().toLocaleDateString("fr-FR");
          const newNote = `[Mise à jour RIO - ${dateNow}]\n${notesRio.trim()}`;
          const existingNotes = contact.notes || "";
          const updatedNotes = existingNotes 
            ? `${newNote}\n\n---\n\n${existingNotes}`
            : newNote;
          
          // Construire un objet NewContact propre avec TOUS les champs (sans id, created_at, updated_at)
          await updateContact(contactId, {
            // Relations
            famille_id: contact.famille_id,
            foyer_id: contact.foyer_id,
            role_foyer: contact.role_foyer,
            role_famille: contact.role_famille,
            filleul_categorie: contact.filleul_categorie,
            parrain_id: contact.parrain_id,
            prescripteur_id: contact.prescripteur_id,
            // Identité
            categorie: contact.categorie,
            civilite: contact.civilite,
            nom: contact.nom,
            prenom: contact.prenom,
            email: contact.email,
            telephone: contact.telephone,
            adresse: contact.adresse,
            code_postal: contact.code_postal,
            ville: contact.ville,
            date_naissance: contact.date_naissance ? new Date(contact.date_naissance * 1000).toISOString() : undefined,
            profession: contact.profession,
            situation_familiale: contact.situation_familiale,
            source_lead: contact.source_lead,
            profil_risque_sri: contact.profil_risque_sri,
            // Dates de suivi CLIENT
            date_dernier_contact: contact.date_dernier_contact ? new Date(contact.date_dernier_contact * 1000).toISOString() : undefined,
            date_prochain_suivi: contact.date_prochain_suivi ? new Date(contact.date_prochain_suivi * 1000).toISOString() : undefined,
            // Dates de suivi FILLEUL
            date_dernier_contact_filleul: contact.date_dernier_contact_filleul ? new Date(contact.date_dernier_contact_filleul * 1000).toISOString() : undefined,
            date_prochain_suivi_filleul: contact.date_prochain_suivi_filleul ? new Date(contact.date_prochain_suivi_filleul * 1000).toISOString() : undefined,
            statut_suivi: contact.statut_suivi,
            // Notes mises à jour
            notes: updatedNotes,
          });
        } catch (noteError) {
          console.error("Erreur ajout notes:", noteError);
        }
      }

      alert(`✅ Mise à jour terminée !\n\n• ${updated} investissement(s) mis à jour\n• ${added} investissement(s) ajouté(s)${notesRio.trim() ? "\n• Notes ajoutées au contact" : ""}`);
      onComplete();
    } catch (error) {
      console.error("Erreur lors de la mise à jour:", error);
      alert("❌ Erreur lors de la mise à jour:\n\n" + String(error));
    } finally {
      setSaving(false);
    }
  };

  // Fonction de rendu d'un item d'investissement (pour éviter la duplication)
  const renderInvestissementItem = (comp: InvestissementComparison) => (
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
        {/* Ligne 1 : Checkbox + Label + Montant + Différence */}
        <div className="flex items-center gap-3">
          <Checkbox
            checked={comp.selectedForUpdate}
            onCheckedChange={() => handleToggleUpdate(comp.id)}
          />
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            {getTypeIcon(comp.type)}
            <span className="font-medium text-sm">{comp.label}</span>
            
            {/* Affichage avant → après avec différence */}
            {comp.oldMontant != null && comp.oldMontant > 0 ? (
              <>
                <span className="text-sm text-muted-foreground">{formatEuro(comp.oldMontant)}</span>
                <span className="text-muted-foreground">→</span>
                <Input
                  type="number"
                  value={comp.editedMontant}
                  onChange={(e) => handleChangeMontant(comp.id, parseFloat(e.target.value) || 0)}
                  className="h-8 text-sm text-right w-28"
                  disabled={!comp.selectedForUpdate}
                />
                <span className="text-sm text-muted-foreground">€</span>
                {/* Badge différence */}
                {(() => {
                  const diff = comp.editedMontant - comp.oldMontant;
                  const pct = comp.oldMontant > 0 ? (diff / comp.oldMontant) * 100 : 0;
                  if (Math.abs(diff) < 1) return <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded">Inchangé</span>;
                  return (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      diff >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {diff >= 0 ? "+" : ""}{formatEuro(diff)} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
                    </span>
                  );
                })()}
              </>
            ) : (
              <>
                <span className="text-muted-foreground">→</span>
                <Input
                  type="number"
                  value={comp.editedMontant}
                  onChange={(e) => handleChangeMontant(comp.id, parseFloat(e.target.value) || 0)}
                  className="h-8 text-sm text-right w-28"
                  disabled={!comp.selectedForUpdate}
                />
                <span className="text-sm text-muted-foreground">€</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-green-100 text-green-700">Nouveau</span>
              </>
            )}
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
                
                {/* Options avancées conditionnelles selon le type (sauf épargne bancaire hors PEL) */}
                {!["EPARGNE_BANCAIRE", "LIVRET_A", "LDDS", "CEL"].includes(comp.editedType) && (
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
                </div>
                )}
              </div>
            )}
            
            {/* Options avancées pour les MISES À JOUR d'existants */}
            {comp.linkedToExistingId !== null && !["EPARGNE_BANCAIRE", "LIVRET_A", "LDDS", "CEL"].includes(comp.editedType) && (
              <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg space-y-2 mt-2">
                <div className="text-xs font-medium text-blue-700">Options (valeurs actuelles pré-remplies)</div>
                
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
                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <label className="text-xs text-muted-foreground">Date souscription</label>
                        <Input
                          type="date"
                          value={comp.dateSouscription || ""}
                          onChange={(e) => handleChangeDateSouscription(comp.id, e.target.value || undefined)}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`vp-upd-${comp.id}`}
                          checked={comp.versementProgramme}
                          onCheckedChange={(checked) => handleChangeVersementProgramme(comp.id, !!checked)}
                        />
                        <label htmlFor={`vp-upd-${comp.id}`} className="text-xs">
                          Versement prog.
                          {comp.existingInvestissement?.versement_programme && !comp.versementProgramme && (
                            <span className="text-orange-600 ml-1">(actif)</span>
                          )}
                        </label>
                      </div>
                      {comp.versementProgramme && (
                        <div className="flex gap-1 items-center">
                          <Input
                            type="number"
                            placeholder="Montant"
                            value={comp.montantVersement || ""}
                            onChange={(e) => handleChangeMontantVersement(comp.id, e.target.value ? parseFloat(e.target.value) : undefined)}
                            className="h-7 text-xs w-20"
                          />
                          <span className="text-xs">€</span>
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
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`reinv-upd-${comp.id}`}
                          checked={comp.reinvestissementDividendes}
                          onCheckedChange={(checked) => handleChangeReinvestissement(comp.id, !!checked)}
                        />
                        <label htmlFor={`reinv-upd-${comp.id}`} className="text-xs">
                          Réinvestissement dividendes
                          {comp.existingInvestissement?.reinvestissement_dividendes && !comp.reinvestissementDividendes && (
                            <span className="text-orange-600 ml-1">(actif)</span>
                          )}
                        </label>
                      </div>
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
                  </div>
                )}
                
                {/* === OPTIONS ASSURANCE-VIE / PER / PEA === */}
                {["ASSURANCE_VIE", "PER", "PEA", "COMPTE_TITRE"].includes(comp.editedType) && (
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <label className="text-xs text-muted-foreground">Date souscription</label>
                      <Input
                        type="date"
                        value={comp.dateSouscription || ""}
                        onChange={(e) => handleChangeDateSouscription(comp.id, e.target.value || undefined)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`vp-upd2-${comp.id}`}
                        checked={comp.versementProgramme}
                        onCheckedChange={(checked) => handleChangeVersementProgramme(comp.id, !!checked)}
                      />
                      <label htmlFor={`vp-upd2-${comp.id}`} className="text-xs">
                        Versement prog.
                        {comp.existingInvestissement?.versement_programme && !comp.versementProgramme && (
                          <span className="text-orange-600 ml-1">(actif)</span>
                        )}
                      </label>
                    </div>
                    {comp.versementProgramme && (
                      <div className="flex gap-1 items-center">
                        <Input
                          type="number"
                          placeholder="Montant"
                          value={comp.montantVersement || ""}
                          onChange={(e) => handleChangeMontantVersement(comp.id, e.target.value ? parseFloat(e.target.value) : undefined)}
                          className="h-7 text-xs w-20"
                        />
                        <span className="text-xs">€</span>
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

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
              {/* Résumé patrimoine */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-blue-800">Résumé des changements</h3>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    stats.difference >= 0 
                      ? "bg-green-100 text-green-700" 
                      : "bg-red-100 text-red-700"
                  }`}>
                    {stats.difference >= 0 ? "+" : ""}{formatEuro(stats.difference)} ({stats.pourcentage >= 0 ? "+" : ""}{stats.pourcentage.toFixed(1)}%)
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div className="text-center p-2 bg-white/50 rounded">
                    <div className="text-xs text-muted-foreground">Patrimoine avant</div>
                    <div className="font-bold text-lg">{formatEuro(stats.patrimoineAvant)}</div>
                  </div>
                  <div className="text-center p-2 bg-white/50 rounded">
                    <div className="text-xs text-muted-foreground">Patrimoine après</div>
                    <div className="font-bold text-lg text-blue-700">{formatEuro(stats.patrimoineApres)}</div>
                  </div>
                </div>
                
                {/* Compteurs */}
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>{stats.toUpdate.length} MAJ</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span>{stats.toAdd.length} nouveaux</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                    <span>{stats.unchanged.length} inchangés</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    <span>{stats.avecMoi.length} avec moi</span>
                  </div>
                </div>
              </div>

              {/* Investissements par catégorie */}
              {comparisons.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Pour chaque élément, choisissez s'il s'agit d'un nouvel investissement ou s'il correspond à un existant.
                  </p>
                  
                  {/* Catégorie : Immobilier */}
                  {stats.byCategory.immobilier.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 pb-1 border-b border-amber-200">
                        <Home className="h-4 w-4 text-amber-600" />
                        <span className="font-medium text-amber-800">Immobilier</span>
                        <Badge variant="outline" className="text-xs">{stats.byCategory.immobilier.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {stats.byCategory.immobilier.map(comp => renderInvestissementItem(comp))}
                      </div>
                    </div>
                  )}
                  
                  {/* Catégorie : SCPI */}
                  {stats.byCategory.scpi.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 pb-1 border-b border-blue-200">
                        <Building2 className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-blue-800">SCPI</span>
                        <Badge variant="outline" className="text-xs">{stats.byCategory.scpi.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {stats.byCategory.scpi.map(comp => renderInvestissementItem(comp))}
                      </div>
                    </div>
                  )}
                  
                  {/* Catégorie : Assurance-vie / PER */}
                  {stats.byCategory.assuranceViePer.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 pb-1 border-b border-purple-200">
                        <TrendingUp className="h-4 w-4 text-purple-600" />
                        <span className="font-medium text-purple-800">Assurance-vie / PER</span>
                        <Badge variant="outline" className="text-xs">{stats.byCategory.assuranceViePer.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {stats.byCategory.assuranceViePer.map(comp => renderInvestissementItem(comp))}
                      </div>
                    </div>
                  )}
                  
                  {/* Catégorie : Épargne bancaire */}
                  {stats.byCategory.epargne.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 pb-1 border-b border-green-200">
                        <PiggyBank className="h-4 w-4 text-green-600" />
                        <span className="font-medium text-green-800">Épargne bancaire</span>
                        <Badge variant="outline" className="text-xs">{stats.byCategory.epargne.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {stats.byCategory.epargne.map(comp => renderInvestissementItem(comp))}
                      </div>
                    </div>
                  )}
                  
                  {/* Catégorie : Autres */}
                  {stats.byCategory.autres.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 pb-1 border-b border-gray-200">
                        <Wallet className="h-4 w-4 text-gray-600" />
                        <span className="font-medium text-gray-800">Autres</span>
                        <Badge variant="outline" className="text-xs">{stats.byCategory.autres.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {stats.byCategory.autres.map(comp => renderInvestissementItem(comp))}
                      </div>
                    </div>
                  )}
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

        {/* Section Notes / Commentaires */}
        <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <label className="text-sm font-medium text-slate-700 mb-2 block">
            📝 Notes / Commentaires (mise à jour RIO)
          </label>
          <textarea
            value={notesRio}
            onChange={(e) => setNotesRio(e.target.value)}
            placeholder="Ajoutez des notes sur cette mise à jour annuelle..."
            className="w-full h-20 p-2 text-sm border border-slate-300 rounded-md resize-none focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
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
