import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";
import { SCPI_ANNEXE_PRODUCT_FICHES } from "@/lib/souscription-cif/scpi-annexe-catalog";
import type { SouscriptionCifDocumentId } from "@/lib/souscription-cif/souscription-cif-storage";

type SouscriptionCifDossierFormProps = {
  activeDocument: SouscriptionCifDocumentId;
  value: SouscriptionDossierFields;
  onChange: (patch: Partial<SouscriptionDossierFields>) => void;
};

export function SouscriptionCifDossierForm({
  activeDocument,
  value,
  onChange,
}: SouscriptionCifDossierFormProps) {
  const toggleScpiProductKey = (key: string, checked: boolean) => {
    const next = checked
      ? [...value.scpiAnnexeProductKeys, key]
      : value.scpiAnnexeProductKeys.filter((k) => k !== key);
    onChange({ scpiAnnexeProductKeys: next });
  };

  return (
    <div className="space-y-4">
      {activeDocument === "lettre-mission" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Lettre de mission</CardTitle>
            <CardDescription>
              Dates, lieu de naissance et objectifs — section 2.1 et en-tête du document.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              Tableau page 1 : synthèse de la demande et de la situation (Recueil / QPI).
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
            <div className="space-y-2">
              <Label htmlFor="cif-mes-preconisations">Mes préconisations</Label>
              <Textarea
                id="cif-mes-preconisations"
                rows={6}
                value={value.mesPreconisations}
                onChange={(e) => onChange({ mesPreconisations: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Prérempli avec un texte type (montants, parts, VP…) — à ajuster pour cette
                souscription.
              </p>
            </div>

            {SCPI_ANNEXE_PRODUCT_FICHES.length > 0 && (
              <div id="cif-scpi-fiches" className="space-y-2 scroll-mt-4">
                <Label>SCPI — fiches annexe</Label>
                <div className="flex flex-wrap gap-3">
                  {SCPI_ANNEXE_PRODUCT_FICHES.map((product) => (
                    <label
                      key={product.key}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={value.scpiAnnexeProductKeys.includes(product.key)}
                        onCheckedChange={(v) => toggleScpiProductKey(product.key, v === true)}
                      />
                      {product.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {value.scpiAnnexeProductKeys.length > 0
                    ? `${value.scpiAnnexeProductKeys.length} fiche(s) — textes officiels insérés dans l'aperçu.`
                    : "Cochez les SCPI souscrites pour insérer leurs fiches dans le document."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
