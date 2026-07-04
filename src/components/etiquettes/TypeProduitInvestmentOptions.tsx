import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TypeProduitTriStateFilter } from "@/lib/etiquettes/type-produit-tri-state";

type Props = {
  reinvestissementDividendes: TypeProduitTriStateFilter;
  versementProgramme: TypeProduitTriStateFilter;
  onReinvestissementChange: (v: TypeProduitTriStateFilter) => void;
  onVersementProgrammeChange: (v: TypeProduitTriStateFilter) => void;
  compact?: boolean;
};

export function TypeProduitInvestmentOptions({
  reinvestissementDividendes,
  versementProgramme,
  onReinvestissementChange,
  onVersementProgrammeChange,
  compact = false,
}: Props) {
  const wrapperClass = compact
    ? "grid gap-3 sm:grid-cols-2"
    : "space-y-3 rounded-lg border px-4 py-3";

  return (
    <div className={wrapperClass}>
      {!compact && (
        <>
          <p className="text-xs font-medium text-foreground sm:col-span-2">
            Options sur les investissements ciblés
          </p>
          <p className="text-xs text-muted-foreground -mt-1 sm:col-span-2">
            Appliquées aux produits correspondant ci-dessus, selon les cases sur chaque fiche
            investissement.
          </p>
        </>
      )}
      <div className="space-y-2">
        <Label className={compact ? "text-xs" : undefined}>Réinvestissement des dividendes</Label>
        <Select
          value={reinvestissementDividendes}
          onValueChange={(v) => onReinvestissementChange(v as TypeProduitTriStateFilter)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Sans filtre</SelectItem>
            <SelectItem value="inactive">Au moins un sans réinvestissement</SelectItem>
            <SelectItem value="active">Au moins un avec réinvestissement actif</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className={compact ? "text-xs" : undefined}>Versements programmés</Label>
        <Select
          value={versementProgramme}
          onValueChange={(v) => onVersementProgrammeChange(v as TypeProduitTriStateFilter)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Sans filtre</SelectItem>
            <SelectItem value="inactive">Au moins un sans versement programmé</SelectItem>
            <SelectItem value="active">Au moins un avec versement programmé actif</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
