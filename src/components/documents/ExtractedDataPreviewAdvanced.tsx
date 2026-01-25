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
} from "lucide-react";
import type { ExtractedData } from "@/lib/pdf";

interface ExtractedDataPreviewAdvancedProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractedData: ExtractedData;
  onApply: (data: ExtractedData) => void;
  onIgnore: () => void;
}

export function ExtractedDataPreviewAdvanced({
  open,
  onOpenChange,
  extractedData,
  onApply,
  onIgnore,
}: ExtractedDataPreviewAdvancedProps) {
  const [formData, setFormData] = useState<ExtractedData>(extractedData);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["identite", "revenus", "patrimoine"])
  );

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
    onApply(formData);
    onOpenChange(false);
  };

  const handleIgnore = () => {
    onIgnore();
    onOpenChange(false);
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

  const Section = ({
    id,
    icon: Icon,
    title,
    children,
  }: {
    id: string;
    icon: any;
    title: string;
    children: React.ReactNode;
  }) => {
    const isExpanded = expandedSections.has(id);
    return (
      <div className="border rounded-lg">
        <button
          type="button"
          onClick={() => toggleSection(id)}
          className="w-full flex items-center gap-2 p-4 hover:bg-gray-50 transition-colors"
        >
          <Icon className="h-5 w-5 text-primary" />
          <span className="font-medium flex-1 text-left">{title}</span>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </button>
        {isExpanded && <div className="p-4 pt-0 space-y-4">{children}</div>}
      </div>
    );
  };

  const hasData = (fields: any[]) => fields.some((f) => f !== undefined && f !== null && f !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-primary" />
            Données extraites du {formData.typeDocument || "PDF"}
          </DialogTitle>
          <DialogDescription>
            Vérifiez et complétez les informations avant de les appliquer
          </DialogDescription>
        </DialogHeader>

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
              {formData.dateDocument && `Document du ${formData.dateDocument} • `}
              {formData.dateEntreeRelation &&
                `Entrée en relation : ${formData.dateEntreeRelation}`}
            </div>
          </div>
        </div>

        <div className="space-y-3 mt-4">
          {/* Section Identité & Coordonnées */}
          {hasData([
            formData.civilite,
            formData.nom,
            formData.prenom,
            formData.email,
            formData.telephone,
          ]) && (
            <Section id="identite" icon={User} title="Identité & Coordonnées">
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

                {formData.nationalite !== undefined && (
                  <div className="space-y-2">
                    <Label>Nationalité</Label>
                    <Input
                      value={formData.nationalite || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, nationalite: e.target.value })
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
            </Section>
          )}

          {/* Section Situation Familiale & Professionnelle */}
          {hasData([
            formData.situationFamiliale,
            formData.profession,
            formData.statutProfessionnel,
          ]) && (
            <Section
              id="situation"
              icon={Briefcase}
              title="Situation Familiale & Professionnelle"
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
                      value={formData.regimeMatrimonial || ""}
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
                
                {/* TODO: Ajouter formulaire pour les enfants (nom, prénom, date de naissance) */}
                {formData.enfants && formData.enfants.length > 0 && (
                  <div className="md:col-span-2 space-y-2">
                    <Label>Enfants</Label>
                    {formData.enfants.map((enfant, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="text-sm font-medium">
                          Enfant {index + 1}: {enfant.prenom} {enfant.nom}
                          {enfant.dateNaissance && ` - Né(e) le ${enfant.dateNaissance}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

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

                {formData.statutProfessionnel !== undefined && (
                  <div className="space-y-2">
                    <Label>Statut professionnel</Label>
                    <Input
                      value={formData.statutProfessionnel || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          statutProfessionnel: e.target.value,
                        })
                      }
                    />
                  </div>
                )}

                {formData.employeur !== undefined && (
                  <div className="space-y-2">
                    <Label>Employeur</Label>
                    <Input
                      value={formData.employeur || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, employeur: e.target.value })
                      }
                    />
                  </div>
                )}

                {formData.secteurActivite !== undefined && (
                  <div className="space-y-2">
                    <Label>Secteur d'activité</Label>
                    <Input
                      value={formData.secteurActivite || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          secteurActivite: e.target.value,
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Section Revenus & Charges */}
          {hasData([
            formData.revenusSalaires,
            formData.revenusTotal,
            formData.chargesTotal,
          ]) && (
            <Section id="revenus" icon={Euro} title="Revenus & Charges">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Revenus */}
                {hasData([formData.revenusSalaires, formData.revenusTotal]) && (
                  <>
                    <div className="md:col-span-2">
                      <h4 className="font-medium text-sm mb-3">💰 Revenus annuels</h4>
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

                    {formData.revenusTotal !== undefined && (
                      <div className="space-y-2">
                        <Label className="font-semibold">Total revenus</Label>
                        <Input
                          type="number"
                          value={formData.revenusTotal || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              revenusTotal: parseInt(e.target.value) || undefined,
                            })
                          }
                          className="font-semibold"
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Charges */}
                {hasData([formData.chargesEmprunts, formData.chargesTotal]) && (
                  <>
                    <div className="md:col-span-2 mt-4">
                      <h4 className="font-medium text-sm mb-3">💸 Charges annuelles</h4>
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

                    {formData.chargesTotal !== undefined && (
                      <div className="space-y-2">
                        <Label className="font-semibold">Total charges</Label>
                        <Input
                          type="number"
                          value={formData.chargesTotal || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              chargesTotal: parseInt(e.target.value) || undefined,
                            })
                          }
                          className="font-semibold"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </Section>
          )}

          {/* Section Patrimoine */}
          {hasData([
            formData.patrimoineTotal,
            formData.liquidites,
            formData.assuranceVie,
            formData.per,
            formData.scpi,
            formData.residencePrincipale,
          ]) && (
            <Section id="patrimoine" icon={Home} title="Patrimoine">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Patrimoine total */}
                {formData.patrimoineTotal !== undefined && (
                  <>
                    <div className="space-y-2">
                      <Label className="font-semibold text-lg">Patrimoine brut</Label>
                      <Input
                        type="number"
                        value={formData.patrimoineTotal || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            patrimoineTotal: parseInt(e.target.value) || undefined,
                          })
                        }
                        className="font-semibold text-lg"
                      />
                    </div>
                    {formData.patrimoineNet !== undefined && (
                      <div className="space-y-2">
                        <Label className="font-semibold text-lg">Patrimoine net</Label>
                        <Input
                          type="number"
                          value={formData.patrimoineNet || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              patrimoineNet: parseInt(e.target.value) || undefined,
                            })
                          }
                          className="font-semibold text-lg"
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Immobilier - Nouvelle structure avec biens individuels */}
                {formData.biensImmobiliers && formData.biensImmobiliers.length > 0 ? (
                  <>
                    <div className="md:col-span-2 mt-4">
                      <h4 className="font-medium text-sm mb-3">🏠 Immobilier ({formData.biensImmobiliers.length} bien{formData.biensImmobiliers.length > 1 ? 's' : ''})</h4>
                    </div>
                    {formData.biensImmobiliers.map((bien, index) => (
                      <div key={bien.id} className="md:col-span-2 p-3 border rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {bien.type === "RESIDENCE_PRINCIPALE" ? "🏠" : bien.type === "RESIDENCE_SECONDAIRE" ? "🏡" : "🏢"}
                          </span>
                          <span className="font-medium">{bien.nom}</span>
                          <span className="text-muted-foreground text-sm">
                            ({bien.type === "RESIDENCE_PRINCIPALE" ? "RP" : 
                              bien.type === "RESIDENCE_SECONDAIRE" ? "RS" : 
                              bien.type === "SCPI" ? "SCPI" :
                              bien.type === "PINEL" ? "Pinel" :
                              bien.type === "LMNP" ? "LMNP" :
                              bien.type === "LMP" ? "LMP" :
                              "Locatif"})
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          {bien.valeur != null && bien.valeur > 0 && (
                            <div>
                              <span className="text-muted-foreground">Valeur:</span>{" "}
                              <span className="font-medium">{bien.valeur.toLocaleString("fr-FR")} €</span>
                            </div>
                          )}
                          {bien.creditCRD != null && bien.creditCRD > 0 && (
                            <div>
                              <span className="text-muted-foreground">Crédit CRD:</span>{" "}
                              <span className="font-medium">{bien.creditCRD.toLocaleString("fr-FR")} €</span>
                            </div>
                          )}
                          {bien.mensualiteCredit != null && bien.mensualiteCredit > 0 && (
                            <div>
                              <span className="text-muted-foreground">Mensualité:</span>{" "}
                              <span className="font-medium">{bien.mensualiteCredit.toLocaleString("fr-FR")} €</span>
                            </div>
                          )}
                          {bien.loyersAnnuels != null && bien.loyersAnnuels > 0 && (
                            <div>
                              <span className="text-muted-foreground">Loyers/an:</span>{" "}
                              <span className="font-medium">{bien.loyersAnnuels.toLocaleString("fr-FR")} €</span>
                            </div>
                          )}
                          {bien.dateFinCredit && (
                            <div>
                              <span className="text-muted-foreground">Fin crédit:</span>{" "}
                              <span className="font-medium">{bien.dateFinCredit}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                ) : formData.residencePrincipale && (
                  <>
                    <div className="md:col-span-2 mt-4">
                      <h4 className="font-medium text-sm mb-3">🏠 Immobilier</h4>
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
                )}

                {/* Épargne */}
                {hasData([
                  formData.epargneTotal,
                  formData.livretA,
                  formData.compteCourant,
                  formData.ldd,
                  formData.assuranceVie,
                  formData.per,
                  formData.scpi,
                ]) && (
                  <>
                    <div className="md:col-span-2 mt-4">
                      <h4 className="font-medium text-sm mb-3">💰 Épargne</h4>
                    </div>

                    {/* Total épargne */}
                    {formData.epargneTotal !== undefined && (
                      <div className="space-y-2 md:col-span-2">
                        <Label className="font-bold text-lg">Total épargne</Label>
                        <Input
                          type="number"
                          value={formData.epargneTotal || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              epargneTotal: parseInt(e.target.value) || undefined,
                            })
                          }
                          className="font-bold text-lg"
                        />
                      </div>
                    )}

                    {/* Court terme */}
                    {hasData([
                      formData.livretA,
                      formData.compteCourant,
                      formData.ldd,
                    ]) && (
                      <>

                        {formData.livretA !== undefined && (
                          <div className="space-y-2">
                            <Label>Livret A</Label>
                            <Input
                              type="number"
                              value={formData.livretA || ""}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  livretA: parseInt(e.target.value) || undefined,
                                })
                              }
                            />
                          </div>
                        )}

                        {formData.compteCourant !== undefined && (
                          <div className="space-y-2">
                            <Label>Compte courant</Label>
                            <Input
                              type="number"
                              value={formData.compteCourant || ""}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  compteCourant: parseInt(e.target.value) || undefined,
                                })
                              }
                            />
                          </div>
                        )}

                        {formData.ldd !== undefined && (
                          <div className="space-y-2">
                            <Label>LDD</Label>
                            <Input
                              type="number"
                              value={formData.ldd || ""}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  ldd: parseInt(e.target.value) || undefined,
                                })
                              }
                            />
                          </div>
                        )}
                      </>
                    )}

                    {/* Long terme */}
                    {formData.assuranceVie !== undefined && (
                      <div className="space-y-2 md:col-span-2 mt-2">
                        <Label>Assurance vie</Label>
                        <Input
                          type="number"
                          value={formData.assuranceVie || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              assuranceVie: parseInt(e.target.value) || undefined,
                            })
                          }
                        />
                      </div>
                    )}

                    {formData.per !== undefined && (
                      <div className="space-y-2">
                        <Label>PER</Label>
                        <Input
                          type="number"
                          value={formData.per || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              per: parseInt(e.target.value) || undefined,
                            })
                          }
                        />
                      </div>
                    )}

                    {formData.scpi !== undefined && (
                      <div className="space-y-2">
                        <Label>SCPI</Label>
                        <Input
                          type="number"
                          value={formData.scpi || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              scpi: parseInt(e.target.value) || undefined,
                            })
                          }
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </Section>
          )}

          {/* Section Objectifs */}
          {hasData([
            formData.objectifsPrincipaux,
            formData.profilRisque,
            formData.capaciteEpargneMensuelle,
          ]) && (
            <Section id="objectifs" icon={Target} title="Objectifs & Profil">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {formData.objectifsPrincipaux &&
                  formData.objectifsPrincipaux.length > 0 && (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Objectifs principaux</Label>
                      <div className="flex flex-wrap gap-2">
                        {formData.objectifsPrincipaux.map((obj, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                          >
                            {obj}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {formData.profilRisque !== undefined && (
                  <div className="space-y-2">
                    <Label>Profil de risque (SRI)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="7"
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

                {formData.capaciteEpargneMensuelle !== undefined && (
                  <div className="space-y-2">
                    <Label>Capacité d'épargne mensuelle (€)</Label>
                    <Input
                      type="number"
                      value={formData.capaciteEpargneMensuelle || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          capaciteEpargneMensuelle:
                            parseInt(e.target.value) || undefined,
                        })
                      }
                    />
                  </div>
                )}
              </div>
            </Section>
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
              Gestion multi-contacts à venir prochainement
            </div>
          </div>
        )}

        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={handleIgnore}>
            Ignorer
          </Button>
          <Button type="button" onClick={handleApply}>
            Appliquer les données
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
