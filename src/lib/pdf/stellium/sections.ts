/**
 * Découpe un document Stellium en sections nommées.
 * Les titres sont des ancres stables sur le format 2026.
 */
const SECTION_MARKERS: readonly { key: string; pattern: RegExp }[] = [
  { key: "header", pattern: /^(?:Recueil d'informations|Profil investisseur)/im },
  { key: "identite", pattern: /Identité\s/i },
  { key: "coordonnees", pattern: /Coordonnées\s/i },
  { key: "relations", pattern: /Relations\s/i },
  { key: "donations", pattern: /Donations\s/i },
  { key: "testament", pattern: /Testament\s/i },
  { key: "professionnel", pattern: /Professionnel\s/i },
  { key: "reglementaire", pattern: /Réglementaire\s/i },
  { key: "patrimoine", pattern: /Patrimoine\s+Actifs/i },
  { key: "revenusCharges", pattern: /Revenus et charges\s/i },
  { key: "fiscalite", pattern: /Fiscalité\s/i },
  { key: "objectifs", pattern: /Objectifs\s/i },
  { key: "profilRisque", pattern: /Profil de risque\s/i },
  { key: "questionnaire", pattern: /Vos réponses au questionnaire\s/i },
  { key: "mentions", pattern: /MENTIONS RESERVEES|Protection des données/i },
] as const;

export type StelliumSectionKey = (typeof SECTION_MARKERS)[number]["key"];

export type StelliumSections = Partial<Record<StelliumSectionKey, string>>;

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Retourne le contenu d'une section (sans le titre).
 */
export function getSection(sections: StelliumSections, key: StelliumSectionKey): string {
  return sections[key] ?? "";
}

export function splitStelliumSections(text: string): StelliumSections {
  const found: { key: StelliumSectionKey; index: number; length: number }[] = [];

  for (const marker of SECTION_MARKERS) {
    const match = marker.pattern.exec(text);
    if (match?.index !== undefined) {
      found.push({ key: marker.key, index: match.index, length: match[0].length });
    }
  }

  found.sort((a, b) => a.index - b.index);

  const sections: StelliumSections = {};
  for (let i = 0; i < found.length; i++) {
    const current = found[i];
    const start = current.index + current.length;
    const end = i + 1 < found.length ? found[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (body) {
      sections[current.key] = body;
    }
  }

  return sections;
}

/**
 * Extrait la valeur d'un champ « label   valeur » dans un bloc.
 * Le label peut être suivi de « : » et d'espaces variables.
 */
export function extractFieldValue(
  block: string,
  labels: string[],
  stopLabels: string[] = []
): string | undefined {
  for (const label of labels) {
    const stopPattern =
      stopLabels.length > 0
        ? stopLabels.map((s) => escapeRegex(s)).join("|")
        : null;

    const pattern = stopPattern
      ? new RegExp(
          `${escapeRegex(label)}\\s*:?\\s+([\\s\\S]+?)(?=${stopPattern}|$)`,
          "i"
        )
      : new RegExp(`${escapeRegex(label)}\\s*:?\\s+([^\\n]+)`, "i");

    const match = block.match(pattern);
    if (match?.[1]) {
      const value = match[1].trim();
      if (value && value !== "-") return value;
    }
  }
  return undefined;
}
