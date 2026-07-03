import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RankIcon } from "@/components/organisation/FilleulRankIcons";
import { SELECT_NONE } from "@/lib/contacts/contact-form-utils";
import {
  FILLEUL_QUALIFICATIONS,
  FILLEUL_QUALIFICATION_META,
  FILLEUL_TITRES,
  FILLEUL_TITRE_META,
  type FilleulQualification,
  type FilleulTitre,
} from "@/lib/organisation/filleul-ranks";

type FilleulRankFormFieldsProps = {
  titre?: string | null;
  qualification?: string | null;
  onTitreChange: (value: string | undefined) => void;
  onQualificationChange: (value: string | undefined) => void;
};

export function FilleulRankFormFields({
  titre,
  qualification,
  onTitreChange,
  onQualificationChange,
}: FilleulRankFormFieldsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Titre (Organisation)</Label>
        <Select
          value={titre || SELECT_NONE}
          onValueChange={(v) => onTitreChange(v === SELECT_NONE ? undefined : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Aucun" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_NONE}>Aucun</SelectItem>
            {FILLEUL_TITRES.map((id) => (
              <SelectItem key={id} value={id}>
                <span className="inline-flex items-center gap-2">
                  <RankIcon kind={FILLEUL_TITRE_META[id as FilleulTitre].icon} />
                  {FILLEUL_TITRE_META[id as FilleulTitre].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Qualification</Label>
        <Select
          value={qualification || SELECT_NONE}
          onValueChange={(v) => onQualificationChange(v === SELECT_NONE ? undefined : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Aucune" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_NONE}>Aucune</SelectItem>
            {FILLEUL_QUALIFICATIONS.map((id) => (
              <SelectItem key={id} value={id}>
                <span className="inline-flex items-center gap-2">
                  <RankIcon
                    kind={FILLEUL_QUALIFICATION_META[id as FilleulQualification].icon}
                  />
                  {FILLEUL_QUALIFICATION_META[id as FilleulQualification].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
