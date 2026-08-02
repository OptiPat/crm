import { open } from "@tauri-apps/plugin-dialog";
import {
  importArbitrageFicheTemplate,
  listArbitrageFicheTemplates,
  type ArbitrageFicheProductKind,
  type ArbitrageFicheTemplate,
} from "@/lib/api/tauri-arbitrage-fiche";

export const ARBITRAGE_FICHE_TEMPLATE_SETTINGS_HINT =
  "Paramètres → Fiches conseil";

export function arbitrageFicheTemplateLabelFromPath(filePath: string): string {
  const base = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  const withoutExt = base.replace(/\.pdf$/i, "").trim();
  return withoutExt || "Modèle PDF";
}

export async function pickAndInstallArbitrageFicheTemplate(
  productKind: ArbitrageFicheProductKind
): Promise<ArbitrageFicheTemplate | null> {
  const selected = await open({
    title: `Modèle fiche conseil arbitrage ${productKind}`,
    multiple: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!selected || typeof selected !== "string") return null;
  const label = arbitrageFicheTemplateLabelFromPath(selected);
  return importArbitrageFicheTemplate(selected, label, productKind);
}

export async function requireArbitrageFicheTemplates(
  productKind: ArbitrageFicheProductKind
): Promise<ArbitrageFicheTemplate[]> {
  const templates = await listArbitrageFicheTemplates(productKind);
  if (templates.length === 0) {
    throw new Error(
      `Aucun modèle ${productKind} configuré. Allez dans ${ARBITRAGE_FICHE_TEMPLATE_SETTINGS_HINT}.`
    );
  }
  return templates;
}

export function resolveArbitrageFicheTemplateForGeneration(
  templates: ArbitrageFicheTemplate[]
): ArbitrageFicheTemplate | null {
  if (templates.length === 1) return templates[0];
  return null;
}
