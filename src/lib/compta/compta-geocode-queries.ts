const STREET_TYPE =
  "Rue|Avenue|Av\\.?|Boulevard|Bd|Chemin|Chem\\.?|Route|Place|Allée|Impasse|Quai|Cours|Square|Passage";

const MAX_QUERIES = 6;

function addUnique(queries: string[], value: string): void {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || queries.includes(trimmed)) return;
  queries.push(trimmed);
}

function stripFranceSuffix(address: string): string {
  return address.replace(/,?\s*France\s*$/i, "").trim();
}

function normalizeSeparators(address: string): string {
  return address
    .replace(/\s*-\s+/g, ", ")
    .replace(/\.\s+(?=[A-ZÀ-Ü0-9])/g, ", ")
    .replace(/,\s*,/g, ",");
}

function expandAbbreviations(address: string): string {
  return address
    .replace(/\bAv\./gi, "Avenue")
    .replace(/\bBd\b/gi, "Boulevard")
    .replace(/\bChem\./gi, "Chemin")
    .replace(/\broute des 2 ponts/gi, "Route des Deux Ponts")
    .replace(/\b(\d+)\s*,\s*(Rue|Avenue|Chemin|Route|Place)/gi, "$1 $2");
}

function normalizeFrenchCommune(name: string): string {
  const trimmed = name.trim();
  const leMatch = trimmed.match(/^(.+?)\s+(le|les)\s+(.+)$/i);
  if (leMatch) {
    return `${leMatch[1]}-${leMatch[2]!.toLowerCase()}-${leMatch[3]}`;
  }
  return trimmed;
}

function extractPostalAndCity(address: string): { cp: string; city: string } | null {
  const match = address.match(/(\d{5})\s*,?\s*([A-Za-zÀ-ÿ' -]+)/);
  if (!match) return null;
  return {
    cp: match[1]!,
    city: match[2]!.split(",")[0]!.trim(),
  };
}

function extractStreetQueries(address: string, cp: string, city: string): string[] {
  const results: string[] = [];
  const beforeCp = address.slice(0, address.indexOf(cp)).replace(/,\s*$/, "");
  const streetPattern = new RegExp(
    `(\\d+\\s*,?\\s*(?:${STREET_TYPE})[^,]*)`,
    "gi"
  );

  for (const match of beforeCp.matchAll(streetPattern)) {
    addUnique(results, `${match[1]!.replace(/\s+/g, " ").trim()}, ${cp} ${city}`);
  }

  const segments = beforeCp
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i]!;
    if (/\d/.test(segment) && new RegExp(STREET_TYPE, "i").test(segment)) {
      addUnique(results, `${segment}, ${cp} ${city}`);
      break;
    }
  }

  return results;
}

function extractLandmarkQueries(address: string, city: string): string[] {
  const results: string[] = [];
  const normalizedCity = normalizeFrenchCommune(city);

  const pathMatch = address.match(/(?:chemin|route)\s+des?\s+([A-Za-zÀ-ÿ-]+)/i);
  if (pathMatch) {
    addUnique(results, `${pathMatch[1]} ${normalizedCity}`);
  }

  const chemDeMatch = address.match(/(?:chem\.?|chemin)\s+de\s+([A-Za-zÀ-ÿ-]+)/i);
  if (chemDeMatch) {
    addUnique(results, `${chemDeMatch[1]} ${normalizedCity}`);
  }

  for (const match of address.matchAll(
    /\b(?:Domaine|Villa|Spa|Restaurant|Bar|Brasserie|Hôtel|Hotel|Centre|Marché|Marche)\s+([A-Za-zÀ-ÿ'-]+)/gi
  )) {
    addUnique(results, `${match[1]} ${normalizedCity}`);
  }

  if (/route des deux ponts/i.test(address)) {
    addUnique(results, `Route des Deux Ponts ${normalizedCity}`);
  }

  return results;
}

/** Variantes Nominatim — les plus fiables en premier, max 6 requêtes. */
export function buildGeocodeQueries(address: string): string[] {
  const prioritized: string[] = [];
  const fallback: string[] = [];

  const raw = address.trim();
  const withoutFrance = stripFranceSuffix(raw);
  const normalizedSep = normalizeSeparators(withoutFrance);
  const expanded = expandAbbreviations(normalizedSep);
  const noParens = expanded.replace(/\([^)]*\)/g, "").replace(/,\s*,/g, ",").trim();

  addUnique(fallback, raw);
  addUnique(fallback, withoutFrance);
  addUnique(fallback, expanded);
  addUnique(fallback, noParens);

  const postal = extractPostalAndCity(expanded);
  if (postal) {
    const city = postal.city;
    const normalizedCity = normalizeFrenchCommune(city);

    for (const streetQuery of extractStreetQueries(expanded, postal.cp, city)) {
      addUnique(prioritized, streetQuery);
    }
    for (const streetQuery of extractStreetQueries(expanded, postal.cp, normalizedCity)) {
      addUnique(prioritized, streetQuery);
    }
    addUnique(prioritized, `${postal.cp} ${normalizedCity}`);
    addUnique(prioritized, noParens);

    for (const landmarkQuery of extractLandmarkQueries(expanded, city)) {
      addUnique(fallback, landmarkQuery);
    }
  } else {
    const parts = expanded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 1) {
      const cityRaw = parts[0]!;
      const words = cityRaw.split(/\s+/).filter(Boolean);
      addUnique(prioritized, `${cityRaw}, France`);
      if (words.length >= 2) {
        const titled = words.map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        );
        addUnique(prioritized, `${titled.join(" ")}, France`);
        addUnique(prioritized, `${titled[0]} ${titled.slice(1).join("-")}, France`);
      }
      addUnique(prioritized, normalizeFrenchCommune(cityRaw));
    } else if (parts.length >= 2) {
      const city = normalizeFrenchCommune(parts[parts.length - 1]!);
      for (const landmarkQuery of extractLandmarkQueries(expanded, city)) {
        addUnique(prioritized, landmarkQuery);
      }
      const poi = parts[0]!.replace(/\([^)]*\)/g, "").trim();
      if (poi.length > 2) {
        addUnique(fallback, `${poi}, ${city}`);
      }
    }
    addUnique(prioritized, normalizedSep);
  }

  const merged = [...prioritized];
  for (const query of fallback) {
    addUnique(merged, query);
  }

  return merged.slice(0, MAX_QUERIES);
}
