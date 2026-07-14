import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL,
  isStelliumLabelAllowedForProduct,
  stelliumAffaireActLabelGroups,
  stelliumSuiviActLabelGroups,
  stelliumLabelGroupsForProduct,
} from "@/lib/placement/stellium-box-placement-labels";
import { STELLIUM_BOX_PLACEMENT_PRODUCT_GROUPS } from "@/lib/placement/stellium-box-placement-products";
import { isVersementComplementaireActLabel } from "@/lib/pipe/pipe-suivi";

export interface StelliumPlacementActFieldsProps {
  productLabel: string;
  stelliumLabel: string;
  onProductChange: (product: string) => void;
  onStelliumLabelChange: (label: string) => void;
  disabled?: boolean;
  /** Pipe Suivi : catalogue gestion + versement complémentaire. */
  suivi?: boolean;
  /** Affaire commerciale : souscription partenaire uniquement. */
  affaire?: boolean;
}

export function StelliumPlacementActFields({
  productLabel,
  stelliumLabel,
  onProductChange,
  onStelliumLabelChange,
  disabled = false,
  suivi = false,
  affaire = false,
}: StelliumPlacementActFieldsProps) {
  const versementComplementaire = isVersementComplementaireActLabel(stelliumLabel);
  const labelGroups = useMemo(() => {
    if (suivi) return stelliumSuiviActLabelGroups(productLabel);
    if (affaire) return stelliumAffaireActLabelGroups();
    return stelliumLabelGroupsForProduct(productLabel);
  }, [productLabel, suivi, affaire]);
  const canPickAct = suivi || affaire || Boolean(productLabel);
  const actFieldLabel = affaire
    ? "Opération partenaire"
    : "Acte de gestion (libellé Stellium)";

  const handleProductChange = (product: string) => {
    onProductChange(product);
    if (affaire) {
      onStelliumLabelChange(AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL);
      return;
    }
    if (
      stelliumLabel &&
      !isStelliumLabelAllowedForProduct(stelliumLabel, product, { suivi, affaire })
    ) {
      onStelliumLabelChange("");
    }
  };

  return (
    <>
      <div className="space-y-2">
        <Label>
          Produit / contrat Stellium
          {suivi && versementComplementaire ? (
            <span className="font-normal text-muted-foreground"> (optionnel)</span>
          ) : null}
        </Label>
        <Select
          value={productLabel}
          onValueChange={handleProductChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sélectionner le produit…" />
          </SelectTrigger>
          <SelectContent className="max-h-[min(24rem,70vh)]">
            {STELLIUM_BOX_PLACEMENT_PRODUCT_GROUPS.map((group) => (
              <SelectGroup key={group.id}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.items.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{actFieldLabel}</Label>
        <Select
          value={stelliumLabel}
          onValueChange={onStelliumLabelChange}
          disabled={disabled || !canPickAct || affaire}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                suivi && !productLabel
                  ? "Sélectionner l'acte…"
                  : productLabel || affaire
                    ? "Sélectionner l'acte…"
                    : "Choisissez d'abord un produit"
              }
            />
          </SelectTrigger>
          <SelectContent className="max-h-[min(24rem,70vh)]">
            {labelGroups.map((group) => (
              <SelectGroup key={group.id}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.items.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {suivi && versementComplementaire ? (
          <p className="text-[11px] text-muted-foreground leading-snug">
            Ouvre une affaire rattachée avec suivi Stellium versement à la création.
          </p>
        ) : affaire ? (
          <p className="text-[11px] text-muted-foreground leading-snug">
            Les actes de gestion (arbitrage, réinvestissement…) se déclarent sur un pipe Suivi.
          </p>
        ) : null}
      </div>
    </>
  );
}
