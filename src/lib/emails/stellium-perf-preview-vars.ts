const STELLIUM_PERF_VAR_RE =
  /\{\{(perf_detail_html_tu|perf_detail_html|perf_detail_tu|perf_detail|perf_intro_tu|perf_intro_vous|perf_resume_html_tu|perf_resume_html|perf_resume_tu|perf_resume|perf_autres_contrats_html_tu|perf_autres_contrats_html|encours|nets|perf_signed|perf_pct|releve_date_label|releve_date|produit|contrat_count)\}\}/;

export function templateUsesStelliumPerfVariables(
  ...parts: (string | null | undefined)[]
): boolean {
  const hay = parts.filter(Boolean).join("\n");
  return STELLIUM_PERF_VAR_RE.test(hay);
}

/** Suffixes `}}_tu` orphelins — variante tu. */
export function repairStelliumTuSuffixOrphans(text: string): string {
  return text
    .replace(/\{\{perf_detail_html_tu\}\}_tu/g, "{{perf_detail_html_tu}}")
    .replace(/\{\{perf_detail_tu\}\}_tu/g, "{{perf_detail_tu}}")
    .replace(/\{\{perf_detail_html\}\}_tu/g, "{{perf_detail_html_tu}}")
    .replace(/\{\{perf_detail\}\}_tu/g, "{{perf_detail_tu}}")
    .replace(/\{\{perf_resume_html\}\}_tu/g, "{{perf_resume_html_tu}}")
    .replace(/\{\{perf_resume\}\}_tu/g, "{{perf_resume_tu}}");
}

/** Suffixes `}}_tu` orphelins — variante vous (mappe vers tokens vous). */
export function repairStelliumVousSuffixOrphans(text: string): string {
  return text
    .replace(/\{\{perf_detail_html_tu\}\}_tu/g, "{{perf_detail_html_tu}}")
    .replace(/\{\{perf_detail_tu\}\}_tu/g, "{{perf_detail_tu}}")
    .replace(/\{\{perf_detail_html\}\}_tu/g, "{{perf_detail_html}}")
    .replace(/\{\{perf_detail\}\}_tu/g, "{{perf_detail}}")
    .replace(/\{\{perf_resume_html\}\}_tu/g, "{{perf_resume_html}}")
    .replace(/\{\{perf_resume\}\}_tu/g, "{{perf_resume}}");
}

/** @deprecated alias tu */
export function repairStelliumPerfSuffixOrphans(text: string): string {
  return repairStelliumTuSuffixOrphans(text);
}

/** Normalise un gabarit tu (variables *_tu / HTML tu). */
export function repairStelliumPerfTemplateText(text: string): string {
  return repairStelliumTuSuffixOrphans(text)
    .replace(/\{\{perf_resume_html_tu\}\}/g, "{{perf_detail_html_tu}}")
    .replace(/\{\{perf_resume_html\}\}/g, "{{perf_detail_html_tu}}")
    .replace(/\{\{perf_resume_tu\}\}/g, "{{perf_detail_tu}}")
    .replace(/\{\{perf_resume\}\}/g, "{{perf_detail_tu}}")
    .replace(/\{\{perf_detail_html\}\}/g, "{{perf_detail_html_tu}}")
    .replace(/\{\{perf_detail\}\}/g, "{{perf_detail_tu}}");
}

/** Normalise un gabarit vous. */
export function repairStelliumVousTemplateText(text: string): string {
  return repairStelliumVousSuffixOrphans(text)
    .replace(/\{\{perf_detail_html_tu\}\}/g, "{{perf_detail_html}}")
    .replace(/\{\{perf_detail_tu\}\}/g, "{{perf_detail}}")
    .replace(/\{\{perf_resume_html_tu\}\}/g, "{{perf_detail_html}}")
    .replace(/\{\{perf_resume_html\}\}/g, "{{perf_detail_html}}")
    .replace(/\{\{perf_resume_tu\}\}/g, "{{perf_detail}}")
    .replace(/\{\{perf_resume\}\}/g, "{{perf_detail_html}}")
    .replace(/\{\{perf_intro_tu\}\}/g, "{{perf_intro_vous}}");
}

export function repairStelliumTemplateForRegistre(
  text: string,
  registre: string | null | undefined
): string {
  if ((registre ?? "VOUS").toUpperCase() === "TU") {
    return repairStelliumPerfTemplateText(text);
  }
  return repairStelliumVousTemplateText(text);
}

/** Contact TU : alias vous → tu pour les anciens gabarits encore en {{perf_detail}}. */
export function alignStelliumVarsForRegistre(
  vars: Record<string, string>,
  registre: string | null | undefined
): Record<string, string> {
  if ((registre ?? "VOUS").toUpperCase() !== "TU") return vars;
  const perfDetailTu = vars.perf_detail_tu?.trim();
  const perfDetailHtmlTu = vars.perf_detail_html_tu?.trim();
  if (!perfDetailTu && !perfDetailHtmlTu) return vars;
  return {
    ...vars,
    ...(perfDetailTu
      ? {
          perf_detail: perfDetailTu,
          perf_resume: vars.perf_resume_tu?.trim() || perfDetailTu,
        }
      : {}),
    ...(perfDetailHtmlTu
      ? {
          perf_detail_html: perfDetailHtmlTu,
          perf_resume_html: vars.perf_resume_html_tu?.trim() || perfDetailHtmlTu,
        }
      : {}),
    perf_intro_vous: vars.perf_intro_tu?.trim() || vars.perf_intro_vous,
  };
}

export function shouldRepairStelliumPerfTemplate(
  item: { etiquette_nom?: string | null },
  ...parts: (string | null | undefined)[]
): boolean {
  return isStelliumPerfQueueItem(item) || templateUsesStelliumPerfVariables(...parts);
}

/** Filet après substitution (corps texte déjà envoyé / modèle legacy en base). */
export function stripOrphanStelliumFormalityLines(text: string): string {
  return text.replace(/^\s*_tu\s*$/gm, "").replace(/^\s*_vous\s*$/gm, "");
}

/** Retire `_tu` / `_vous` orphelins laissés dans le HTML rendu. */
export function stripOrphanStelliumFormalityHtml(html: string): string {
  return html
    .replace(/<div[^>]*>\s*_tu\s*<\/div>/gi, "")
    .replace(/<div[^>]*>\s*_vous\s*<\/div>/gi, "")
    .replace(/(<\/div>)\s*_tu\s*(?=<)/gi, "$1")
    .replace(/(<\/div>)\s*_vous\s*(?=<)/gi, "$1")
    .replace(/>\s*_tu\s*</g, "><")
    .replace(/>\s*_vous\s*</g, "><");
}

export function isStelliumPerfQueueItem(item: { etiquette_nom?: string | null }): boolean {
  return (item.etiquette_nom ?? "").includes("Performance AV/PER Stellium");
}

const STELLIUM_SCALAR_KEYS = [
  "periode",
  "releve_date",
  "releve_date_label",
  "encours",
  "nets",
  "perf_signed",
  "perf_pct",
  "produit",
  "numero",
  "contrat_count",
  "contrat_label",
  "perf_intro_tu",
  "perf_intro_vous",
  "perf_detail",
  "perf_detail_tu",
  "perf_detail_html",
  "perf_detail_html_tu",
  "perf_resume",
  "perf_resume_tu",
  "perf_resume_html",
  "perf_resume_html_tu",
  "perf_autres_contrats_html",
  "perf_autres_contrats_html_tu",
  "beneficiary_prenom",
  "beneficiary_nom",
] as const;

const SAMPLE_METRICS_HTML_TU =
  '<ul style="margin:0;padding:0 0 0 20px;list-style:disc">' +
  '<li style="line-height:1.5;margin:0;padding:0"><strong>Valeur actuelle :</strong> 5 946,02 €</li>' +
  '<li style="line-height:1.5;margin:0;padding:0"><strong>Ce que tu as versé (Net de frais) :</strong> 5 040,84 €</li>' +
  '<li style="line-height:1.5;margin:0;padding:0"><strong>Performance :</strong> +905,18 € soit +17,96 %</li>' +
  "</ul>";

const SAMPLE_DETAIL_TU =
  "Valeur actuelle : 5 946,02 €\n" +
  "Ce que tu as versé (Net de frais) : 5 040,84 €\n" +
  "Performance : +905,18 € soit +17,96 %";

export function buildStelliumPerfPreviewVariables(): Record<string, string> {
  return {
    periode: "Juin 2026",
    releve_date: "20/06/2026",
    releve_date_label: "au 20/06/2026",
    perf_intro_vous: "Voici la performance de votre contrat au 20/06/2026 :",
    perf_intro_tu: "Voici la performance de ton contrat au 20/06/2026 :",
    perf_detail: SAMPLE_DETAIL_TU.replace("tu as", "vous avez"),
    perf_detail_tu: SAMPLE_DETAIL_TU,
    perf_detail_html: SAMPLE_METRICS_HTML_TU.replace("tu as", "vous avez"),
    perf_detail_html_tu: SAMPLE_METRICS_HTML_TU,
    perf_resume: SAMPLE_DETAIL_TU.replace("tu as", "vous avez"),
    perf_resume_tu: SAMPLE_DETAIL_TU,
    perf_resume_html: SAMPLE_METRICS_HTML_TU.replace("tu as", "vous avez"),
    perf_resume_html_tu: SAMPLE_METRICS_HTML_TU,
    encours: "5 946,02 €",
    nets: "5 040,84 €",
    perf_signed: "+905,18 €",
    perf_pct: "+17,96 %",
    produit: "assurance-vie - Generali",
    numero: "9E 271049047",
    contrat_count: "1",
    contrat_label: "Contrat Marie",
    perf_autres_contrats_html: "",
    perf_autres_contrats_html_tu: "",
    beneficiary_prenom: "Marie",
    beneficiary_nom: "Dupont",
  };
}

export function parseStelliumPerfCampaignVariables(
  raw: string | null | undefined
): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const hasContent =
      typeof parsed.encours === "string" ||
      typeof parsed.perf_detail === "string" ||
      typeof parsed.perf_detail_html === "string" ||
      typeof parsed.perf_resume === "string" ||
      typeof parsed.perf_resume_html === "string";
    if (!hasContent) return {};

    const out: Record<string, string> = {};
    for (const key of STELLIUM_SCALAR_KEYS) {
      const v = parsed[key];
      if (typeof v === "string") out[key] = v;
    }
    if (typeof parsed.contrat_count === "number") {
      out.contrat_count = String(parsed.contrat_count);
    }
    if (parsed.is_proxy_for_minor === true) {
      out.is_proxy_for_minor = "true";
    }
    return out;
  } catch {
    return {};
  }
}
