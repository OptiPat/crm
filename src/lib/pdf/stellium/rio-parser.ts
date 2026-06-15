import type { BienImmobilier, ExtractedData } from "../types";
import { extractAmountAfterLabel, parseStelliumAmount, AMOUNT_CAPTURE } from "./amounts";
import { computeStelliumConfidence } from "./confidence";
import { normalizeStelliumText } from "./normalize";
import {
  detectCoupleRio,
  normalizeSituationFamiliale,
  parseCoupleEnfants,
  parseCoupleIdentite,
  parseCouplePatrimoine,
  parseCoupleRevenusCharges,
} from "./rio-couple";
import { extractFieldValue, getSection, splitStelliumSections } from "./sections";

function splitNomPrenom(value: string): { nom?: string; prenom?: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return {};
  return {
    prenom: parts[parts.length - 1],
    nom: parts.slice(0, -1).join(" "),
  };
}

function mapCivilite(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower.includes("madame") || lower.includes("mme")) return "MME";
  if (lower.includes("monsieur") || lower.startsWith("m.")) return "M";
  return undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function mapImmoType(label: string): BienImmobilier["type"] {
  const lower = label.toLowerCase();
  if (lower.includes("résidence principale") || lower.includes("residence principale")) {
    return "RESIDENCE_PRINCIPALE";
  }
  if (lower.includes("résidence secondaire") || lower.includes("residence secondaire")) {
    return "RESIDENCE_SECONDAIRE";
  }
  if (lower.includes("pinel")) return "PINEL";
  if (lower.includes("lmnp")) return "LMNP";
  if (lower.includes("lmp")) return "LMP";
  if (lower.includes("scpi")) return "SCPI";
  if (lower.includes("classique") || lower.includes("locatif")) return "LOCATIF";
  return "IMMOBILIER";
}

interface ParsedActifLine {
  category: string;
  nom: string;
  montant: number;
}

function parseActifLines(patrimoineSection: string): ParsedActifLine[] {
  const actifsBlock = patrimoineSection.split(/\bPassifs\b/i)[0] ?? patrimoineSection;
  const lines: ParsedActifLine[] = [];
  const pattern =
    /(Résidence principale|Résidence secondaire|Assurance vie|Compte courant|Livret A|LDD|LDDS|PEL|CEL|PER|PERP|PEA|Compte titres|SCPI|Classique|Pinel|LMNP|LMP|Denormandie|Malraux)\s*[-–—]\s*(.+?)\s+([\d\s,]+)\s*€/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(actifsBlock)) !== null) {
    const montant = parseStelliumAmount(match[3]);
    if (!montant) continue;
    lines.push({
      category: match[1].trim(),
      nom: match[2].trim(),
      montant,
    });
  }

  return lines;
}

function applyFinancialProduct(
  data: ExtractedData,
  category: string,
  montant: number
): void {
  const lower = category.toLowerCase();
  if (lower.includes("assurance vie")) {
    data.assuranceVie = (data.assuranceVie ?? 0) + montant;
    return;
  }
  if (lower.includes("compte courant")) {
    data.compteCourant = (data.compteCourant ?? 0) + montant;
    return;
  }
  if (lower.includes("livret a")) {
    data.livretA = (data.livretA ?? 0) + montant;
    return;
  }
  if (lower.includes("ldd") || lower.includes("ldds")) {
    data.ldd = (data.ldd ?? 0) + montant;
    return;
  }
  if (lower === "pel") {
    data.pel = (data.pel ?? 0) + montant;
    return;
  }
  if (lower === "cel") {
    data.cel = (data.cel ?? 0) + montant;
    return;
  }
  if (lower === "per") {
    data.per = (data.per ?? 0) + montant;
    return;
  }
  if (lower === "perp") {
    data.perp = (data.perp ?? 0) + montant;
    return;
  }
  if (lower === "pea") {
    data.pea = (data.pea ?? 0) + montant;
    return;
  }
  if (lower.includes("compte titres")) {
    data.compteTitres = (data.compteTitres ?? 0) + montant;
    return;
  }
  if (lower === "scpi") {
    data.scpi = (data.scpi ?? 0) + montant;
  }
}

function parsePatrimoine(patrimoineSection: string, data: ExtractedData): void {
  const actifLines = parseActifLines(patrimoineSection);
  const biens: BienImmobilier[] = [];

  for (const line of actifLines) {
    const lower = line.category.toLowerCase();
    if (
      lower.includes("résidence") ||
      lower.includes("residence") ||
      lower.includes("classique") ||
      lower.includes("pinel") ||
      lower.includes("lmnp") ||
      lower.includes("lmp") ||
      lower.includes("denormandie") ||
      lower.includes("malraux")
    ) {
      const type = mapImmoType(line.category);
      const label = `${line.category} - ${line.nom}`;
      const bien: BienImmobilier = {
        id: `immo-${slugify(label)}`,
        type,
        nom: line.nom,
        valeur: line.montant,
      };
      biens.push(bien);

      if (type === "RESIDENCE_PRINCIPALE") {
        data.residencePrincipale = { valeur: line.montant };
      } else if (type === "RESIDENCE_SECONDAIRE") {
        data.residenceSecondaire = { valeur: line.montant };
      } else if (type === "LOCATIF" || type === "PINEL" || type === "LMNP") {
        data.immobilierLocatif = {
          valeur: (data.immobilierLocatif?.valeur ?? 0) + line.montant,
        };
      }
      continue;
    }

    applyFinancialProduct(data, line.category, line.montant);
  }

  if (biens.length > 0) {
    data.biensImmobiliers = biens;
  }

  data.patrimoineTotal = extractAmountAfterLabel(
    patrimoineSection,
    new RegExp(`\\bTOTAL\\s+${AMOUNT_CAPTURE}\\s*€\\s+Passifs`, "i")
  );

  const financierTotal = extractAmountAfterLabel(
    patrimoineSection,
    new RegExp(`\\bFinancier\\s+${AMOUNT_CAPTURE}\\s*€`, "i")
  );
  const immobilierTotal = extractAmountAfterLabel(
    patrimoineSection,
    new RegExp(`\\bImmobilier\\s+${AMOUNT_CAPTURE}\\s*€`, "i")
  );

  const epargneParts = [
    data.compteCourant,
    data.livretA,
    data.ldd,
    data.assuranceVie,
    data.per,
    data.pea,
    data.compteTitres,
    data.scpi,
  ].filter((v): v is number => typeof v === "number" && v > 0);

  data.epargneTotal =
    epargneParts.length > 0
      ? epargneParts.reduce((sum, value) => sum + value, 0)
      : financierTotal;

  if (!data.patrimoineTotal && immobilierTotal && financierTotal) {
    data.patrimoineTotal = immobilierTotal + financierTotal;
  }
}

function parseEnfants(relationsSection: string): ExtractedData["enfants"] {
  const enfants: NonNullable<ExtractedData["enfants"]> = [];
  const pattern =
    /\b([A-ZÀ-Ü][a-zà-üéèê'-]+)\s+([A-ZÀ-Ü][A-ZÀ-Ü\s'-]+)\s+(\d{2}\/\d{2}\/\d{4})\b/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(relationsSection)) !== null) {
    const prenom = match[1].trim();
    const nom = match[2].trim();
    if (nom.split(/\s+/).length < 1) continue;
    enfants.push({
      prenom,
      nom,
      dateNaissance: match[3],
    });
  }

  return enfants.length > 0 ? enfants : undefined;
}

function parseObjectifs(objectifsSection: string): string[] {
  const tableBody = objectifsSection.replace(/^[\s\S]*?Horizon\s+/i, "");
  const objectifs: string[] = [];
  const pattern =
    /([\s\S]+?)\s{2,}.+?\s{2,}(\d+)\s+-/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tableBody)) !== null) {
    const label = match[1].replace(/\s+/g, " ").trim();
    if (label && !/^Epargne de précaution/i.test(label)) {
      objectifs.push(label);
    }
  }

  return [...new Set(objectifs)];
}

function parseRevenusCharges(section: string, data: ExtractedData): void {
  data.revenusSalaires = extractAmountAfterLabel(
    section,
    new RegExp(`Salaires\\s*-\\s*Salaires\\s+${AMOUNT_CAPTURE}\\s*€`, "i")
  );
  data.revenusTotal = extractAmountAfterLabel(
    section,
    new RegExp(`\\bRevenus\\b[\\s\\S]*?\\bTOTAL\\s+${AMOUNT_CAPTURE}\\s*€`, "i")
  );
  if (!data.revenusTotal) {
    data.revenusTotal = data.revenusSalaires;
  }

  data.chargesEmprunts = extractAmountAfterLabel(
    section,
    new RegExp(`Autre dépense\\s*-\\s*Crédit conso\\s+${AMOUNT_CAPTURE}\\s*€`, "i")
  );
  data.chargesPensionsAlimentaires = extractAmountAfterLabel(
    section,
    new RegExp(`Pension alimentaire\\s*-\\s*Pension alimentaire\\s+${AMOUNT_CAPTURE}\\s*€`, "i")
  );
  data.chargesTotal = extractAmountAfterLabel(
    section,
    new RegExp(`\\bCharges\\b[\\s\\S]*?\\bTOTAL\\s+${AMOUNT_CAPTURE}\\s*€`, "i")
  );

  const loyer = extractAmountAfterLabel(
    section,
    new RegExp(`Loyer\\s*-\\s*Loyer\\s+${AMOUNT_CAPTURE}\\s*€`, "i")
  );
  if (loyer) {
    data.chargesAutres = (data.chargesAutres ?? 0) + loyer;
  }
}

/**
 * Parse un Recueil d'informations Stellium (format 2026+).
 */
export function parseStelliumRio(rawText: string): ExtractedData {
  const text = normalizeStelliumText(rawText);
  const sections = splitStelliumSections(text);
  const header = getSection(sections, "header");

  if (detectCoupleRio(header)) {
    return parseStelliumRioCouple(text, sections);
  }

  return parseStelliumRioSolo(text, sections);
}

function parseStelliumRioSolo(
  text: string,
  sections: ReturnType<typeof splitStelliumSections>
): ExtractedData {
  const header = getSection(sections, "header");
  const identite = getSection(sections, "identite");
  const coordonnees = getSection(sections, "coordonnees");
  const relations = getSection(sections, "relations");
  const professionnel = getSection(sections, "professionnel");
  const patrimoine = getSection(sections, "patrimoine");
  const revenusCharges = getSection(sections, "revenusCharges");
  const objectifs = getSection(sections, "objectifs");

  const data: ExtractedData = {
    typeDocument: "RIO",
    raw: text,
  };

  data.civilite = mapCivilite(
    extractFieldValue(identite, ["Civilité"], [
      "Nom d'usage / prénom",
      "Nom de naissance",
      "Né(e) le",
    ])
  );

  const nomPrenom = extractFieldValue(identite, ["Nom d'usage / prénom", "Nom / prénom"], [
    "Nom de naissance",
    "Né(e) le",
  ]);
  if (nomPrenom) {
    const split = splitNomPrenom(nomPrenom);
    data.nom = split.nom;
    data.prenom = split.prenom;
  }

  data.nomNaissance = extractFieldValue(identite, ["Nom de naissance"], ["Né(e) le"]);

  const naissance = extractFieldValue(identite, ["Né(e) le"], ["Nationalité"]);
  if (naissance) {
    const naissanceMatch = naissance.match(
      /(\d{2}\/\d{2}\/\d{4})\s+à\s+(.+?)(?:\s+-\s+France)?$/i
    );
    if (naissanceMatch) {
      data.dateNaissance = naissanceMatch[1];
      data.lieuNaissance = naissanceMatch[2].trim();
    }
  }

  data.nationalite = extractFieldValue(identite, ["Nationalité"], [
    "Mesure de protection",
    "Coordonnées",
  ]);

  data.email = extractFieldValue(coordonnees, ["Adresse e-mail", "E-mail"], [
    "Téléphone mobile",
    "Adresse postale",
  ]);
  data.telephone = extractFieldValue(coordonnees, ["Téléphone mobile"], [
    "Autre téléphone",
    "Adresse postale",
  ]);
  data.telephoneMobile = data.telephone;

  const adresseMatch = coordonnees.match(
    /Adresse postale\s*:?\s+(.+?)\s+(\d{5})\s+([A-Za-zÀ-ÿ\s'-]+)\s*-\s+France/i
  );
  if (adresseMatch) {
    data.adresse = adresseMatch[1].trim();
    data.codePostal = adresseMatch[2];
    data.ville = adresseMatch[3].trim();
    data.pays = "France";
  }

  const situation = extractFieldValue(relations, ["Situation matrimoniale"], ["Régime"]);
  if (situation) {
    data.situationFamiliale = normalizeSituationFamiliale(situation) ?? situation.toUpperCase();
  }

  const regime = extractFieldValue(relations, ["Régime"], [
    "Nombre d'enfants",
    "Enfants",
    "Même foyer fiscal",
  ]);
  if (regime) {
    data.regimeMatrimonial = regime.split(/\s+Même foyer fiscal/i)[0]?.trim();
  }

  const enfants = parseEnfants(relations);
  if (enfants) {
    data.enfants = enfants;
    data.nombreEnfants = enfants.length;
  }

  const enfantsCharge = relations.match(
    /Nombre d'enfants à charge\s*:?\s*(\d+)/i
  );
  if (enfantsCharge) {
    data.nombrePersonnesCharge = parseInt(enfantsCharge[1], 10);
  }

  data.profession = extractFieldValue(
    professionnel,
    ["Profession (ou dernière profession)", "Profession"],
    ["Nom de la société", "Origine des revenus"]
  );
  data.employeur = extractFieldValue(professionnel, ["Nom de la société", "Employeur"], [
    "Origine des revenus",
    "Réglementaire",
  ]);
  data.secteurActivite = extractFieldValue(
    professionnel,
    ["Catégorie socio-professionnelle", "Sous-catégorie"],
    ["Profession", "Nom de la société"]
  );

  if (patrimoine) {
    parsePatrimoine(patrimoine, data);
  }

  if (revenusCharges) {
    parseRevenusCharges(revenusCharges, data);
  }

  if (objectifs) {
    const parsedObjectifs = parseObjectifs(objectifs);
    if (parsedObjectifs.length > 0) {
      data.objectifsPrincipaux = parsedObjectifs;
    }
  }

  const dateEntree = header.match(
    /Date d'entrée en relation\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i
  );
  if (dateEntree) {
    data.dateEntreeRelation = dateEntree[1];
    data.dateDocument = dateEntree[1];
  }

  data.confidence = computeStelliumConfidence(data, "RIO");
  return data;
}

function parseStelliumRioCouple(
  text: string,
  sections: ReturnType<typeof splitStelliumSections>
): ExtractedData {
  const header = getSection(sections, "header");
  const identite = getSection(sections, "identite");
  const coordonnees = getSection(sections, "coordonnees");
  const relations = getSection(sections, "relations");
  const professionnel = getSection(sections, "professionnel");
  const patrimoine = getSection(sections, "patrimoine");
  const revenusCharges = getSection(sections, "revenusCharges");
  const objectifs = getSection(sections, "objectifs");

  const { person1, person2 } = parseCoupleIdentite(identite, coordonnees, professionnel);

  const data: ExtractedData = {
    typeDocument: "RIO",
    raw: text,
    isCouple: true,
    ...person1,
    conjoint: person2,
  };

  const situation = extractFieldValue(relations, ["Situation matrimoniale"], ["Régime"]);
  if (situation) {
    data.situationFamiliale = normalizeSituationFamiliale(situation);
  }

  const regime = extractFieldValue(relations, ["Régime"], [
    "Nombre d'enfants",
    "Enfants",
    "Même foyer fiscal",
  ]);
  if (regime && regime !== "-") {
    data.regimeMatrimonial = regime.split(/\s+Même foyer fiscal/i)[0]?.trim();
  }

  const enfants = parseCoupleEnfants(relations);
  if (enfants) {
    data.enfants = enfants;
    data.nombreEnfants = enfants.length;
  }

  const enfantsCharge = relations.match(/Nombre d'enfants à charge\s*:?\s*(\d+)/i);
  if (enfantsCharge) {
    data.nombrePersonnesCharge = parseInt(enfantsCharge[1], 10);
  }

  if (patrimoine) {
    const { person1Total, person2Total } = parseCouplePatrimoine(patrimoine, data);
    if (data.conjoint && person2Total) {
      data.conjoint.patrimoineTotal = person2Total;
    }
    void person1Total;
  }

  if (revenusCharges && data.conjoint) {
    parseCoupleRevenusCharges(revenusCharges, data, data.conjoint);
  }

  if (objectifs) {
    const parsedObjectifs = parseObjectifs(objectifs);
    if (parsedObjectifs.length > 0) {
      data.objectifsPrincipaux = parsedObjectifs;
    }
  }

  const dateEntree = header.match(/Date d'entrée en relation\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (dateEntree) {
    data.dateEntreeRelation = dateEntree[1];
  }

  const dateDoc = text.match(
    /Recueil d'informations\s+-\s+.+?\s+-\s+(\d{2}\/\d{2}\/\d{4})/i
  );
  if (dateDoc) {
    data.dateDocument = dateDoc[1];
  }

  data.confidence = computeStelliumConfidence(data, "RIO");
  return data;
}
