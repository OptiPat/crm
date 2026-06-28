import {
  bulletinMarkdownToHtml,
  bulletinMarkdownToPlainEmail,
} from "@/lib/emails/bulletin-markdown-html";

/** Exemple fictif pour l'aperçu des modèles SCPI (Paramètres → Modèles email). */
export const SAMPLE_SCPI_BULLETIN_MARKDOWN = [
  "## SCPI Comète – T1 2026",
  "",
  "1. Chiffres clés",
  "- Collecte nette : 132,2 M€",
  "- Taux d'occupation : 99,5 %",
].join("\n");

export function scpiIntroPhrases(count: number): { tu: string; vous: string } {
  if (count <= 1) {
    return {
      tu: "Voici les points clés du bulletin trimestriel de ta SCPI",
      vous: "Voici les points clés du bulletin trimestriel de votre SCPI",
    };
  }
  return {
    tu: "Voici les points clés des bulletins trimestriels de tes SCPI",
    vous: "Voici les points clés des bulletins trimestriels de vos SCPI",
  };
}

function inferScpiCount(raw: Record<string, unknown>, bulletin: string): number {
  if (typeof raw.scpi_count === "number" && raw.scpi_count > 0) {
    return raw.scpi_count;
  }
  if (!bulletin.trim()) return 1;
  const sections = bulletin.split(/\n---\n/).filter((s) => s.trim());
  return Math.max(1, sections.length);
}

export function buildScpiBulletinPreviewVariables(
  periode = "T1 2026",
  markdown = SAMPLE_SCPI_BULLETIN_MARKDOWN,
  scpiCount = 1
): Record<string, string> {
  const trimmed = markdown.trim();
  const intros = scpiIntroPhrases(scpiCount);
  return {
    periode,
    scpi_count: String(scpiCount),
    scpi_intro_tu: intros.tu,
    scpi_intro_vous: intros.vous,
    bulletin_resume: trimmed ? bulletinMarkdownToPlainEmail(trimmed, true) : "",
    bulletin_resume_html: trimmed ? bulletinMarkdownToHtml(trimmed, true) : "",
  };
}

export function templateUsesScpiBulletinVariables(
  ...parts: (string | null | undefined)[]
): boolean {
  const hay = parts.filter(Boolean).join("\n");
  return /\{\{bulletin_resume(_html)?\}\}|\{\{scpi_intro_(tu|vous)\}\}/.test(hay);
}

export function parseScpiCampaignVariables(
  raw: string | null | undefined
): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const periode = typeof parsed.periode === "string" ? parsed.periode : "";
    const bulletin = (
      typeof parsed.bulletin_resume === "string" ? parsed.bulletin_resume : ""
    ).trim();
    const count = inferScpiCount(parsed, bulletin);
    const intros = scpiIntroPhrases(count);
    return {
      periode,
      scpi_count: String(count),
      scpi_intro_tu:
        typeof parsed.scpi_intro_tu === "string" ? parsed.scpi_intro_tu : intros.tu,
      scpi_intro_vous:
        typeof parsed.scpi_intro_vous === "string"
          ? parsed.scpi_intro_vous
          : intros.vous,
      bulletin_resume: bulletin ? bulletinMarkdownToPlainEmail(bulletin, true) : "",
      bulletin_resume_html: bulletin ? bulletinMarkdownToHtml(bulletin, true) : "",
    };
  } catch {
    return {};
  }
}

export function isScpiBulletinQueueItem(
  item: { etiquette_nom?: string | null }
): boolean {
  return (item.etiquette_nom ?? "").includes("Bulletin SCPI trimestriel");
}
