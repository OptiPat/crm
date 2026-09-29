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
  STATUT_OCCUPATION_LOGEMENT_LABELS,
  type StatutOccupationLogement,
} from "@/lib/contacts/contact-occupation";
import type { ExtractedData } from "@/lib/pdf";

type Conjoint = NonNullable<ExtractedData["conjoint"]>;

export function RioCoupleConjointFields({
  conjoint,
  onChange,
}: {
  conjoint: Conjoint;
  onChange: (patch: Partial<Conjoint>) => void;
}) {
  return (
    <div className="md:col-span-3 mt-2 space-y-3 border-t pt-4">
      <p className="text-sm font-medium">
        Conjoint — {[conjoint.prenom, conjoint.nom].filter(Boolean).join(" ") || "investisseur 2"}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Civilité</Label>
          <Select
            value={conjoint.civilite || ""}
            onValueChange={(value) => onChange({ civilite: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Civilité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">Monsieur</SelectItem>
              <SelectItem value="MME">Madame</SelectItem>
              <SelectItem value="AUTRE">Autre</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Nom</Label>
          <Input value={conjoint.nom || ""} onChange={(e) => onChange({ nom: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Prénom</Label>
          <Input
            value={conjoint.prenom || ""}
            onChange={(e) => onChange({ prenom: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Date de naissance</Label>
          <Input
            value={conjoint.dateNaissance || ""}
            onChange={(e) => onChange({ dateNaissance: e.target.value })}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Lieu de naissance</Label>
          <Input
            value={conjoint.lieuNaissance || ""}
            onChange={(e) => onChange({ lieuNaissance: e.target.value })}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Email</Label>
          <Input
            type="email"
            value={conjoint.email || ""}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Téléphone</Label>
          <Input
            value={conjoint.telephone || ""}
            onChange={(e) => onChange({ telephone: e.target.value })}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Occupation du logement</Label>
          <Select
            value={conjoint.statutOccupationLogement}
            onValueChange={(value) =>
              onChange({ statutOccupationLogement: value as StatutOccupationLogement })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Non renseigné" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUT_OCCUPATION_LOGEMENT_LABELS) as StatutOccupationLogement[]).map(
                (key) => (
                  <SelectItem key={key} value={key}>
                    {STATUT_OCCUPATION_LOGEMENT_LABELS[key]}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        L&apos;adresse postale est celle de l&apos;investisseur 1, partagée par le foyer.
      </p>
    </div>
  );
}
