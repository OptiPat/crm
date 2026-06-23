import type { SouscriptionCifProductType } from "@/lib/souscription-cif/souscription-cif-storage";

export type CifProductTypeOption = {
  id: SouscriptionCifProductType;
  label: string;
  available: boolean;
};

/** Types de souscription CIF — seules les entrées `available` sont sélectionnables. */
export const CIF_PRODUCT_TYPE_OPTIONS: readonly CifProductTypeOption[] = [
  { id: "scpi", label: "SCPI", available: true },
  { id: "capital-investissement", label: "Capital investissement", available: true },
  { id: "g3f", label: "G3F", available: true },
] as const;

export function parseSouscriptionCifProductType(raw: unknown): SouscriptionCifProductType {
  if (raw === "scpi" || raw === "capital-investissement" || raw === "g3f") {
    return raw;
  }
  return "scpi";
}

export function isCifProductTypeAvailable(productType: SouscriptionCifProductType): boolean {
  return CIF_PRODUCT_TYPE_OPTIONS.find((o) => o.id === productType)?.available ?? false;
}

export function getCifProductTypeLabel(productType: SouscriptionCifProductType): string {
  return CIF_PRODUCT_TYPE_OPTIONS.find((o) => o.id === productType)?.label ?? productType;
}
