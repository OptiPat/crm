import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";
import { RM_RAPPEL_SITUATION_PANEL_HINTS } from "@/lib/souscription-cif/rapport-mission-recap-table";
import { SCPI_ANNEXE_PRODUCT_FICHES } from "@/lib/souscription-cif/scpi-annexe-catalog";
import {
  buildMesPreconisationsFromSouscriptions,
  getScpiSouscriptionPartsWarning,
  patchScpiAnnexeSouscription,
  SCPI_VP_FREQUENCE_OPTIONS,
  shouldAutoSyncMesPreconisationsText,
  type ScpiAnnexeSouscription,
  type ScpiVpFrequence,
  upsertScpiAnnexeSouscription,
} from "@/lib/souscription-cif/scpi-annexe-souscriptions";
import {
  ORIGINE_FONDS_OPTIONS,
  PROVENANCE_FONDS_OPTIONS,
} from "@/lib/souscription-cif/annexes-scpi-origine-fonds";
import type { SouscriptionCifDocumentId } from "@/lib/souscription-cif/souscription-cif-storage";
import { AlertTriangle } from "lucide-react";

type SouscriptionCifDossierFormProps = {
  activeDocument: SouscriptionCifDocumentId;
  /** Identifie le dossier (ex. contactId) pour réinitialiser la synchro auto au changement. */
  dossierKey?: string | number;
  value: SouscriptionDossierFields;
  onChange: (patch: Partial<SouscriptionDossierFields>) => void;
};

export function SouscriptionCifDossierForm({
  activeDocument,
  dossierKey,
  value,
  onChange,
}: SouscriptionCifDossierFormProps) {
  const lastAutoMesPreconisationsRef = useRef(
    buildMesPreconisationsFromSouscriptions(value.scpiAnnexeSouscriptions)
  );

  useEffect(() => {
    const auto = buildMesPreconisationsFromSouscriptions(value.scpiAnnexeSouscriptions);
    const canSync = shouldAutoSyncMesPreconisationsText(
      value.mesPreconisations,
      lastAutoMesPreconisationsRef.current
    );
    const matchesAuto = value.mesPreconisations === auto;
    if (canSync || matchesAuto) {
      lastAutoMesPreconisationsRef.current = auto;
    }
  }, [dossierKey, value.scpiAnnexeSouscriptions, value.mesPreconisations]);

  const applySouscriptionUpdate = (nextSouscriptions: ScpiAnnexeSouscription[]) => {
    const auto = buildMesPreconisationsFromSouscriptions(nextSouscriptions);
    const patch: Partial<SouscriptionDossierFields> = {
      scpiAnnexeSouscriptions: nextSouscriptions,
    };
    if (
      shouldAutoSyncMesPreconisationsText(
        value.mesPreconisations,
        lastAutoMesPreconisationsRef.current
      )
    ) {
      patch.mesPreconisations = auto;
      lastAutoMesPreconisationsRef.current = auto;
    }
    onChange(patch);
  };

  const toggleScpiSouscription = (productKey: string, checked: boolean) => {
    applySouscriptionUpdate(
      upsertScpiAnnexeSouscription(value.scpiAnnexeSouscriptions, productKey, checked)
    );
  };

  const patchScpiField = <K extends keyof ScpiAnnexeSouscription>(
    productKey: string,
    field: K,
    fieldValue: ScpiAnnexeSouscription[K]
  ) => {
    applySouscriptionUpdate(
      patchScpiAnnexeSouscription(value.scpiAnnexeSouscriptions, productKey, field, fieldValue)
    );
  };

  const reprendreTexteAuto = () => {
    const auto = buildMesPreconisationsFromSouscriptions(value.scpiAnnexeSouscriptions);
    lastAutoMesPreconisationsRef.current = auto;
    onChange({ mesPreconisations: auto });
  };

  const autoMesPreconisationsNow = useMemo(
    () => buildMesPreconisationsFromSouscriptions(value.scpiAnnexeSouscriptions),
    [value.scpiAnnexeSouscriptions]
  );

  const mesPreconisationsIsCustom =
    value.mesPreconisations.trim() !== "" &&
    value.mesPreconisations !== autoMesPreconisationsNow &&
    !shouldAutoSyncMesPreconisationsText(
      value.mesPreconisations,
      lastAutoMesPreconisationsRef.current
    );

  const isScpiSelected = (productKey: string) =>
    value.scpiAnnexeSouscriptions.some((s) => s.productKey === productKey);

  const souscriptionForScpi = (productKey: string) =>
    value.scpiAnnexeSouscriptions.find((s) => s.productKey === productKey);

  return (
    <div className="space-y-4">
      {activeDocument === "convention-rto" && (
        <p className="text-sm text-muted-foreground">
          Dates et lieu de naissance : renseignés dans l&apos;onglet Lettre de mission.
        </p>
      )}

      {activeDocument === "lettre-mission" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Lettre de mission</CardTitle>
            <CardDescription>
              Dates, lieu de naissance et objectifs — section 2.1 et en-tête du document.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cif-date-doc">Date du document</Label>
              <Input
                id="cif-date-doc"
                type="date"
                value={value.dateDoc}
                onChange={(e) => onChange({ dateDoc: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cif-date-der">Date du premier entretien (DER)</Label>
              <Input
                id="cif-date-der"
                type="date"
                value={value.dateDer}
                onChange={(e) => onChange({ dateDer: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cif-date-rio">Date de signature du RIO</Label>
              <Input
                id="cif-date-rio"
                type="date"
                value={value.dateRio}
                onChange={(e) => onChange({ dateRio: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cif-date-qpi">Date de signature du QPI</Label>
              <Input
                id="cif-date-qpi"
                type="date"
                value={value.dateQpi}
                onChange={(e) => onChange({ dateQpi: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cif-lieu-naissance">Lieu de naissance du client</Label>
              <Input
                id="cif-lieu-naissance"
                value={value.lieuNaissance}
                onChange={(e) => onChange({ lieuNaissance: e.target.value })}
                placeholder="Ex. Montpellier"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cif-objectifs">Objectifs client (contexte de la prestation)</Label>
              <Textarea
                id="cif-objectifs"
                rows={4}
                value={value.objectifsClient}
                onChange={(e) => onChange({ objectifsClient: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Prérempli depuis le foyer CRM ou avec un texte type — à ajuster pour la section 2.1.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {activeDocument === "rapport-mission" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Rapport de mission — rappels</CardTitle>
            <CardDescription>
              Tableau pages 1–3 : synthèse de la demande, de la situation et analyse personnalisée.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cif-rappel-demande">Rappel de la demande</Label>
              <Textarea
                id="cif-rappel-demande"
                rows={4}
                value={value.rappelDemande}
                onChange={(e) => onChange({ rappelDemande: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Prérempli avec un texte type — à ajuster pour le rapport de mission.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cif-rappel-situation">Rappel de la situation du client</Label>
              <Textarea
                id="cif-rappel-situation"
                rows={14}
                className="font-mono text-xs leading-relaxed"
                value={value.rappelSituationClient}
                onChange={(e) => onChange({ rappelSituationClient: e.target.value })}
                placeholder="Puces Recueil / QPI (âge, revenus, immobilier, SRI, ESG…)"
              />
              <p className="text-xs text-muted-foreground">
                Libellés courts dans le champ — précisions pour certaines rubriques :
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {RM_RAPPEL_SITUATION_PANEL_HINTS.map(({ label, hint }) => (
                  <li key={label}>
                    <span className="font-medium text-foreground/80">{label}</span> — {hint}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cif-analyse-situation">Analyse de la situation</Label>
              <Textarea
                id="cif-analyse-situation"
                rows={8}
                value={value.analyseSituationClient}
                onChange={(e) => onChange({ analyseSituationClient: e.target.value })}
                placeholder="Rédigez ici l'analyse personnalisée (voir exemples ci-dessous)."
              />
              <p className="text-xs text-muted-foreground">
                Tableau page 3 — après la phrase sur le RIO. Retranscrire la démarche intellectuelle
                : ce que le client vous a dit au premier entretien (R1) et en quoi la préconisation
                répond à son projet.
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                <li>
                  Exemple : le client souhaite se reconvertir professionnellement d&apos;ici X
                  années — expliquer pourquoi les SCPI l&apos;aideraient dans son projet.
                </li>
                <li>Exemple : héritage, donation, préparation de la retraite, etc.</li>
                <li>
                  Autre exemple : couplage Malraux, SCPI, assurance-vie, retraite dans 15 ans,
                  études des enfants, etc.
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {activeDocument === "annexes-rapport" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Annexes SCPI</CardTitle>
            <CardDescription>
              Conseil, préconisations et fiches produits (catalogue).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cif-conseil">Conseil</Label>
              <Textarea
                id="cif-conseil"
                rows={4}
                value={value.conseil}
                onChange={(e) => onChange({ conseil: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Prérempli avec un texte type — à ajuster pour les annexes SCPI.
              </p>
            </div>

            <div id="cif-scpi-souscriptions" className="space-y-2 scroll-mt-4">
              <Label>Souscriptions SCPI</Label>
              <p className="text-xs text-muted-foreground">
                Cochez une SCPI pour saisir montant, prix de part, réinvestissement et VP. Les
                montants alimentent les fiches annexe et le % coûts/frais.
              </p>
              {SCPI_ANNEXE_PRODUCT_FICHES.length > 0 && (
                <div className="divide-y rounded-md border">
                  {SCPI_ANNEXE_PRODUCT_FICHES.map((product) => {
                    const selected = isScpiSelected(product.key);
                    const row = souscriptionForScpi(product.key);
                    return (
                      <div key={product.key} className="px-3 py-2">
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(v) =>
                              toggleScpiSouscription(product.key, v === true)
                            }
                          />
                          {product.label}
                        </label>
                        {selected && row && (
                          <div className="mt-2 space-y-2 pl-6">
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <Label
                                  htmlFor={`cif-scpi-montant-${product.key}`}
                                  className="text-xs text-muted-foreground whitespace-nowrap"
                                >
                                  Montant
                                </Label>
                                <Input
                                  id={`cif-scpi-montant-${product.key}`}
                                  className="w-28"
                                  inputMode="decimal"
                                  placeholder="€"
                                  value={row.montantSouscritEur}
                                  onChange={(e) =>
                                    patchScpiField(product.key, "montantSouscritEur", e.target.value)
                                  }
                                />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Label
                                  htmlFor={`cif-scpi-part-${product.key}`}
                                  className="text-xs text-muted-foreground whitespace-nowrap"
                                >
                                  Prix part
                                </Label>
                                <Input
                                  id={`cif-scpi-part-${product.key}`}
                                  className="w-20"
                                  inputMode="decimal"
                                  placeholder="€"
                                  value={row.partPriceEur}
                                  onChange={(e) =>
                                    patchScpiField(product.key, "partPriceEur", e.target.value)
                                  }
                                />
                              </div>
                            </div>
                            {getScpiSouscriptionPartsWarning(row) && (
                              <p className="flex items-start gap-1.5 text-xs text-amber-800">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                {getScpiSouscriptionPartsWarning(row)}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <Label
                                  htmlFor={`cif-scpi-reinv-${product.key}`}
                                  className="text-xs text-muted-foreground whitespace-nowrap"
                                >
                                  Réinvest. dividendes
                                </Label>
                                <Input
                                  id={`cif-scpi-reinv-${product.key}`}
                                  className="w-16"
                                  inputMode="decimal"
                                  placeholder="%"
                                  value={row.reinvestissementDividendesPct}
                                  onChange={(e) =>
                                    patchScpiField(
                                      product.key,
                                      "reinvestissementDividendesPct",
                                      e.target.value
                                    )
                                  }
                                />
                                <span className="text-xs text-muted-foreground">%</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Label
                                  htmlFor={`cif-scpi-vp-${product.key}`}
                                  className="text-xs text-muted-foreground whitespace-nowrap"
                                >
                                  VP
                                </Label>
                                <Input
                                  id={`cif-scpi-vp-${product.key}`}
                                  className="w-16"
                                  inputMode="decimal"
                                  placeholder="€"
                                  value={row.vpMontantEur}
                                  onChange={(e) =>
                                    patchScpiField(product.key, "vpMontantEur", e.target.value)
                                  }
                                />
                                <Select
                                  value={row.vpFrequence}
                                  onValueChange={(v) =>
                                    patchScpiField(product.key, "vpFrequence", v as ScpiVpFrequence)
                                  }
                                >
                                  <SelectTrigger
                                    id={`cif-scpi-vp-freq-${product.key}`}
                                    className="h-9 w-[6.5rem]"
                                    aria-label={`Périodicité VP ${product.label}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SCPI_VP_FREQUENCE_OPTIONS.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cif-mes-preconisations">Mes préconisations</Label>
              <Textarea
                id="cif-mes-preconisations"
                rows={6}
                value={value.mesPreconisations}
                onChange={(e) => onChange({ mesPreconisations: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Mis à jour automatiquement quand vous modifiez le tableau — éditable librement pour
                ajouter ou reformuler. Les retouches manuelles ne sont pas écrasées tant que vous
                ne reprenez pas le texte auto.
              </p>
              {mesPreconisationsIsCustom && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={reprendreTexteAuto}
                >
                  Reprendre le texte depuis le tableau
                </Button>
              )}
            </div>

            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <p className="text-sm font-medium">Coûts et frais — attestation CIF</p>
              <div className="space-y-2">
                <Label htmlFor="cif-quote-part-consultant">
                  Quote-part perçue consultant (CIF)
                </Label>
                <Input
                  id="cif-quote-part-consultant"
                  inputMode="decimal"
                  value={value.quotePartPercueConsultantCifEur}
                  onChange={(e) =>
                    onChange({ quotePartPercueConsultantCifEur: e.target.value })
                  }
                  placeholder="Ex. 900"
                />
                <p className="text-xs text-muted-foreground">
                  Montant issu de l&apos;attestation CIF. Le % du tableau est calculé : quote-part
                  ÷ somme des montants souscrits ci-dessus.
                </p>
              </div>
            </div>

            <div id="cif-provenance-fonds" className="space-y-2 scroll-mt-4">
              <Label>Provenance des fonds</Label>
              <div className="flex flex-wrap gap-4">
                {PROVENANCE_FONDS_OPTIONS.map((option) => (
                  <label key={option.key} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={value.provenanceFonds === option.key}
                      onCheckedChange={(checked) => {
                        if (checked === true) {
                          onChange({ provenanceFonds: option.key });
                        } else if (value.provenanceFonds === option.key) {
                          onChange({ provenanceFonds: "" });
                        }
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <div id="cif-origine-fonds" className="space-y-2 scroll-mt-4">
              <Label>Origine des fonds</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {ORIGINE_FONDS_OPTIONS.map((option) => (
                  <label key={option.key} className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={value.origineFondsSelected.includes(option.key)}
                      onCheckedChange={(checked) => {
                        const selected = new Set(value.origineFondsSelected);
                        if (checked === true) selected.add(option.key);
                        else selected.delete(option.key);
                        onChange({ origineFondsSelected: [...selected] });
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              {value.origineFondsSelected.includes("autre") && (
                <Input
                  value={value.origineFondsAutrePrecision}
                  onChange={(e) => onChange({ origineFondsAutrePrecision: e.target.value })}
                  placeholder="Préciser l'origine « Autre »"
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
