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
  isStelliumLabelAllowedForProduct,
  stelliumLabelGroupsForProduct,
} from "@/lib/placement/stellium-box-placement-labels";
import { STELLIUM_BOX_PLACEMENT_PRODUCT_GROUPS } from "@/lib/placement/stellium-box-placement-products";

export interface StelliumPlacementActFieldsProps {
  productLabel: string;
  stelliumLabel: string;
  onProductChange: (product: string) => void;
  onStelliumLabelChange: (label: string) => void;
  disabled?: boolean;
}

export function StelliumPlacementActFields({
  productLabel,
  stelliumLabel,
  onProductChange,
  onStelliumLabelChange,
  disabled = false,
}: StelliumPlacementActFieldsProps) {
  const labelGroups = useMemo(
    () => stelliumLabelGroupsForProduct(productLabel),
    [productLabel]
  );

  const handleProductChange = (product: string) => {
    onProductChange(product);
    if (stelliumLabel && !isStelliumLabelAllowedForProduct(stelliumLabel, product)) {
      onStelliumLabelChange("");
    }
  };

  return (
    <>
      <div className="space-y-2">
        <Label>Produit / contrat Stellium</Label>
        <Select value={productLabel} onValueChange={handleProductChange} disabled={disabled}>
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
        <Label>Acte de gestion (libellé Stellium)</Label>
        <Select
          value={stelliumLabel}
          onValueChange={onStelliumLabelChange}
          disabled={disabled || !productLabel}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                productLabel ? "Sélectionner l'acte…" : "Choisissez d'abord un produit"
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
      </div>
    </>
  );
}
