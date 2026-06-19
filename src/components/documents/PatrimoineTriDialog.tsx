import { useEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Home,
  Briefcase,
  PiggyBank,
  TrendingUp,
  Building2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Target,
  ClipboardList,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { ExtractedData } from "@/lib/pdf";
import type { OrigineInvestissement, NewInvestissement } from "@/lib/api/tauri-investissements";
import {
  attachRioPatrimoineOwner,
  buildRioPatrimoineOwner,
  patrimoineOwnerLabel,
} from "@/lib/documents/rio-patrimoine-target";
import { extractPatrimoineItemsFromRio } from "@/lib/documents/extract-patrimoine-items";
import {
  buildImmoInvestissementExtras,
  buildPatrimoineMontantInitial,
  usesRioEncoursMontant,
} from "@/lib/documents/rio-investissement-extras";
import { isImmobilierFinancingType } from "@/lib/investissements/investissement-immo-financing";
import {
  categorizePatrimoineType,
  type RioPatrimoineCategory,
} from "@/lib/documents/rio-import-preview";
import { RioImportStepper } from "./RioImportStepper";

interface PatrimoineItem {
  id: string;
  type: string;
  label: string;
  montant: number;
  autoOrigine?: OrigineInvestissement;
  origine?: OrigineInvestissement;
  creditCRD?: number;
  mensualiteCredit?: number;
  loyerMensuel?: number;
  dateFinCredit?: string;
}

interface PatrimoineTriDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractedData: ExtractedData;
  contactId: number;
  /** Patrimoine commun du foyer (RIO couple). */
  foyerId?: number;
  ownerLabel?: string;
  onComplete: (investissements: NewInvestissement[]) => void;
  onCancel: () => void;
  /** Intégré dans le wizard (sans Dialog). */
  embedded?: boolean;
}

function extractPatrimoineItems(data: ExtractedData): PatrimoineItem[] {
  return extractPatrimoineItemsFromRio(data).map((item) => ({
    ...item,
    loyerMensuel: item.loyerAnnuel ? Math.round(item.loyerAnnuel / 12) : undefined,
  }));
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

const CATEGORY_LABELS: Record<RioPatrimoineCategory, string> = {
  immobilier: "Immobilier",
  placements: "Placements financiers",
  epargne: "Épargne",
};

function isResidencePrincipaleType(type: string): boolean {
  return type === "RP" || type === "RESIDENCE_PRINCIPALE";
}

function hasPatrimoineCredit(item: Pick<PatrimoineItem, "creditCRD" | "mensualiteCredit" | "dateFinCredit">): boolean {
  return (
    (item.creditCRD != null && item.creditCRD > 0) ||
    (item.mensualiteCredit != null && item.mensualiteCredit > 0) ||
    Boolean(item.dateFinCredit?.trim())
  );
}

export function PatrimoineTriDialog({
  open,
  onOpenChange,
  extractedData,
  contactId,
  foyerId,
  ownerLabel,
  onComplete,
  onCancel,
  embedded = false,
}: PatrimoineTriDialogProps) {
  const useFoyerPatrimoine = Boolean(foyerId);
  const owner = buildRioPatrimoineOwner({
    contactId,
    foyerId,
    useFoyer: useFoyerPatrimoine,
  });
  const scopeLabel =
    ownerLabel ??
    patrimoineOwnerLabel({
      useFoyer: useFoyerPatrimoine,
      contactNom: "ce contact",
    });
  const [items, setItems] = useState<PatrimoineItem[]>(() => 
    extractPatrimoineItems(extractedData)
  );
  const [autoEpargneOpen, setAutoEpargneOpen] = useState(false);
  const completingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setItems(extractPatrimoineItems(extractedData));
    }
  }, [open, extractedData]);

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

  const setAllOrigine = (origine: OrigineInvestissement) => {
    setItems((prev) =>
      prev.map((item) => (!item.autoOrigine ? { ...item, origine } : item))
    );
  };

  const groupedToTriItems = useMemo(() => {
    const groups: Record<RioPatrimoineCategory, PatrimoineItem[]> = {
      immobilier: [],
      placements: [],
      epargne: [],
    };
    for (const item of toTriItems) {
      groups[categorizePatrimoineType(item.type)].push(item);
    }
    return groups;
  }, [toTriItems]);

  const updateItemField = (
    itemId: string,
    field: "mensualiteCredit" | "creditCRD" | "loyerMensuel" | "dateFinCredit",
    value: number | string | undefined
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
    );
  };

  // Valider et créer les investissements
  const handleValidate = () => {
    type RioInvImport = NewInvestissement & { rioEncoursEuro?: number };

    const investissements: RioInvImport[] = items
      .filter((item) => item.autoOrigine || item.origine)
      .map((item) => {
        const immoExtras = buildImmoInvestissementExtras({
          editedType: item.type,
          mensualiteCredit: item.mensualiteCredit,
          creditCRD: item.creditCRD,
          loyerMensuel: item.loyerMensuel,
          dateFinCredit: item.dateFinCredit,
        });
        const base = attachRioPatrimoineOwner(
          {
            type_produit: item.type,
            nom_produit: item.label,
            montant_initial: buildPatrimoineMontantInitial(item.type, item.montant),
            origine: item.origine || item.autoOrigine || "EXISTANT_CLIENT",
            ...immoExtras,
          },
          owner
        );
        if (usesRioEncoursMontant(item.type)) {
          return { ...base, rioEncoursEuro: item.montant };
        }
        return base;
      });

    onComplete(investissements);
    completingRef.current = true;
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel();
  };

  // Calculer les totaux
  const totalAvecMoi = items
    .filter(i => i.origine === "MON_CONSEIL")
    .reduce((sum, i) => sum + i.montant, 0);
  const totalACote = items
    .filter(i => i.origine === "EXISTANT_CLIENT" || i.autoOrigine === "EXISTANT_CLIENT")
    .reduce((sum, i) => sum + i.montant, 0);

  const renderTriItem = (item: PatrimoineItem) => (
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
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-bold text-primary">{formatEuro(item.montant)}</p>
              {hasPatrimoineCredit(item) && (
                <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-900 text-[10px]">
                  Crédit
                </Badge>
              )}
            </div>
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
          Avec moi
        </Button>
        <Button
          variant={item.origine === "EXISTANT_CLIENT" ? "default" : "outline"}
          size="sm"
          className={`flex-1 ${item.origine === "EXISTANT_CLIENT" ? "bg-gray-600 hover:bg-gray-700" : ""}`}
          onClick={() => setOrigine(item.id, "EXISTANT_CLIENT")}
        >
          <XCircle className="h-4 w-4 mr-2" />
          À côté
        </Button>
      </div>

      {isImmobilierFinancingType(item.type) && (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3">
          <div className="space-y-1">
            <Label className="text-xs">Mensualité crédit (€/mois)</Label>
            <Input
              type="number"
              className="h-8"
              value={item.mensualiteCredit ?? ""}
              onChange={(e) =>
                updateItemField(
                  item.id,
                  "mensualiteCredit",
                  e.target.value ? parseFloat(e.target.value) : undefined
                )
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CRD (€)</Label>
            <Input
              type="number"
              className="h-8"
              value={item.creditCRD ?? ""}
              onChange={(e) =>
                updateItemField(
                  item.id,
                  "creditCRD",
                  e.target.value ? parseFloat(e.target.value) : undefined
                )
              }
            />
          </div>
          {!isResidencePrincipaleType(item.type) && (
            <div className="space-y-1">
              <Label className="text-xs">Loyer mensuel (€)</Label>
              <Input
                type="number"
                className="h-8"
                value={item.loyerMensuel ?? ""}
                onChange={(e) =>
                  updateItemField(
                    item.id,
                    "loyerMensuel",
                    e.target.value ? parseFloat(e.target.value) : undefined
                  )
                }
              />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Fin de prêt (JJ/MM/AAAA)</Label>
            <Input
              className="h-8"
              placeholder="15/06/2045"
              value={item.dateFinCredit ?? ""}
              onChange={(e) =>
                updateItemField(item.id, "dateFinCredit", e.target.value || undefined)
              }
            />
          </div>
        </div>
      )}
    </div>
  );

  const triContent = (
    <>
      {!embedded && (
        <>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-blue-600" />
              Tri du patrimoine
            </DialogTitle>
            <DialogDescription>
              Patrimoine de <strong>{scopeLabel}</strong> — pour chaque investissement, indiquez s&apos;il a été placé{" "}
              <strong>avec vous</strong> ou s&apos;il existait <strong>à côté</strong>.
            </DialogDescription>
          </DialogHeader>
          <RioImportStepper currentStep={3} className="py-2" />
        </>
      )}

      {embedded && (
        <p className="text-sm text-muted-foreground">
          Patrimoine de <strong>{scopeLabel}</strong> — classez chaque investissement « avec moi » ou « à côté ».
        </p>
      )}

      {items.length > 0 && (
          <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/95 backdrop-blur border-b space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-green-50 border border-green-200 p-2">
                <div className="text-xs text-green-700">Avec moi</div>
                <div className="font-bold text-green-800">{formatEuro(totalAvecMoi)}</div>
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-2">
                <div className="text-xs text-gray-600">À côté</div>
                <div className="font-bold text-gray-800">{formatEuro(totalACote)}</div>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-2">
                <div className="text-xs text-blue-700">Progression</div>
                <div className="font-bold text-blue-800">
                  {toTriItems.filter((i) => i.origine).length}/{toTriItems.length}
                </div>
              </div>
            </div>
            {toTriItems.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setAllOrigine("MON_CONSEIL")}>
                  Tout « avec moi »
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setAllOrigine("EXISTANT_CLIENT")}>
                  Tout « à côté »
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-6 py-2">
          {/* Épargne bancaire (automatique) */}
          {autoItems.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => setAutoEpargneOpen((open) => !open)}
              >
                {autoEpargneOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                )}
                <CheckCircle2 className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                Épargne bancaire — {autoItems.length} classée{autoItems.length > 1 ? "s" : ""} « à côté »
              </button>
              {autoEpargneOpen && (
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
                    <Badge variant="outline" className="text-gray-500 gap-1">
                      <ClipboardList className="h-3 w-3 shrink-0" aria-hidden />
                      À côté
                    </Badge>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          {toTriItems.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-blue-500" />
                Investissements à trier ({toTriItems.filter((i) => i.origine).length}/{toTriItems.length})
              </h3>

              {(Object.keys(CATEGORY_LABELS) as RioPatrimoineCategory[]).map((category) => {
                const categoryItems = groupedToTriItems[category];
                if (categoryItems.length === 0) return null;
                return (
                  <div key={category} className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {CATEGORY_LABELS[category]} ({categoryItems.length})
                    </h4>
                    <div className="space-y-3">{categoryItems.map(renderTriItem)}</div>
                  </div>
                );
              })}
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
                  <p className="text-sm text-green-700 font-medium flex items-center gap-1.5">
                    <Target className="h-4 w-4 shrink-0" aria-hidden />
                    Avec moi
                  </p>
                  <p className="text-xl font-bold text-green-800">{formatEuro(totalAvecMoi)}</p>
                  <p className="text-xs text-green-600">{avecMoiCount} investissement(s)</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-700 font-medium flex items-center gap-1.5">
                    <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />
                    À côté
                  </p>
                  <p className="text-xl font-bold text-gray-800">{formatEuro(totalACote)}</p>
                  <p className="text-xs text-gray-600">{aCoteCount} élément(s)</p>
                </div>
              </div>
            </div>
          )}
        </div>

      <div className={`flex justify-end gap-2 ${embedded ? "pt-4 border-t mt-4" : ""}`}>
        <Button variant="outline" onClick={handleCancel}>
          {embedded ? "Retour" : "Annuler"}
        </Button>
        <Button
          onClick={handleValidate}
          disabled={!allTriCompleted && toTriItems.length > 0}
        >
          {allTriCompleted || toTriItems.length === 0
            ? "Valider l'import"
            : `Trier les ${toTriItems.length - toTriItems.filter((i) => i.origine).length} restant(s)`}
        </Button>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col min-h-0 flex-1 overflow-hidden min-w-0">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1">{triContent}</div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {triContent}
        <DialogFooter className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
