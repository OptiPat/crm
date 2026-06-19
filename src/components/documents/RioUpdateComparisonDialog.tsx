import { useState, useEffect, useMemo, useRef } from "react";
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
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { ExtractedData } from "@/lib/pdf";
import type { Investissement, NewInvestissement, OrigineInvestissement } from "@/lib/api/tauri-investissements";
import { getInvestissementsByContact, updateInvestissement, createInvestissement } from "@/lib/api/tauri-investissements";
import { createInvestissementValorisation } from "@/lib/api/tauri-investissement-valorisations";
import { formatNomProduit } from "@/lib/investissements/investissement-display";
import { getAllPartenaires, type Partenaire } from "@/lib/api/tauri-partenaires";
import { getContactById, getContactsByFoyer } from "@/lib/api/tauri-contacts";
import { loadFoyerInvestissements } from "@/lib/foyers/foyer-utils";
import {
  attachRioPatrimoineOwner,
  buildRioPatrimoineOwner,
} from "@/lib/documents/rio-patrimoine-target";
import { extractPatrimoineItemsFromRio } from "@/lib/documents/extract-patrimoine-items";
import {
  buildImmoInvestissementExtras,
  buildRioValorisationDateIso,
  usesRioEncoursMontant,
} from "@/lib/documents/rio-investissement-extras";
import { isImmobilierFinancingType } from "@/lib/investissements/investissement-immo-financing";
import {
  findCompatibleExistingInvestissements,
  matchRioExtractedInvestissements,
  buildRioMatchContext,
  referenceMontantEuro,
} from "@/lib/documents/rio-investissement-match";
import { resolvePartenaireIdForRioLabel } from "@/lib/documents/rio-product-partenaire";
import { toast } from "sonner";
import { RioImportStepper } from "./RioImportStepper";

function isResidencePrincipaleType(type: string): boolean {
  return type === "RP" || type === "RESIDENCE_PRINCIPALE";
}

interface RioUpdateComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractedData: ExtractedData;
  contactId: number;
  contactNom: string;
  /** Patrimoine commun du foyer (RIO couple). */
  foyerId?: number;
  coupleMemberIds?: number[];
  onComplete: () => void;
  onCancel: () => void;
  /** Intégré dans le wizard (sans Dialog). */
  embedded?: boolean;
  /** Boutons « avec moi / à côté » pour les nouveaux investissements. */
  unifiedTriUx?: boolean;
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
  dateFinCredit?: string;
}

function usesRioEncoursField(type: string): boolean {
  return usesRioEncoursMontant(type);
}

function buildComparisonImmoExtras(comp: InvestissementComparison): Partial<NewInvestissement> {
  return buildImmoInvestissementExtras({
    editedType: comp.editedType,
    mensualiteCredit: comp.mensualiteCredit,
    creditCRD: comp.creditCRD,
    loyerMensuel: comp.loyerMensuel,
    dateFinCredit: comp.dateFinCredit,
  });
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
  { value: "LIVRET_A", label: "Livret A" },
  { value: "LDDS", label: "LDD / LDDS" },
  { value: "LEP", label: "LEP" },
  { value: "PEL", label: "PEL" },
  { value: "CEL", label: "CEL" },
  { value: "CSL", label: "Compte sur livret (CSL)" },
  { value: "COMPTE_COURANT", label: "Compte courant" },
  { value: "PEA", label: "PEA" },
  { value: "COMPTE_TITRE", label: "Compte-titres" },
  { value: "PERP", label: "PERP" },
  { value: "AUTRE", label: "Autre" },
];

function extractInvestissementsFromRIO(data: ExtractedData): ExtractedInvestissement[] {
  return extractPatrimoineItemsFromRio(data).map((item) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      montant: item.montant,
      origine: item.autoOrigine,
      creditCRD: item.creditCRD,
      mensualiteCredit: item.mensualiteCredit,
      loyerAnnuel: item.loyerAnnuel,
      dateFinCredit: item.dateFinCredit,
    }));
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
  foyerId,
  coupleMemberIds,
  onComplete,
  onCancel,
  embedded = false,
  unifiedTriUx = false,
}: RioUpdateComparisonDialogProps) {
  const useFoyerPatrimoine = Boolean(foyerId);
  const defaultOwner = buildRioPatrimoineOwner({
    contactId,
    foyerId,
    useFoyer: useFoyerPatrimoine,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingInvestissements, setExistingInvestissements] = useState<Investissement[]>([]);
  const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
  const [comparisons, setComparisons] = useState<InvestissementComparison[]>([]);
  const [listFilter, setListFilter] = useState<"action" | "all">("action");
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [expandedAdvanced, setExpandedAdvanced] = useState<Set<string>>(new Set());
  const completingRef = useRef(false);

  const handleDialogOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (completingRef.current) {
      completingRef.current = false;
      onOpenChange(false);
      return;
    }
    onCancel();
  };

  useEffect(() => {
    if (open && contactId) {
      loadExistingInvestissements();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement à l'ouverture du dialog
  }, [open, contactId, foyerId, coupleMemberIds]);

  const loadExistingInvestissements = async () => {
    setLoading(true);
    try {
      const [parts] = await Promise.all([getAllPartenaires()]);
      setPartenaires(parts);

      let invs: Investissement[];
      if (foyerId) {
        const members = coupleMemberIds?.length
          ? (
              await Promise.all(
                coupleMemberIds.map((id) => getContactById(id).catch(() => null))
              )
            ).filter((contact): contact is NonNullable<typeof contact> => contact != null)
          : await getContactsByFoyer(foyerId);
        const foyerInvs = await loadFoyerInvestissements(foyerId, members);
        invs = foyerInvs.map(({ proprietaireLabel: _ignored, ...inv }) => inv);
      } else {
        invs = await getInvestissementsByContact(contactId);
      }
      setExistingInvestissements(invs);
      
      const extracted = extractInvestissementsFromRIO(extractedData);
      const matchContext = buildRioMatchContext(parts);
      const matches = matchRioExtractedInvestissements(extracted, invs, matchContext);
      const newComparisons: InvestissementComparison[] = [];

      for (const ext of extracted) {
        const match = matches.get(ext.id) ?? null;
        const compatibleExisting = findCompatibleExistingInvestissements(ext.type, invs);
        
        if (match) {
          const oldMontant = referenceMontantEuro(match, ext.type);
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
            loyerMensuel: ext.loyerAnnuel ? Math.round(ext.loyerAnnuel / 12) : undefined,
            mensualiteCredit: ext.mensualiteCredit,
            creditCRD: ext.creditCRD,
            dateFinCredit: ext.dateFinCredit,
          });
        } else {
          newComparisons.push({
            id: ext.id,
            type: ext.type,
            label: ext.label,
            editedLabel: ext.label,
            editedType: ext.type,
            selectedPartenaireId: resolvePartenaireIdForRioLabel(ext.label, parts),
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
            dateFinCredit: ext.dateFinCredit,
          });
        }
      }

      setComparisons(newComparisons);
    } catch (error) {
      console.error("Erreur chargement investissements:", error);
      toast.error("Impossible de charger les investissements pour la comparaison RIO.");
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
      immobilier: comparisons.filter(c => isImmobilierFinancingType(c.editedType)),
      scpi: comparisons.filter(c => ["SCPI", "SCPI_DEMEMBREMENT"].includes(c.editedType)),
      assuranceViePer: comparisons.filter(c => ["ASSURANCE_VIE", "PER", "PEA", "COMPTE_TITRE"].includes(c.editedType)),
      epargne: comparisons.filter(c => ["EPARGNE_BANCAIRE", "LIVRET_A", "LDDS", "PEL", "CEL", "CSL"].includes(c.editedType)),
      autres: comparisons.filter(c => !["RP", "IMMOBILIER", "LOCATIF", "PINEL", "LMNP", "LMP", "SCPI", "SCPI_DEMEMBREMENT", "ASSURANCE_VIE", "PER", "PEA", "COMPTE_TITRE", "EPARGNE_BANCAIRE", "LIVRET_A", "LDDS", "PEL", "CEL", "CSL"].includes(c.editedType)),
    };
    
    return { toUpdate, toAdd, unchanged, avecMoi, patrimoineAvant, patrimoineApres, difference, pourcentage, byCategory };
  }, [comparisons]);

  const unchangedCount = stats.unchanged.length;
  const actionCount = stats.toUpdate.length + stats.toAdd.length;

  const shouldShowComparison = (comp: InvestissementComparison): boolean => {
    if (listFilter === "all") return true;
    if (!comp.isNew && !comp.isChanged) return showUnchanged;
    return true;
  };

  const toggleAdvanced = (id: string) => {
    setExpandedAdvanced((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const handleChangeDateFinCredit = (id: string, dateFin?: string) => {
    setComparisons(prev => prev.map(c =>
      c.id === id ? { ...c, dateFinCredit: dateFin } : c
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
        
        const oldMontant = referenceMontantEuro(existing, c.editedType);
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
      const valorisationDate = buildRioValorisationDateIso(extractedData);

      for (const comp of comparisons) {
        if (!comp.selectedForUpdate) continue;

        const immoExtras = buildComparisonImmoExtras(comp);

        if (comp.linkedToExistingId === null) {
          const encoursType = usesRioEncoursField(comp.editedType);
          const newInv = attachRioPatrimoineOwner(
            {
              type_produit: comp.editedType,
              nom_produit: comp.editedLabel,
              montant_initial: encoursType
                ? undefined
                : Math.round(comp.editedMontant * 100),
              origine: comp.selectedOrigine,
              partenaire_id: comp.selectedPartenaireId || undefined,
              versement_programme: comp.versementProgramme,
              montant_versement_programme: comp.montantVersement
                ? Math.round(comp.montantVersement * 100)
                : undefined,
              frequence_versement: comp.versementProgramme ? comp.frequenceVersement : undefined,
              reinvestissement_dividendes: comp.reinvestissementDividendes,
              date_souscription: comp.dateSouscription
                ? `${comp.dateSouscription}T00:00:00Z`
                : undefined,
              ...immoExtras,
            },
            defaultOwner
          );
          const created = await createInvestissement(newInv);
          if (encoursType) {
            await createInvestissementValorisation({
              investissement_id: created.id,
              montant: Math.round(comp.editedMontant * 100),
              date_valorisation: valorisationDate,
              notes: "Import RIO",
            });
          }
          added++;
        } else {
          const existing = existingInvestissements.find((inv) => inv.id === comp.linkedToExistingId);
          if (!existing) continue;

          const owner = existing.foyer_id
            ? { foyer_id: existing.foyer_id }
            : { contact_id: existing.contact_id ?? contactId };

          const encoursType = usesRioEncoursField(existing.type_produit);
          const encoursChanged =
            encoursType &&
            Math.abs(referenceMontantEuro(existing, comp.editedType) - comp.editedMontant) > 1;

          if (encoursChanged) {
            await createInvestissementValorisation({
              investissement_id: existing.id,
              montant: Math.round(comp.editedMontant * 100),
              date_valorisation: valorisationDate,
              notes: "Mise à jour RIO",
            });
          }

          const mergedNotes = existing.notes;

          const updatedInv = attachRioPatrimoineOwner(
            {
              type_produit: existing.type_produit,
              nom_produit: existing.nom_produit,
              montant_initial: encoursType
                ? existing.montant_initial
                : Math.round(comp.editedMontant * 100),
              origine: comp.selectedOrigine,
              partenaire_id: comp.selectedPartenaireId ?? existing.partenaire_id,
              notes: mergedNotes,
              mensualite_credit: immoExtras.mensualite_credit ?? existing.mensualite_credit,
              credit_crd: immoExtras.credit_crd ?? existing.credit_crd,
              loyer_mensuel: immoExtras.loyer_mensuel ?? existing.loyer_mensuel,
              versement_programme: comp.versementProgramme,
              montant_versement_programme: comp.montantVersement
                ? Math.round(comp.montantVersement * 100)
                : existing.montant_versement_programme,
              frequence_versement: comp.frequenceVersement || existing.frequence_versement,
              reinvestissement_dividendes: comp.reinvestissementDividendes,
              date_souscription: comp.dateSouscription
                ? `${comp.dateSouscription}T00:00:00Z`
                : existing.date_souscription
                  ? new Date(existing.date_souscription * 1000).toISOString()
                  : undefined,
              date_fin_pret: immoExtras.date_fin_pret ?? (existing.date_fin_pret
                ? new Date(existing.date_fin_pret * 1000).toISOString()
                : undefined),
            },
            owner
          );
          await updateInvestissement(existing.id, updatedInv);
          updated++;
        }
      }

      toast.success(
        `Mise à jour terminée : ${updated} investissement(s) mis à jour, ${added} ajouté(s).`
      );
      completingRef.current = true;
      onComplete();
    } catch (error) {
      console.error("Erreur lors de la mise à jour:", error);
      toast.error("Erreur lors de la mise à jour du patrimoine : " + String(error));
    } finally {
      setSaving(false);
    }
  };

  // Fonction de rendu d'un item d'investissement (pour éviter la duplication)
  const renderCompactUnchangedItem = (comp: InvestissementComparison) => (
    <div
      key={comp.id}
      className="flex items-center gap-2 p-2 border rounded-lg bg-gray-50/80 text-sm opacity-80"
    >
      <Checkbox
        checked={comp.selectedForUpdate}
        onCheckedChange={() => handleToggleUpdate(comp.id)}
      />
      {getTypeIcon(comp.type)}
      <span className="font-medium flex-1 truncate">{comp.label}</span>
      <span className="text-muted-foreground shrink-0">{formatEuro(comp.editedMontant)}</span>
      <Badge variant="outline" className="text-xs shrink-0">
        Inchangé
      </Badge>
    </div>
  );

  const renderInvestissementItem = (comp: InvestissementComparison) => {
    if (!comp.isNew && !comp.isChanged) {
      return renderCompactUnchangedItem(comp);
    }

    const showAdvanced = expandedAdvanced.has(comp.id);

    return (
    <div 
      key={comp.id}
      className={`p-3 border rounded-lg min-w-0 max-w-full overflow-hidden ${
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
          <div className="flex-1 flex items-center gap-2 flex-wrap min-w-0">
            {getTypeIcon(comp.type)}
            <span className="font-medium text-sm">{comp.label}</span>
            {usesRioEncoursField(comp.editedType) && (
              <span className="text-xs text-muted-foreground">(encours)</span>
            )}
            
            {/* Affichage avant → après avec différence */}
            {comp.oldMontant != null && comp.oldMontant > 0 ? (
              <>
                <span className="text-sm text-muted-foreground">{formatEuro(comp.oldMontant)}</span>
                <span className="text-muted-foreground">→</span>
                <Input
                  type="number"
                  value={comp.editedMontant}
                  onChange={(e) => handleChangeMontant(comp.id, parseFloat(e.target.value) || 0)}
                  className="h-8 text-sm text-right w-full max-w-[7rem] shrink-0"
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
                  className="h-8 text-sm text-right w-full max-w-[7rem] shrink-0"
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
          <div className="ml-0 sm:ml-8 space-y-2 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground shrink-0 sm:w-20">Associer à :</span>
              <select
                value={comp.linkedToExistingId === null ? "new" : comp.linkedToExistingId.toString()}
                onChange={(e) => {
                  const val = e.target.value;
                  handleChangeLinkToExisting(comp.id, val === "new" ? null : parseInt(val));
                }}
                className="text-sm border rounded px-2 py-1 flex-1 min-w-0 w-full"
              >
                <option value="new">Créer nouvel investissement</option>
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
                          {formatNomProduit(existing.type_produit)} - {existing.nom_produit} ({formatEuro(referenceMontantEuro(existing, existing.type_produit))})
                          {partenaireNom ? ` | ${partenaireNom}` : ""}
                          {dateStr ? ` | ${dateStr}` : ""}
                          {existing.origine === "MON_CONSEIL" ? " · Avec moi" : " · À côté"}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
              </select>
              
              {/* Badge */}
              {comp.linkedToExistingId === null ? (
                <Badge className="bg-green-600 text-xs shrink-0 self-start sm:self-center">Nouveau</Badge>
              ) : (
                <Badge variant="outline" className="text-xs shrink-0 self-start sm:self-center">
                  MAJ {comp.oldMontant ? `(${formatEuro(comp.oldMontant)} → ${formatEuro(comp.editedMontant)})` : ""}
                </Badge>
              )}
            </div>
            
            {/* Détails du nouvel investissement */}
            {comp.linkedToExistingId === null && (
              <div className="p-3 bg-green-50/50 border border-green-200 rounded-lg space-y-3 min-w-0">
                <div className="text-xs font-medium text-green-700">Détails du nouvel investissement</div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
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
                  <div className="min-w-0 sm:col-span-2">
                    <label className="text-xs text-muted-foreground">Origine</label>
                    {unifiedTriUx && comp.linkedToExistingId === null ? (
                      <div className="grid grid-cols-2 gap-1 mt-1 w-full">
                        <Button
                          type="button"
                          variant={comp.selectedOrigine === "MON_CONSEIL" ? "default" : "outline"}
                          size="sm"
                          className={`h-8 text-xs px-2 ${comp.selectedOrigine === "MON_CONSEIL" ? "bg-green-600 hover:bg-green-700" : ""}`}
                          onClick={() => handleChangeOrigine(comp.id, "MON_CONSEIL")}
                        >
                          Avec moi
                        </Button>
                        <Button
                          type="button"
                          variant={comp.selectedOrigine === "EXISTANT_CLIENT" ? "default" : "outline"}
                          size="sm"
                          className={`h-8 text-xs px-2 ${comp.selectedOrigine === "EXISTANT_CLIENT" ? "bg-gray-600 hover:bg-gray-700" : ""}`}
                          onClick={() => handleChangeOrigine(comp.id, "EXISTANT_CLIENT")}
                        >
                          À côté
                        </Button>
                      </div>
                    ) : (
                      <select
                        value={comp.selectedOrigine}
                        onChange={(e) => handleChangeOrigine(comp.id, e.target.value as OrigineInvestissement)}
                        className="w-full h-8 text-sm border rounded px-2"
                      >
                        <option value="EXISTANT_CLIENT">À côté</option>
                        <option value="MON_CONSEIL">Avec moi</option>
                      </select>
                    )}
                  </div>
                </div>
                
                {/* Options avancées conditionnelles selon le type (sauf épargne bancaire hors PEL) */}
                {!["EPARGNE_BANCAIRE", "LIVRET_A", "LDDS", "CEL", "CSL"].includes(comp.editedType) && (
                <div className="pt-2 border-t border-green-200">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-green-800"
                    onClick={() => toggleAdvanced(comp.id)}
                  >
                    {showAdvanced ? (
                      <ChevronDown className="h-3.5 w-3.5 mr-1" aria-hidden />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 mr-1" aria-hidden />
                    )}
                    {showAdvanced ? "Masquer les options" : "Options avancées"}
                  </Button>
                  {showAdvanced && (
                  <>
                  <div className="text-xs font-medium text-green-700 mb-2 mt-1">Options avancées</div>
                  
                  {/* === OPTIONS IMMOBILIER === */}
                  {isImmobilierFinancingType(comp.editedType) && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
                      <div>
                        <label className="text-xs text-muted-foreground">Fin de prêt (JJ/MM/AAAA)</label>
                        <Input
                          placeholder="15/06/2045"
                          value={comp.dateFinCredit || ""}
                          onChange={(e) => handleChangeDateFinCredit(comp.id, e.target.value || undefined)}
                          className="h-7 text-xs"
                        />
                      </div>
                      {!isResidencePrincipaleType(comp.editedType) && (
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
                </>
                )}
                </div>
                )}
              </div>
            )}
            
            {/* Options avancées pour les MISES À JOUR d'existants */}
            {comp.linkedToExistingId !== null && !["EPARGNE_BANCAIRE", "LIVRET_A", "LDDS", "CEL", "CSL"].includes(comp.editedType) && (
              <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg space-y-2 mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-blue-800"
                  onClick={() => toggleAdvanced(comp.id)}
                >
                  {showAdvanced ? (
                    <ChevronDown className="h-3.5 w-3.5 mr-1" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 mr-1" aria-hidden />
                  )}
                  {showAdvanced ? "Masquer les options" : "Options avancées"}
                </Button>
                {showAdvanced && (
                <>
                <div className="text-xs font-medium text-blue-700">Options (valeurs actuelles pré-remplies)</div>
                
                {/* === OPTIONS IMMOBILIER === */}
                {isImmobilierFinancingType(comp.editedType) && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
                    <div>
                      <label className="text-xs text-muted-foreground">Fin de prêt (JJ/MM/AAAA)</label>
                      <Input
                        placeholder="15/06/2045"
                        value={comp.dateFinCredit || ""}
                        onChange={(e) => handleChangeDateFinCredit(comp.id, e.target.value || undefined)}
                        className="h-7 text-xs"
                      />
                    </div>
                    {!isResidencePrincipaleType(comp.editedType) && (
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
                </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
  };

  const reviewContent = (
    <>
      {!embedded && (
        <>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Mise à jour du RIO : {contactNom}
            </DialogTitle>
            <DialogDescription>
              {useFoyerPatrimoine
                ? "Comparez le patrimoine du foyer avec le nouveau RIO. Les investissements seront enregistrés au niveau du foyer."
                : "Comparez les données du nouveau RIO avec les investissements existants. Sélectionnez les éléments à mettre à jour."}
            </DialogDescription>
          </DialogHeader>
          <RioImportStepper currentStep={3} className="pb-2" />
        </>
      )}

      {embedded && (
        <p className="text-sm text-muted-foreground mb-2">
          {useFoyerPatrimoine
            ? `Patrimoine du foyer — comparez avec le RIO de ${contactNom}.`
            : `Comparez le RIO avec les investissements existants de ${contactNom}.`}
        </p>
      )}

      <div className={`${embedded ? "space-y-4 py-2 min-w-0" : "flex-1 overflow-y-auto space-y-4 py-2"}`}>
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={listFilter === "action" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setListFilter("action");
                        setShowUnchanged(false);
                      }}
                    >
                      À traiter ({actionCount})
                    </Button>
                    <Button
                      type="button"
                      variant={listFilter === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setListFilter("all")}
                    >
                      Tout ({comparisons.length})
                    </Button>
                    {listFilter === "action" && unchangedCount > 0 && !showUnchanged && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => setShowUnchanged(true)}
                      >
                        Afficher {unchangedCount} inchangé{unchangedCount > 1 ? "s" : ""}
                      </Button>
                    )}
                  </div>
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
                        {stats.byCategory.immobilier.filter(shouldShowComparison).map(comp => renderInvestissementItem(comp))}
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
                        {stats.byCategory.scpi.filter(shouldShowComparison).map(comp => renderInvestissementItem(comp))}
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
                        {stats.byCategory.assuranceViePer.filter(shouldShowComparison).map(comp => renderInvestissementItem(comp))}
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
                        {stats.byCategory.epargne.filter(shouldShowComparison).map(comp => renderInvestissementItem(comp))}
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
                        {stats.byCategory.autres.filter(shouldShowComparison).map(comp => renderInvestissementItem(comp))}
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

      <div className={`flex flex-wrap items-center justify-between gap-2 shrink-0 ${embedded ? "pt-4 border-t mt-4" : "border-t pt-4"}`}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleSelectAll} disabled={loading}>
            Tout sélectionner
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDeselectAll} disabled={loading}>
            Tout désélectionner
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            {embedded ? "Retour" : "Annuler"}
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
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col min-h-0 flex-1 overflow-hidden min-w-0">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1">{reviewContent}</div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {reviewContent}
        <DialogFooter className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
