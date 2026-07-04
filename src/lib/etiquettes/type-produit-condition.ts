import type { ConditionTypeProduit } from "@/lib/api/tauri-etiquettes";
import type {
  ProduitsMatchMode,
  TypeProduitConditionOptions,
  TypeProduitTriStateFilter,
} from "@/lib/etiquettes/type-produit-tri-state";

const DEFAULT_TRI: TypeProduitTriStateFilter = "any";

export function buildTypeProduitConditionConfig(
  types: string[],
  nomsProduit: string[],
  options?: Partial<
    Pick<
      TypeProduitConditionOptions,
      "produitsMatchMode" | "reinvestissementDividendes" | "versementProgramme"
    >
  >
): Record<string, unknown> {
  const out: Record<string, unknown> = { types };
  if (nomsProduit.length > 0) {
    out.noms_produit = nomsProduit;
  }
  if (options?.produitsMatchMode === "any" || options?.produitsMatchMode === "all") {
    out.produits_match_mode = options.produitsMatchMode;
  }
  if (options?.reinvestissementDividendes && options.reinvestissementDividendes !== "any") {
    out.reinvestissement_dividendes = options.reinvestissementDividendes;
  }
  if (options?.versementProgramme && options.versementProgramme !== "any") {
    out.versement_programme = options.versementProgramme;
  }
  return out;
}

export function parseTypeProduitConditionConfig(
  config: ConditionTypeProduit | null | undefined
): TypeProduitConditionOptions {
  const matchRaw = config?.produits_match_mode;
  const produitsMatchMode: ProduitsMatchMode = matchRaw === "all" ? "all" : "any";
  const reinvestRaw = config?.reinvestissement_dividendes;
  const reinvestissementDividendes: TypeProduitTriStateFilter =
    reinvestRaw === "inactive" || reinvestRaw === "active" ? reinvestRaw : DEFAULT_TRI;
  const vpRaw = config?.versement_programme;
  const versementProgramme: TypeProduitTriStateFilter =
    vpRaw === "inactive" || vpRaw === "active" ? vpRaw : DEFAULT_TRI;
  return {
    types: config?.types ?? [],
    nomsProduit: config?.noms_produit ?? [],
    produitsMatchMode,
    reinvestissementDividendes,
    versementProgramme,
  };
}

export function isTypeProduitConditionValid(types: string[], nomsProduit: string[]): boolean {
  return types.length > 0 || nomsProduit.length > 0;
}

export function typeProduitConditionPatch(
  current: ConditionTypeProduit | null | undefined,
  patch: Partial<TypeProduitConditionOptions>
): Record<string, unknown> {
  const parsed = parseTypeProduitConditionConfig(current);
  return buildTypeProduitConditionConfig(
    patch.types ?? parsed.types,
    patch.nomsProduit ?? parsed.nomsProduit,
    {
      produitsMatchMode: patch.produitsMatchMode ?? parsed.produitsMatchMode,
      reinvestissementDividendes:
        patch.reinvestissementDividendes ?? parsed.reinvestissementDividendes,
      versementProgramme: patch.versementProgramme ?? parsed.versementProgramme,
    }
  );
}
