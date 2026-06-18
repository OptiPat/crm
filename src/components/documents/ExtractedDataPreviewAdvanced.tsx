import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileCheck,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  User,
  Briefcase,
  Euro,
  Home,
  Target,
  PiggyBank,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ExtractedData } from "@/lib/pdf";
import type { BienImmobilier, ContratFinancier } from "@/lib/pdf/types";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import {
  buildRioPreviewSummary,
  isGuidedStelliumPreview,
} from "@/lib/documents/rio-import-preview";
import {
  formatSriLabel,
  PROFIL_RISQUE_MAX,
  PROFIL_RISQUE_SRI_FIELD_LABEL,
} from "@/lib/contacts/investisseur-sri";
import { assessRioImport } from "@/lib/documents/rio-import-guard";
import {
  formatRioObjectifsLines,
  normalizeRegimeMatrimonial,
  parseRioObjectifsText,
} from "@/lib/contacts/rio-contact-fields";
import { RioImportStepper } from "./RioImportStepper";
import { RioPreviewSummaryBar } from "./RioPreviewSummaryBar";

interface ExtractedDataPreviewAdvancedProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractedData: ExtractedData;
  onApply: (data: ExtractedData) => void;
  onIgnore: () => void;
  /** Panel sans Dialog (wizard étape 2). */
  variant?: "dialog" | "panel";
  /** Masque le stepper interne (déjà dans la barre contexte). */
  hideStepper?: boolean;
}

interface PreviewSectionProps {
  id: string;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  hidden?: boolean;
  forceExpanded?: boolean;
  expandedSections: Set<string>;
  onToggle: (sectionId: string) => void;
}

/** Composant stable (module) — évite la perte de focus à chaque frappe. */
function PreviewSection({
  id,
  icon: Icon,
  title,
  children,
  hidden,
  forceExpanded,
  expandedSections,
  onToggle,
}: PreviewSectionProps) {
  if (hidden) return null;
  const isExpanded = forceExpanded ?? expandedSections.has(id);
  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={() => !forceExpanded && onToggle(id)}
        className="w-full flex items-center gap-2 p-4 hover:bg-gray-50 transition-colors"
        disabled={forceExpanded}
      >
        <Icon className="h-5 w-5 text-primary" />
        <span className="font-medium flex-1 text-left">{title}</span>
        {!forceExpanded &&
          (isExpanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          ))}
      </button>
      {isExpanded && <div className="p-4 pt-0 space-y-4">{children}</div>}
    </div>
  );
}

function FieldLabelWithRemove({
  label,
  onRemove,
  className,
}: {
  label: string;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label={`Retirer ${label}`}
        title="Retirer de l'import"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function ExtractedDataPreviewAdvanced({
  open,
  onOpenChange,
  extractedData,
  onApply,
  onIgnore,
  variant = "dialog",
  hideStepper = false,
}: ExtractedDataPreviewAdvancedProps) {
  const [formData, setFormData] = useState<ExtractedData>(extractedData);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["identite", "revenus", "patrimoine"])
  );
  const [guidedTab, setGuidedTab] = useState("contact");

  const guidedMode = isGuidedStelliumPreview(formData.typeDocument);
  const isQpiPreview = formData.typeDocument === "QPI";
  const previewSummary = buildRioPreviewSummary(formData);
  const stelliumApplyAssessment = useMemo(() => {
    if (!guidedMode) return null;
    return assessRioImport(formData);
  }, [formData, guidedMode]);
  const applyBlocked = stelliumApplyAssessment?.canProceed === false;
  const hasRioObjectifs = (formData.objectifsPrincipaux?.length ?? 0) > 0;
  const showRioObjectifsSection = formData.typeDocument === "RIO";
  const showRioRevenusSection = formData.typeDocument === "RIO";
  const showQpiProfilSection =
    isQpiPreview &&
    (formData.profilRisque !== undefined ||
      Boolean(
        formData.sensibiliteExtraFinanciere ||
          formData.experienceInvestissement
      ));

  useEffect(() => {
    // En panel (wizard étape 2), l'état local vit jusqu'à « Appliquer » — pas de resync à chaque render parent.
    if (variant === "panel") return;
    const regime = normalizeRegimeMatrimonial(extractedData.regimeMatrimonial);
    setFormData({
      ...extractedData,
      ...(regime !== extractedData.regimeMatrimonial
        ? { regimeMatrimonial: regime }
        : {}),
    });
    setGuidedTab("contact");
  }, [extractedData, variant]);

  const isSectionVisible = (sectionId: string): boolean => {
    if (!guidedMode) return true;
    if (isQpiPreview) {
      if (sectionId === "profil") return guidedTab === "profil";
      if (["identite", "situation"].includes(sectionId)) return guidedTab === "contact";
      return false;
    }
    const tabBySection: Record<string, string> = {
      identite: "contact",
      situation: "contact",
      revenus: "revenus",
      patrimoine: "patrimoine",
      objectifs: "objectifs",
    };
    return tabBySection[sectionId] === guidedTab;
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handleApply = () => {
    if (applyBlocked) return;
    onApply(formData);
    if (variant !== "panel") {
      onOpenChange(false);
    }
  };

  const handleIgnore = () => {
    onIgnore();
    if (variant !== "panel") {
      onOpenChange(false);
    }
  };

  const updateBienImmobilier = (id: string, patch: Partial<BienImmobilier>) => {
    setFormData((prev) => ({
      ...prev,
      biensImmobiliers: prev.biensImmobiliers?.map((b) =>
        b.id === id ? { ...b, ...patch } : b
      ),
    }));
  };

  const updateContratFinancier = (id: string, patch: Partial<ContratFinancier>) => {
    setFormData((prev) => ({
      ...prev,
      contratsFinanciers: prev.contratsFinanciers?.map((c) =>
        c.id === id ? { ...c, ...patch } : c
      ),
    }));
  };

  const clearExtractedField = (fieldKey: keyof ExtractedData) => {
    setFormData((prev) => ({ ...prev, [fieldKey]: undefined }));
  };

  const removeBienImmobilier = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      biensImmobiliers: prev.biensImmobiliers?.filter((b) => b.id !== id),
    }));
  };

  const removeContratFinancier = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      contratsFinanciers: prev.contratsFinanciers?.filter((c) => c.id !== id),
    }));
  };

  const renderRemovableEpargneField = (
    fieldKey: keyof ExtractedData,
    label: string,
    options?: { className?: string; inputClassName?: string }
  ) => {
    const value = formData[fieldKey];
    if (value === undefined || typeof value !== "number") return null;
    return (
      <div className={options?.className ?? "space-y-2"}>
        <FieldLabelWithRemove
          label={label}
          onRemove={() => clearExtractedField(fieldKey)}
          className={options?.inputClassName?.includes("font-bold") ? "font-bold text-lg" : undefined}
        />
        <Input
          type="number"
          value={value || ""}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              [fieldKey]: parseInt(e.target.value, 10) || undefined,
            }))
          }
          className={options?.inputClassName}
        />
      </div>
    );
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return "text-gray-500";
    if (confidence >= 80) return "text-green-600";
    if (confidence >= 60) return "text-orange-500";
    return "text-red-500";
  };

  const getConfidenceIcon = (confidence?: number) => {
    if (!confidence) return <AlertCircle className="h-5 w-5" />;
    if (confidence >= 80)
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    return <AlertCircle className="h-5 w-5 text-orange-500" />;
  };

  const sectionProps = {
    expandedSections,
    onToggle: toggleSection,
  };

  const hasData = (fields: any[]) => fields.some((f) => f !== undefined && f !== null && f !== "");

  const showRevenusChargesSection =
    showRioRevenusSection ||
    hasData([
      formData.revenusSalaires,
      formData.revenusTotal,
      formData.chargesEmprunts,
      formData.chargesTotal,
    ]);

  const getPreviewDescription = (typeDocument?: string): string => {
    switch (typeDocument) {
      case "RIO":
        return "Vérifiez les données extraites du RIO. Après « Appliquer », le contact sera mis à jour et le patrimoine pourra être trié (« avec moi » / « à côté »).";
      case "QPI":
        return `Vérifiez le ${PROFIL_RISQUE_SRI_FIELD_LABEL.toLowerCase()} et l'identité. Seuls le SRI, le nom/prénom et le PDF seront enregistrés sur le contact.`;
      default:
        return "Vérifiez et complétez les informations avant de les appliquer";
    }
  };

  const previewBody = (
    <>
        {/* Score de confiance */}
        <div
          className={`flex items-center gap-2 p-3 rounded-lg border ${
            extractedData.confidence && extractedData.confidence >= 80
              ? "bg-green-50 border-green-200"
              : "bg-orange-50 border-orange-200"
          }`}
        >
          {getConfidenceIcon(extractedData.confidence)}
          <div className="flex-1">
            <div className="font-medium">
              Confiance :{" "}
              <span className={getConfidenceColor(extractedData.confidence)}>
                {extractedData.confidence || 0}%
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {formData.dateSignature && `Signature : ${formData.dateSignature} • `}
              {!formData.dateSignature &&
                formData.dateDocument &&
                `Document du ${formData.dateDocument} • `}
              {formData.dateEntreeRelation &&
                `Entrée en relation : ${formData.dateEntreeRelation}`}
            </div>
          </div>
        </div>

        {isQpiPreview && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" aria-hidden />
            <p>
              Enregistrement sur le contact : identité et <strong>SRI</strong>. Sur le document QPI :
              PDF, <strong>date de signature</strong>
              {formData.sensibiliteExtraFinanciere ? (
                <>
                  {" "}
                  et <strong>durabilité</strong>
                </>
              ) : null}
              . Connaissances / expérience : lecture indicative uniquement.
            </p>
          </div>
        )}

        {guidedMode && (
          <>
            {!hideStepper && (
              <RioImportStepper
                currentStep={2}
                showPatrimoineStep={previewSummary.hasPatrimoineStep}
                className="mt-4"
              />
            )}
            <RioPreviewSummaryBar data={formData} />
            <Tabs value={guidedTab} onValueChange={setGuidedTab} className="mt-4">
              <TabsList
                className={`grid w-full ${isQpiPreview ? "grid-cols-2" : "grid-cols-4"}`}
              >
                <TabsTrigger value="contact">Contact</TabsTrigger>
                {!isQpiPreview && (
                  <>
                    <TabsTrigger value="revenus">Revenus</TabsTrigger>
                    <TabsTrigger value="patrimoine">Patrimoine</TabsTrigger>
                    <TabsTrigger value="objectifs">Objectifs</TabsTrigger>
                  </>
                )}
                {isQpiPreview && <TabsTrigger value="profil">Profil investisseur</TabsTrigger>}
              </TabsList>
            </Tabs>
          </>
        )}

        <div className="space-y-3 mt-4">
          {/* Section Identité & Coordonnées */}
          {hasData([
            formData.civilite,
            formData.nom,
            formData.prenom,
            formData.email,
            formData.telephone,
          ]) && (
            <PreviewSection {...sectionProps}
              id="identite"
              icon={User}
              title="Identité & Coordonnées"
              hidden={!isSectionVisible("identite")}
              forceExpanded={guidedMode}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {formData.civilite !== undefined && (
                  <div className="space-y-2">
                    <Label>Civilité</Label>
                    <Select
                      value={formData.civilite}
                      onValueChange={(value) =>
                        setFormData({ ...formData, civilite: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Monsieur</SelectItem>
                        <SelectItem value="MME">Madame</SelectItem>
                        <SelectItem value="AUTRE">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.nom !== undefined && (
                  <div className="space-y-2">
                    <Label>Nom</Label>
                    <Input
                      value={formData.nom || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, nom: e.target.value })
                      }
                    />
                  </div>
                )}

                {formData.prenom !== undefined && (
                  <div className="space-y-2">
                    <Label>Prénom</Label>
                    <Input
                      value={formData.prenom || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, prenom: e.target.value })
                      }
                    />
                  </div>
                )}

                {formData.nomNaissance !== undefined && (
                  <div className="space-y-2">
                    <Label>Nom de naissance</Label>
                    <Input
                      value={formData.nomNaissance || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, nomNaissance: e.target.value })
                      }
                    />
                  </div>
                )}

                {formData.dateNaissance !== undefined && (
                  <div className="space-y-2">
                    <Label>Date de naissance</Label>
                    <Input
                      value={formData.dateNaissance || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, dateNaissance: e.target.value })
                      }
                    />
                  </div>
                )}

                {formData.lieuNaissance !== undefined && (
                  <div className="space-y-2">
                    <Label>Lieu de naissance</Label>
                    <Input
                      value={formData.lieuNaissance || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, lieuNaissance: e.target.value })
                      }
                    />
                  </div>
                )}

                {formData.email !== undefined && (
                  <div className="space-y-2 md:col-span-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.email || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                    />
                  </div>
                )}

                {formData.telephone !== undefined && (
                  <div className="space-y-2">
                    <Label>Téléphone</Label>
                    <Input
                      value={formData.telephone || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, telephone: e.target.value })
                      }
                    />
                  </div>
                )}

                {formData.adresse !== undefined && (
                  <div className="space-y-2 md:col-span-3">
                    <Label>Adresse</Label>
                    <Input
                      value={formData.adresse || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, adresse: e.target.value })
                      }
                    />
                  </div>
                )}

                {formData.codePostal !== undefined && (
                  <div className="space-y-2">
                    <Label>Code postal</Label>
                    <Input
                      value={formData.codePostal || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, codePostal: e.target.value })
                      }
                    />
                  </div>
                )}

                {formData.ville !== undefined && (
                  <div className="space-y-2 md:col-span-2">
                    <Label>Ville</Label>
                    <Input
                      value={formData.ville || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, ville: e.target.value })
                      }
                    />
                  </div>
                )}
              </div>
            </PreviewSection>
          )}

          {/* Section Situation Familiale & Professionnelle */}
          {hasData([
            formData.situationFamiliale,
            formData.profession,
            formData.regimeMatrimonial,
            formData.employeur,
          ]) && (
            <PreviewSection {...sectionProps}
              id="situation"
              icon={Briefcase}
              title="Situation Familiale & Professionnelle"
              hidden={!isSectionVisible("situation")}
              forceExpanded={guidedMode}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {formData.situationFamiliale !== undefined && (
                  <div className="space-y-2">
                    <Label>Situation familiale</Label>
                    <Input
                      value={formData.situationFamiliale || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          situationFamiliale: e.target.value,
                        })
                      }
                    />
                  </div>
                )}

                {formData.regimeMatrimonial !== undefined && (
                  <div className="space-y-2">
                    <Label>Régime matrimonial</Label>
                    <Input
                      value={
                        normalizeRegimeMatrimonial(formData.regimeMatrimonial) ??
                        formData.regimeMatrimonial ??
                        ""
                      }
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          regimeMatrimonial: e.target.value,
                        })
                      }
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Nombre d'enfants</Label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.nombreEnfants ?? ""}
                    placeholder="0"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        nombreEnfants: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                  />
                </div>

                {formData.profession !== undefined && (
                  <div className="space-y-2">
                    <Label>Profession</Label>
                    <Input
                      value={formData.profession || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, profession: e.target.value })
                      }
                    />
                  </div>
                )}

                {formData.employeur !== undefined && (
                  <div className="space-y-2">
                    <Label>Employeur (→ profession si vide)</Label>
                    <Input
                      value={formData.employeur || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, employeur: e.target.value })
                      }
                    />
                  </div>
                )}
              </div>
            </PreviewSection>
          )}

          {/* Section Revenus & Charges */}
          {showRevenusChargesSection && (
            <PreviewSection {...sectionProps}
              id="revenus"
              icon={Euro}
              title="Revenus & Charges"
              hidden={!isSectionVisible("revenus")}
              forceExpanded={guidedMode}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Revenus */}
                {(showRioRevenusSection ||
                  hasData([formData.revenusSalaires, formData.revenusTotal])) && (
                  <>
                    <div className="md:col-span-2">
                      <h4 className="font-medium text-sm mb-3">Revenus annuels</h4>
                    </div>

                    {formData.revenusSalaires !== undefined && (
                      <div className="space-y-2">
                        <Label>Salaires</Label>
                        <Input
                          type="number"
                          value={formData.revenusSalaires || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              revenusSalaires: parseInt(e.target.value) || undefined,
                            })
                          }
                        />
                      </div>
                    )}

                    {formData.revenusFonciers !== undefined && (
                      <div className="space-y-2">
                        <Label>Revenus fonciers</Label>
                        <Input
                          type="number"
                          value={formData.revenusFonciers || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              revenusFonciers: parseInt(e.target.value) || undefined,
                            })
                          }
                        />
                      </div>
                    )}

                    {formData.revenusFinanciers !== undefined && (
                      <div className="space-y-2">
                        <Label>Revenus financiers</Label>
                        <Input
                          type="number"
                          value={formData.revenusFinanciers || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              revenusFinanciers: parseInt(e.target.value) || undefined,
                            })
                          }
                        />
                      </div>
                    )}

                    {(showRioRevenusSection || formData.revenusTotal !== undefined) && (
                      <div className="space-y-2">
                        <Label className="font-semibold">Total revenus</Label>
                        <Input
                          type="number"
                          value={formData.revenusTotal ?? ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              revenusTotal: e.target.value
                                ? parseInt(e.target.value, 10)
                                : undefined,
                            })
                          }
                          className="font-semibold"
                          placeholder="Revenus annuels du foyer"
                        />
                        {showRioRevenusSection && formData.revenusTotal == null && (
                          <p className="text-xs text-muted-foreground">
                            Non détecté dans le PDF — saisissez le total revenus du RIO.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Charges */}
                {(showRioRevenusSection ||
                  hasData([formData.chargesEmprunts, formData.chargesTotal])) && (
                  <>
                    <div className="md:col-span-2 mt-4">
                      <h4 className="font-medium text-sm mb-3">Charges annuelles</h4>
                    </div>

                    {formData.chargesEmprunts !== undefined && (
                      <div className="space-y-2">
                        <Label>Charges d'emprunts</Label>
                        <Input
                          type="number"
                          value={formData.chargesEmprunts || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              chargesEmprunts:
                                parseInt(e.target.value) || undefined,
                            })
                          }
                        />
                      </div>
                    )}

                    {(showRioRevenusSection || formData.chargesTotal !== undefined) && (
                      <div className="space-y-2">
                        <Label className="font-semibold">Total charges</Label>
                        <Input
                          type="number"
                          value={formData.chargesTotal ?? ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              chargesTotal: e.target.value
                                ? parseInt(e.target.value, 10)
                                : undefined,
                            })
                          }
                          className="font-semibold"
                          placeholder="Charges annuelles du foyer"
                        />
                        {showRioRevenusSection && formData.chargesTotal == null && (
                          <p className="text-xs text-muted-foreground">
                            Non détecté dans le PDF — saisissez le total charges si besoin.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </PreviewSection>
          )}

          {/* Section Patrimoine */}
          {hasData([
            formData.patrimoineTotal,
            formData.liquidites,
            formData.assuranceVie,
            formData.per,
            formData.scpi,
            formData.residencePrincipale,
            formData.contratsFinanciers?.length,
          ]) && (
            <PreviewSection {...sectionProps}
              id="patrimoine"
              icon={Home}
              title="Patrimoine"
              hidden={!isSectionVisible("patrimoine")}
              forceExpanded={guidedMode}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Patrimoine total */}
                {formData.patrimoineTotal !== undefined && (
                  <>
                    <div className="space-y-2">
                      <Label className="font-semibold text-lg">Patrimoine brut</Label>
                      <Input
                        type="number"
                        className="font-semibold text-lg"
                        value={formData.patrimoineTotal || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            patrimoineTotal: parseInt(e.target.value, 10) || undefined,
                          })
                        }
                      />
                    </div>
                    {formData.patrimoineNet !== undefined && (
                      <div className="space-y-2">
                        <Label className="font-semibold text-lg">Patrimoine net</Label>
                        <Input
                          type="number"
                          className="font-semibold text-lg"
                          value={formData.patrimoineNet || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              patrimoineNet: parseInt(e.target.value, 10) || undefined,
                            })
                          }
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Immobilier - Nouvelle structure avec biens individuels */}
                {formData.biensImmobiliers && formData.biensImmobiliers.length > 0 ? (
                  <>
                    <div className="md:col-span-2 mt-4">
                      <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                        <Home className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                        Immobilier ({formData.biensImmobiliers.length} bien{formData.biensImmobiliers.length > 1 ? "s" : ""})
                      </h4>
                    </div>
                    {formData.biensImmobiliers.map((bien) => (
                      <div key={bien.id} className="md:col-span-2 p-3 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">
                            {bien.nom || "Bien immobilier"}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeBienImmobilier(bien.id)}
                            aria-label="Retirer ce bien"
                            title="Retirer de l'import"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-2 md:col-span-2">
                            <Label>Nom du bien</Label>
                            <Input
                              value={bien.nom}
                              onChange={(e) =>
                                updateBienImmobilier(bien.id, { nom: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Valeur (€)</Label>
                            <Input
                              type="number"
                              value={bien.valeur ?? ""}
                              onChange={(e) =>
                                updateBienImmobilier(bien.id, {
                                  valeur: parseInt(e.target.value, 10) || undefined,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Crédit CRD (€)</Label>
                            <Input
                              type="number"
                              value={bien.creditCRD ?? ""}
                              onChange={(e) =>
                                updateBienImmobilier(bien.id, {
                                  creditCRD: parseInt(e.target.value, 10) || undefined,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Mensualité crédit (€)</Label>
                            <Input
                              type="number"
                              value={bien.mensualiteCredit ?? ""}
                              onChange={(e) =>
                                updateBienImmobilier(bien.id, {
                                  mensualiteCredit: parseInt(e.target.value, 10) || undefined,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Loyers annuels (€)</Label>
                            <Input
                              type="number"
                              value={bien.loyersAnnuels ?? ""}
                              onChange={(e) =>
                                updateBienImmobilier(bien.id, {
                                  loyersAnnuels: parseInt(e.target.value, 10) || undefined,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Fin crédit</Label>
                            <Input
                              value={bien.dateFinCredit ?? ""}
                              placeholder="MM/AAAA"
                              onChange={(e) =>
                                updateBienImmobilier(bien.id, { dateFinCredit: e.target.value })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : formData.residencePrincipale ? (
                  <>
                    <div className="md:col-span-2 mt-4 flex items-center justify-between gap-2">
                      <h4 className="font-medium text-sm flex items-center gap-2">
                        <Home className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                        Immobilier
                      </h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => clearExtractedField("residencePrincipale")}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Retirer
                      </Button>
                    </div>
                    {formData.residencePrincipale.valeur !== undefined && (
                      <div className="space-y-2">
                        <Label>Résidence principale</Label>
                        <Input
                          type="number"
                          value={formData.residencePrincipale.valeur || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              residencePrincipale: {
                                ...formData.residencePrincipale,
                                valeur: parseInt(e.target.value) || undefined,
                              },
                            })
                          }
                        />
                      </div>
                    )}
                    {formData.residencePrincipale.pret !== undefined && (
                      <div className="space-y-2">
                        <Label>Crédit RP (CRD)</Label>
                        <Input
                          type="number"
                          value={formData.residencePrincipale.pret || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              residencePrincipale: {
                                ...formData.residencePrincipale,
                                pret: parseInt(e.target.value) || undefined,
                              },
                            })
                          }
                        />
                      </div>
                    )}
                    {formData.residencePrincipale.mensualite !== undefined && (
                      <div className="space-y-2">
                        <Label>Mensualité crédit</Label>
                        <Input
                          type="number"
                          value={formData.residencePrincipale.mensualite || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              residencePrincipale: {
                                ...formData.residencePrincipale,
                                mensualite: parseInt(e.target.value) || undefined,
                              },
                            })
                          }
                        />
                      </div>
                    )}
                  </>
                ) : null}

                {/* Contrats financiers détaillés */}
                {formData.contratsFinanciers && formData.contratsFinanciers.length > 0 && (
                  <>
                    <div className="md:col-span-2 mt-4">
                      <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                        <PiggyBank className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                        Contrats financiers ({formData.contratsFinanciers.length})
                      </h4>
                    </div>
                    {formData.contratsFinanciers.map((contrat) => (
                      <div key={contrat.id} className="md:col-span-2 p-3 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">
                            {contrat.nom || "Contrat financier"}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeContratFinancier(contrat.id)}
                            aria-label="Retirer ce contrat"
                            title="Retirer de l'import"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-2 md:col-span-2">
                            <Label>Nom du contrat</Label>
                            <Input
                              value={contrat.nom}
                              onChange={(e) =>
                                updateContratFinancier(contrat.id, { nom: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Encours (€)</Label>
                            <Input
                              type="number"
                              value={contrat.montant ?? ""}
                              onChange={(e) =>
                                updateContratFinancier(contrat.id, {
                                  montant: parseInt(e.target.value, 10) || 0,
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Épargne */}
                {hasData([
                  formData.epargneTotal,
                  formData.livretA,
                  formData.compteCourant,
                  formData.ldd,
                  formData.lep,
                  formData.pel,
                  formData.cel,
                  formData.csl,
                  formData.livretJeune,
                  formData.partsSociales,
                  formData.assuranceVie,
                  formData.per,
                  formData.perp,
                  formData.madelin,
                  formData.article83,
                  formData.pea,
                  formData.compteTitres,
                  formData.pee,
                  formData.perco,
                  formData.contratCapi,
                  formData.fcpiFip,
                  formData.scpi,
                ]) && (
                  <>
                    <div className="md:col-span-2 mt-4">
                      <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                        <PiggyBank className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                        Épargne
                      </h4>
                    </div>

                    {renderRemovableEpargneField("epargneTotal", "Total épargne", {
                      className: "space-y-2 md:col-span-2",
                      inputClassName: "font-bold text-lg",
                    })}

                    {hasData([
                      formData.livretA,
                      formData.compteCourant,
                      formData.ldd,
                      formData.lep,
                      formData.pel,
                      formData.cel,
                      formData.csl,
                      formData.livretJeune,
                      formData.partsSociales,
                    ]) && (
                      <>
                        {renderRemovableEpargneField("livretA", "Livret A")}
                        {renderRemovableEpargneField("compteCourant", "Compte courant")}
                        {renderRemovableEpargneField("ldd", "LDD/LDDS")}
                        {renderRemovableEpargneField("lep", "LEP")}
                        {renderRemovableEpargneField("pel", "PEL")}
                        {renderRemovableEpargneField("cel", "CEL")}
                        {renderRemovableEpargneField("csl", "CSL")}
                        {renderRemovableEpargneField("livretJeune", "Livret Jeune")}
                        {renderRemovableEpargneField("partsSociales", "Parts sociales")}
                      </>
                    )}

                    {hasData([
                      formData.assuranceVie,
                      formData.per,
                      formData.perp,
                      formData.madelin,
                      formData.article83,
                      formData.pea,
                      formData.compteTitres,
                      formData.pee,
                      formData.perco,
                      formData.contratCapi,
                      formData.fcpiFip,
                      formData.scpi,
                    ]) && (
                      <>
                        {renderRemovableEpargneField("assuranceVie", "Assurance-vie")}
                        {renderRemovableEpargneField("per", "PER")}
                        {renderRemovableEpargneField("perp", "PERP")}
                        {renderRemovableEpargneField("madelin", "Madelin")}
                        {renderRemovableEpargneField("article83", "Article 83")}
                        {renderRemovableEpargneField("pea", "PEA")}
                        {renderRemovableEpargneField("compteTitres", "Compte-titres")}
                        {renderRemovableEpargneField("pee", "PEE")}
                        {renderRemovableEpargneField("perco", "PERCO")}
                        {renderRemovableEpargneField("contratCapi", "Contrat de capitalisation")}
                        {renderRemovableEpargneField("fcpiFip", "FCPI/FIP")}
                        {renderRemovableEpargneField("scpi", "SCPI")}
                      </>
                    )}
                  </>
                )}
              </div>
            </PreviewSection>
          )}

          {/* Objectifs patrimoniaux (RIO uniquement — section Objectifs du recueil) */}
          {showRioObjectifsSection && (
            <PreviewSection {...sectionProps}
              id="objectifs"
              icon={Target}
              title="Objectifs patrimoniaux"
              hidden={!isSectionVisible("objectifs")}
              forceExpanded={guidedMode}
            >
              <div className="space-y-2">
                <Label>Objectifs</Label>
                <Textarea
                  rows={5}
                  value={formatRioObjectifsLines(formData.objectifsPrincipaux) ?? ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      objectifsPrincipaux: parseRioObjectifsText(e.target.value),
                    })
                  }
                  placeholder={"Optimiser la rentabilité de vos placements financiers\nPréparer votre retraite"}
                />
                <p className="text-xs text-muted-foreground">
                  {hasRioObjectifs
                    ? "Extraits de la section Objectifs du RIO (priorité / horizon non importés). Enregistrés sur la fiche contact avec revenus et charges."
                    : "Aucun objectif détecté dans le PDF — saisissez-les manuellement ou vérifiez le document source."}
                </p>
              </div>
            </PreviewSection>
          )}

          {/* Profil investisseur (QPI uniquement) */}
          {showQpiProfilSection && (
            <PreviewSection {...sectionProps}
              id="profil"
              icon={Target}
              title="Profil investisseur"
              hidden={!isSectionVisible("profil")}
              forceExpanded={guidedMode}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {formData.profilRisque !== undefined && (
                  <div className="space-y-2">
                    <Label>{PROFIL_RISQUE_SRI_FIELD_LABEL}</Label>
                    {formData.aversionRisque && (
                      <p className="text-xs text-muted-foreground">
                        Profil Stellium : {formData.aversionRisque}
                        {formatSriLabel(formData.profilRisque)
                          ? ` → ${formatSriLabel(formData.profilRisque)}`
                          : null}
                      </p>
                    )}
                    <Input
                      type="number"
                      min="1"
                      max={String(PROFIL_RISQUE_MAX)}
                      value={formData.profilRisque || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          profilRisque: parseInt(e.target.value) || undefined,
                        })
                      }
                    />
                  </div>
                )}
                {(formData.sensibiliteExtraFinanciere ||
                  formData.experienceInvestissement) && (
                  <div className="space-y-2 md:col-span-2 rounded-lg border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">
                      Durabilité et expérience enregistrées sur le document QPI.
                    </p>
                    {formData.sensibiliteExtraFinanciere && (
                      <p className="text-sm">
                        <span className="font-medium">Durabilité :</span>{" "}
                        {formData.sensibiliteExtraFinanciere}
                      </p>
                    )}
                    {formData.experienceInvestissement && (
                      <p className="text-sm">
                        <span className="font-medium">Expérience :</span>{" "}
                        {formData.experienceInvestissement}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </PreviewSection>
          )}
        </div>

        {/* Alerte si conjoint détecté */}
        {formData.conjoint && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              <div className="font-medium text-blue-900">
                Conjoint détecté dans le document
              </div>
            </div>
            <div className="text-sm text-blue-800">
              {formData.conjoint.nom && formData.conjoint.prenom
                ? `${formData.conjoint.civilite || ""} ${
                    formData.conjoint.prenom
                  } ${formData.conjoint.nom}`
                : "Informations partielles du conjoint détectées"}
            </div>
            <div className="text-xs text-blue-700 mt-1">
              {formData.isCouple
                ? "Import couple : après « Appliquer », le conjoint sera créé ou relié au foyer, puis le patrimoine pourra être trié."
                : "Conjoint mentionné dans le document — vérifiez les identités avant d'appliquer."}
            </div>
          </div>
        )}

        <div className={`flex justify-end gap-2 ${variant === "panel" ? "pt-4 border-t mt-4" : "mt-6"}`}>
          {applyBlocked && stelliumApplyAssessment?.issues[0] && (
            <p className="mr-auto text-sm text-destructive self-center">
              {stelliumApplyAssessment.issues[0]}
            </p>
          )}
          <Button type="button" variant="outline" onClick={handleIgnore}>
            {variant === "panel" ? "Retour" : "Ignorer"}
          </Button>
          <Button type="button" onClick={handleApply} disabled={applyBlocked}>
            {isQpiPreview
              ? "Enregistrer le profil"
              : guidedMode && previewSummary.hasPatrimoineStep
                ? "Valider et continuer →"
                : "Appliquer les données"}
          </Button>
        </div>
    </>
  );

  if (variant === "panel") {
    return (
      <div className="flex flex-col min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="mb-3 shrink-0">
          <h3 className="font-semibold flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-primary" aria-hidden />
            Données extraites — corrigez si besoin
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Comparez avec le PDF à gauche, modifiez les champs puis validez.
          </p>
        </div>
        {previewBody}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-primary" />
            Données extraites — {getDocumentTypeLabel(formData.typeDocument || "AUTRE")}
          </DialogTitle>
          <DialogDescription>
            {getPreviewDescription(formData.typeDocument)}
          </DialogDescription>
        </DialogHeader>
        {previewBody}
      </DialogContent>
    </Dialog>
  );
}
