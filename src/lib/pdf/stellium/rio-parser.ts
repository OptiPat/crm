import type { BienImmobilier, ExtractedData } from "../types";
import { extractAmountAfterLabel, parseStelliumAmount, AMOUNT_CAPTURE } from "./amounts";
import { computeStelliumConfidence } from "./confidence";
import { normalizeStelliumText, sanitizeStelliumFieldValue } from "./normalize";
import {
  detectCoupleRio,
  normalizeSituationFamiliale,
  parseCoupleEnfants,
  parseCoupleIdentite,
  parseCouplePatrimoine,
  parseCoupleRevenusCharges,
} from "./rio-couple";
import { enrichBiensImmobiliersWithCredits } from "./immo-credits";
import {
  isImmoActifCategory,
  registerFinancialActifLine,
  hasEpargneBancaireDetail,
} from "./financial-contracts";
import { parsePassifsEcheanceAnnuelle } from "./passifs-charges";
import { applyFiscaliteToExtractedData, parseStelliumFiscalite } from "./fiscalite";
import { extractFieldValue, getSection, splitStelliumSections } from "./sections";
import { extractStelliumSignatureDate } from "./signature-date";

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

/** Date du PDF (pied de page « Recueil d'informations - … - JJ/MM/AAAA »). */
function extractRioDocumentDateFromFooter(text: string): string | undefined {
  const match = text.match(
    /Recueil d'informations\s+-\s+.+?\s+-\s+(\d{2}\/\d{2}\/\d{4})/i
  );
  return match?.[1];
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
  const seen = new Set<string>();

  const pushLine = (category: string, nom: string, montant: number) => {
    const key = `${category.toLowerCase()}|${nom.toLowerCase()}|${montant}`;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push({ category, nom, montant });
  };

  const patternWithDash =
    /(Résidence principale|Résidence secondaire|Assurance vie|Compte courant|Livret A|LDD|LDDS|PEL|CEL|PER|PERP|PEA|Compte titres|SCPI|Classique|Pinel|LMNP|LMP|Denormandie|Malraux)\s*[-–—]\s*(.+?)\s+([\d\s,]+)\s*€/gi;

  let match: RegExpExecArray | null;
  while ((match = patternWithDash.exec(actifsBlock)) !== null) {
    const montant = parseStelliumAmount(match[3]);
    if (!montant) continue;
    pushLine(match[1].trim(), match[2].trim(), montant);
  }

  const bankPattern =
    /(Compte courant|Livret A|LDD|LDDS|PEL|CEL)\s*(?:[-–—]\s*(.+?)\s+)?([\d\s,]+)\s*€/gi;
  while ((match = bankPattern.exec(actifsBlock)) !== null) {
    if (match[2]?.trim()) continue;
    const montant = parseStelliumAmount(match[3]);
    if (!montant) continue;
    const category = match[1].trim();
    pushLine(category, category, montant);
  }

  return lines;
}

function applySoloEpargneBancaireSubtotalFallback(
  patrimoineSection: string,
  data: ExtractedData
): void {
  if (hasEpargneBancaireDetail(data)) return;
  const subtotal = extractAmountAfterLabel(
    patrimoineSection,
    /\bÉpargne bancaire\s+([\d\s,]+)\s*€/i
  );
  if (subtotal && subtotal > 0) {
    registerFinancialActifLine(data, "Compte courant", "Épargne bancaire", subtotal);
  }
}

function parsePatrimoine(patrimoineSection: string, data: ExtractedData): void {
  const passifsCharges = parsePassifsEcheanceAnnuelle(patrimoineSection);
  if (passifsCharges > 0) {
    data.chargesEmpruntsPassifs = passifsCharges;
  }

  const actifLines = parseActifLines(patrimoineSection);
  const biens: BienImmobilier[] = [];

  for (const line of actifLines) {
    if (isImmoActifCategory(line.category)) {
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

    registerFinancialActifLine(data, line.category, line.nom, line.montant);
  }

  applySoloEpargneBancaireSubtotalFallback(patrimoineSection, data);

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

/** Colonne « Attribué à » : prénom + NOM, éventuellement couple (A & B). */
const RIO_OBJECTIF_ASSIGNEE =
  /(?:[A-ZÀ-Ü][A-Za-zÀ-üéèê'ô-]+\s+[A-ZÀ-Ü][A-Za-zÀ-Ü'\s-]+(?:\s*&\s*[A-ZÀ-Ü][A-Za-zÀ-üéèê'ô-]+\s+[A-ZÀ-Ü][A-ZÀ-Ü'\s-]+)*)/;

const RIO_OBJECTIFS_TABLE_HEADER =
  /Objectif\(s\)\s+Attribu[eé]\s+[àa]\s+Priorit[eé]\s+Horizon/i;

/** Fin de ligne tableau : assignation + priorité + horizon. */
const RIO_OBJECTIF_ROW_SUFFIX = new RegExp(
  `(${RIO_OBJECTIF_ASSIGNEE.source})\\s+(\\d+)\\s+(?:-(?:\\s|$)|\\d+\\s+\\w+)`,
  "g"
);

/** Début probable d'une nouvelle ligne objectif dans l'écart inter-lignes PDF. */
const RIO_OBJECTIF_LABEL_START =
  /(?:Se constituer|Disposer de|Accompagner vos|Préparer votre|Optimiser la|Compléter vos|Transmettre votre|Diversifier votre|[A-ZÀ-Ü][a-zà-üéèê'ô-]+ (?:la |le |les |l'|vos |votre |un |une |des |du |de |d'|en |à |sur |pour |par ))/;

const RIO_OBJECTIF_ROW_START = new RegExp(`\\s+(?=${RIO_OBJECTIF_LABEL_START.source})`);

function normalizeRioObjectifLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isRioObjectifLabelNoise(label: string): boolean {
  return (
    !label ||
    /^Objectif\(s\)/i.test(label) ||
    /^Epargne de pr[eé]caution/i.test(label) ||
    /^Attribu[eé]/i.test(label)
  );
}

/** Sépare suite de cellule objectif (coupure PDF) et début de la ligne suivante. */
function splitRioObjectifGap(gap: string): {
  continuation?: string;
  nextRowPrefix?: string;
} {
  const trimmed = gap.trim();
  if (!trimmed) return {};

  const nextRowAtStart = new RegExp(`^${RIO_OBJECTIF_LABEL_START.source}`);
  if (nextRowAtStart.test(trimmed)) {
    return { nextRowPrefix: trimmed };
  }

  const match = trimmed.match(RIO_OBJECTIF_ROW_START);
  if (!match || match.index === undefined || match.index === 0) {
    return { continuation: trimmed };
  }

  return {
    continuation: trimmed.slice(0, match.index).trim() || undefined,
    nextRowPrefix: trimmed.slice(match.index).trim() || undefined,
  };
}

interface RioObjectifRowAnchor {
  assigneeStart: number;
  end: number;
}

function findRioObjectifRowAnchors(body: string): RioObjectifRowAnchor[] {
  const anchors: RioObjectifRowAnchor[] = [];
  RIO_OBJECTIF_ROW_SUFFIX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RIO_OBJECTIF_ROW_SUFFIX.exec(body)) !== null) {
    anchors.push({
      assigneeStart: match.index,
      end: match.index + match[0].length,
    });
  }
  return anchors;
}

function parseRioObjectifsTableBody(tableBody: string): string[] {
  const stopIdx = tableBody.search(/\bEpargne de pr[eé]caution\b/i);
  const body = stopIdx >= 0 ? tableBody.slice(0, stopIdx) : tableBody;
  const anchors = findRioObjectifRowAnchors(body);
  if (anchors.length === 0) return [];

  const objectifs: string[] = [];
  let pos = 0;
  let pendingPrefix = "";

  for (let i = 0; i < anchors.length; i++) {
    const { assigneeStart, end } = anchors[i];
    let label = normalizeRioObjectifLabel(
      `${pendingPrefix}${body.slice(pos, assigneeStart)}`
    );
    pendingPrefix = "";

    if (i + 1 < anchors.length) {
      const gap = body.slice(end, anchors[i + 1].assigneeStart);
      const { continuation, nextRowPrefix } = splitRioObjectifGap(gap);
      if (continuation) {
        label = normalizeRioObjectifLabel(`${label} ${continuation}`);
      }
      pendingPrefix = nextRowPrefix ? `${nextRowPrefix} ` : "";
      pos = anchors[i + 1].assigneeStart;
    } else {
      pos = end;
    }

    if (!isRioObjectifLabelNoise(label)) {
      objectifs.push(label);
    }
  }

  return objectifs;
}

/** Repère le bloc table Objectifs dans tout le texte (coupure de page PDF). */
export function findRioObjectifsTableBlock(fullText: string): string | undefined {
  const match = fullText.match(
    new RegExp(
      `(${RIO_OBJECTIFS_TABLE_HEADER.source}[\\s\\S]*?)(?=Epargne de pr[eé]caution|MENTIONS RESERVEES|Effort d['']épargne mensuel|$)`,
      "i"
    )
  );
  return match?.[1]?.trim();
}

/** Extrait les libellés objectifs (table Objectifs du RIO, indépendant du QPI). */
export function parseRioObjectifsSection(objectifsSection: string): string[] {
  const tableBody = objectifsSection.replace(/^[\s\S]*?Horizon\s+/i, "");
  return parseRioObjectifsTableBody(tableBody);
}

function resolveRioObjectifsPrincipaux(
  fullText: string,
  objectifsSection?: string
): string[] {
  if (objectifsSection) {
    const fromSection = parseRioObjectifsSection(objectifsSection);
    if (fromSection.length > 0) return fromSection;
  }

  const tableBlock = findRioObjectifsTableBlock(fullText);
  if (tableBlock) {
    return parseRioObjectifsSection(tableBlock);
  }

  return [];
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
  const fiscalite = getSection(sections, "fiscalite");

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
    data.regimeMatrimonial = sanitizeStelliumFieldValue(
      regime.split(/\s+Même foyer fiscal/i)[0]
    );
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
    enrichBiensImmobiliersWithCredits(text, data.biensImmobiliers);
  }

  if (revenusCharges) {
    parseRevenusCharges(revenusCharges, data);
  }

  const parsedObjectifs = resolveRioObjectifsPrincipaux(text, objectifs);
  if (parsedObjectifs.length > 0) {
    data.objectifsPrincipaux = parsedObjectifs;
  }

  if (fiscalite) {
    applyFiscaliteToExtractedData(data, parseStelliumFiscalite(fiscalite));
  }

  const dateEntree = header.match(
    /Date d'entrée en relation\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i
  );
  if (dateEntree) {
    data.dateEntreeRelation = dateEntree[1];
  }

  const dateDocument = extractRioDocumentDateFromFooter(text);
  if (dateDocument) {
    data.dateDocument = dateDocument;
  }

  const dateSignature = extractStelliumSignatureDate(text, "RIO");
  if (dateSignature) {
    data.dateSignature = dateSignature;
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
  const fiscalite = getSection(sections, "fiscalite");

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
    data.regimeMatrimonial = sanitizeStelliumFieldValue(
      regime.split(/\s+Même foyer fiscal/i)[0]
    );
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
    enrichBiensImmobiliersWithCredits(text, data.biensImmobiliers);
    if (data.conjoint && person2Total) {
      data.conjoint.patrimoineTotal = person2Total;
    }
    void person1Total;
  }

  if (revenusCharges && data.conjoint) {
    parseCoupleRevenusCharges(revenusCharges, data, data.conjoint);
  }

  const parsedObjectifs = resolveRioObjectifsPrincipaux(text, objectifs);
  if (parsedObjectifs.length > 0) {
    data.objectifsPrincipaux = parsedObjectifs;
  }

  if (fiscalite) {
    applyFiscaliteToExtractedData(data, parseStelliumFiscalite(fiscalite));
  }

  const dateEntree = header.match(/Date d'entrée en relation\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (dateEntree) {
    data.dateEntreeRelation = dateEntree[1];
  }

  const dateDocument = extractRioDocumentDateFromFooter(text);
  if (dateDocument) {
    data.dateDocument = dateDocument;
  }

  const dateSignature = extractStelliumSignatureDate(text, "RIO");
  if (dateSignature) {
    data.dateSignature = dateSignature;
  }

  data.confidence = computeStelliumConfidence(data, "RIO");
  return data;
}
