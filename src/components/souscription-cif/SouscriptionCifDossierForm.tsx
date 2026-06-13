import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

type SouscriptionCifDossierFormProps = {
  value: SouscriptionDossierFields;
  onChange: (patch: Partial<SouscriptionDossierFields>) => void;
};

export function SouscriptionCifDossierForm({ value, onChange }: SouscriptionCifDossierFormProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Informations du dossier</CardTitle>
        <CardDescription>
          Champs propres à cette souscription (complètent la fiche client).
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
            placeholder="Ex. optimiser la rentabilité de l'épargne, obtenir des revenus complémentaires…"
          />
          <p className="text-xs text-muted-foreground">
            Reprend les objectifs patrimoniaux du client pour la section 2.1.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
