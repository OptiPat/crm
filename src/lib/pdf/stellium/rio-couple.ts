import type { BienImmobilier, ExtractedData } from "../types";
import { parseStelliumAmount } from "./amounts";
import { escapeRegex } from "./sections";

export interface CoupleInvestisseurs {
  person1Label: string;
  person2Label: string;
  person1: { prenom: string; nom: string };
  person2: { prenom: string; nom: string };
}

const ACTIF_CATEGORIES =
  "Résidence principale|Résidence secondaire|Assurance vie|Compte courant|Livret A|LDD|LDDS|PEL|CEL|PER|PERP|PEA|Compte titres|SCPI|Classique|Pinel|LMNP|LMP|Denormandie|Malraux";

export function detectCoupleRio(header: string): CoupleInvestisseurs | null {
  const match = header.match(
    /Investisseur\s*:\s*(.+?)\s+et\s+(.+?)\s+Date d'entrée en relation/i
  );
  if (!match) return null;

  const person1Label = match[1].trim();
  const person2Label = match[2].trim();
  const person1 = splitLabelToNomPrenom(person1Label);
  const person2 = splitLabelToNomPrenom(person2Label);
  if (!person1 || !person2) return null;

  return { person1Label, person2Label, person1, person2 };
}

function splitLabelToNomPrenom(label: string): { prenom: string; nom: string } | null {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    prenom: parts[parts.length - 1],
    nom: parts.slice(0, -1).join(" "),
  };
}

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

function extractPair(
  block: string,
  label: string,
  stopLabels: string[]
): [string | undefined, string | undefined] {
  const stopPattern =
    stopLabels.length > 0 ? stopLabels.map((s) => escapeRegex(s)).join("|") : "$";
  const pattern = new RegExp(
    `${escapeRegex(label)}\\s*:?\\s+([\\s\\S]+?)(?=${stopPattern})`,
    "i"
  );
  const match = block.match(pattern);
  if (!match?.[1]) return [undefined, undefined];

  const raw = match[1].trim();
  const parts = raw.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return [parts[0], parts[1]];
  }
  return [raw, undefined];
}

function parseNaissance(value: string | undefined): {
  dateNaissance?: string;
  lieuNaissance?: string;
} {
  if (!value) return {};
  const match = value.match(/(\d{2}\/\d{2}\/\d{4})\s+à\s+(.+)/i);
  if (!match) return {};
  return {
    dateNaissance: match[1],
    lieuNaissance: match[2].replace(/\s+-\s+France$/i, "").trim(),
  };
}

export function parseCoupleIdentite(
  identite: string,
  coordonnees: string,
  professionnel: string
): {
  person1: Pick<
    ExtractedData,
    | "civilite"
    | "nom"
    | "prenom"
    | "nomNaissance"
    | "dateNaissance"
    | "lieuNaissance"
    | "nationalite"
    | "email"
    | "telephone"
    | "telephoneMobile"
    | "adresse"
    | "codePostal"
    | "ville"
    | "pays"
    | "profession"
    | "employeur"
  >;
  person2: NonNullable<ExtractedData["conjoint"]>;
} {
  const [civ1, civ2] = extractPair(identite, "Civilité", [
    "Nom d'usage / prénom",
    "Nom / prénom",
  ]);
  const [nomPrenom1, nomPrenom2] = extractPair(identite, "Nom d'usage / prénom", [
    "Nom de naissance",
  ]);
  if (!nomPrenom1 && !nomPrenom2) {
    const fallback = extractPair(identite, "Nom / prénom", ["Nom de naissance"]);
    if (fallback[0]) {
      const split1 = splitNomPrenom(fallback[0]);
      const split2 = splitNomPrenom(fallback[1] ?? "");
      return buildCoupleIdentity(
        civ1,
        civ2,
        split1.nom && split1.prenom ? `${split1.nom} ${split1.prenom}` : undefined,
        split2.nom && split2.prenom ? `${split2.nom} ${split2.prenom}` : undefined,
        identite,
        coordonnees,
        professionnel
      );
    }
  }

  return buildCoupleIdentity(
    civ1,
    civ2,
    nomPrenom1,
    nomPrenom2,
    identite,
    coordonnees,
    professionnel
  );
}

function buildCoupleIdentity(
  civ1: string | undefined,
  civ2: string | undefined,
  nomPrenom1: string | undefined,
  nomPrenom2: string | undefined,
  identite: string,
  coordonnees: string,
  professionnel: string
): {
  person1: Pick<
    ExtractedData,
    | "civilite"
    | "nom"
    | "prenom"
    | "nomNaissance"
    | "dateNaissance"
    | "lieuNaissance"
    | "nationalite"
    | "email"
    | "telephone"
    | "telephoneMobile"
    | "adresse"
    | "codePostal"
    | "ville"
    | "pays"
    | "profession"
    | "employeur"
  >;
  person2: NonNullable<ExtractedData["conjoint"]>;
} {
  const split1 = nomPrenom1 ? splitNomPrenom(nomPrenom1) : {};
  const split2 = nomPrenom2 ? splitNomPrenom(nomPrenom2) : {};

  const [nomNaissance1, nomNaissance2] = extractPair(identite, "Nom de naissance", ["Né(e) le"]);
  const [naissance1, naissance2] = extractPair(identite, "Né(e) le", ["Nationalité"]);
  const [nationalite1, nationalite2] = extractPair(identite, "Nationalité", [
    "Mesure de protection",
    "Coordonnées",
  ]);

  const naissanceParsed1 = parseNaissance(naissance1);
  const naissanceParsed2 = parseNaissance(naissance2);

  const [email1, email2] = extractPair(coordonnees, "Adresse e-mail", [
    "E-mail",
    "Téléphone mobile",
  ]);
  const [tel1, tel2] = extractPair(coordonnees, "Téléphone mobile", [
    "Autre téléphone",
    "Adresse postale",
  ]);

  const adresseMatch = coordonnees.match(
    /Adresse postale\s*:?\s+(.+?)\s+(\d{5})\s+([A-Za-zÀ-ÿ\s'-]+)\s*-\s+France/i
  );

  const [profession1, profession2] = extractPair(
    professionnel,
    "Profession (ou dernière profession)",
    ["Nom de la société", "Origine des revenus"]
  );
  const [employeur1, employeur2] = extractPair(professionnel, "Nom de la société", [
    "Employeur",
    "Origine des revenus",
    "Réglementaire",
  ]);

  const person1 = {
    civilite: mapCivilite(civ1),
    nom: split1.nom,
    prenom: split1.prenom,
    nomNaissance: nomNaissance1,
    dateNaissance: naissanceParsed1.dateNaissance,
    lieuNaissance: naissanceParsed1.lieuNaissance,
    nationalite: nationalite1,
    email: email1,
    telephone: tel1,
    telephoneMobile: tel1,
    adresse: adresseMatch?.[1]?.trim(),
    codePostal: adresseMatch?.[2],
    ville: adresseMatch?.[3]?.trim(),
    pays: "France",
    profession: profession1,
    employeur: employeur1 && employeur1 !== "-" ? employeur1 : undefined,
  };

  const person2: NonNullable<ExtractedData["conjoint"]> = {
    civilite: mapCivilite(civ2),
    nom: split2.nom,
    prenom: split2.prenom,
    nomNaissance: nomNaissance2,
    dateNaissance: naissanceParsed2.dateNaissance,
    lieuNaissance: naissanceParsed2.lieuNaissance,
    nationalite: nationalite2,
    email: email2,
    telephone: tel2,
    profession: profession2,
    employeur: employeur2 && employeur2 !== "-" ? employeur2 : undefined,
  };

  return { person1, person2 };
}

export function normalizeSituationFamiliale(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower.includes("célibataire") || lower.includes("celibataire")) return "CELIBATAIRE";
  if (lower.includes("marié") || lower.includes("marie")) return "MARIE";
  if (lower.includes("pacs")) return "PACSE";
  if (lower.includes("union") && lower.includes("libre")) return "UNION_LIBRE";
  if (lower.includes("divorc")) return "DIVORCE";
  if (lower.includes("veuf") || lower.includes("veuve")) return "VEUF";
  return raw.toUpperCase();
}

export function parseCoupleEnfants(relationsSection: string): ExtractedData["enfants"] {
  const enfants: NonNullable<ExtractedData["enfants"]> = [];
  const pattern =
    /\b([A-ZÀ-Ü][a-zà-üéèê'-]+)\s+([A-ZÀ-Ü][A-ZÀ-Ü'-]+)\s+(\d{2}\/\d{2}\/\d{4})\s+Commun\b/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(relationsSection)) !== null) {
    enfants.push({
      prenom: match[1].trim(),
      nom: match[2].trim(),
      dateNaissance: match[3],
    });
  }

  return enfants.length > 0 ? enfants : undefined;
}

function parseTrailingAmounts(tail: string): (number | undefined)[] {
  const amounts: (number | undefined)[] = [];
  const pattern = /(-|[\d\s,]+)\s*€/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tail)) !== null) {
    amounts.push(
      match[1].trim() === "-" ? undefined : parseStelliumAmount(match[1])
    );
  }
  return amounts;
}

function pickFoyerAmount(
  amounts: (number | undefined)[],
  hasCommunColumn: boolean,
  useLastColumn = false
): number | undefined {
  if (amounts.length === 0) return undefined;
  if (useLastColumn) {
    return amounts[amounts.length - 1];
  }
  if (hasCommunColumn && amounts.length >= 2) {
    const commun = amounts[amounts.length - 2];
    const total = amounts[amounts.length - 1];
    if (commun && commun > 0) return commun;
    return total;
  }
  return amounts[amounts.length - 1];
}

function pickPersonAmounts(
  amounts: (number | undefined)[],
  hasCommunColumn: boolean
): [number | undefined, number | undefined] {
  if (amounts.length === 0) return [undefined, undefined];
  if (hasCommunColumn && amounts.length >= 4) {
    return [amounts[0], amounts[1]];
  }
  if (amounts.length >= 3) {
    return [amounts[0], amounts[1]];
  }
  return [amounts[0], undefined];
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
  if (lower.includes("malraux")) return "IMMOBILIER";
  if (lower.includes("classique") || lower.includes("locatif") || lower.includes("rapport")) {
    return "LOCATIF";
  }
  return "IMMOBILIER";
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

export function parseCouplePatrimoine(
  patrimoineSection: string,
  data: ExtractedData
): { person1Total?: number; person2Total?: number } {
  const hasCommunColumn = /\bCommun\b/.test(patrimoineSection);
  const actifsBlock = patrimoineSection.split(/\bPassifs\b/i)[0] ?? patrimoineSection;
  const biens: BienImmobilier[] = [];

  const linePattern = new RegExp(
    `(${ACTIF_CATEGORIES})\\s*[-–—]\\s*(.+?)\\s+((?:(?:-|[\\d\\s,]+)\\s*€\\s*)+)`,
    "gi"
  );

  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(actifsBlock)) !== null) {
    const category = match[1].trim();
    const nom = match[2].trim();
    const amounts = parseTrailingAmounts(match[3]);
    const montant = pickFoyerAmount(amounts, hasCommunColumn, true);
    if (!montant || montant <= 0) continue;

    const lower = category.toLowerCase();
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
      const type = mapImmoType(category);
      const label = `${category} - ${nom}`;
      biens.push({
        id: `immo-${slugify(label)}`,
        type,
        nom,
        valeur: montant,
      });

      if (type === "RESIDENCE_PRINCIPALE") {
        data.residencePrincipale = { valeur: montant };
      } else if (type === "RESIDENCE_SECONDAIRE") {
        data.residenceSecondaire = { valeur: montant };
      } else if (type === "LOCATIF" || type === "PINEL" || type === "LMNP") {
        data.immobilierLocatif = {
          valeur: (data.immobilierLocatif?.valeur ?? 0) + montant,
        };
      }
      continue;
    }

    applyFinancialProduct(data, category, montant);
  }

  if (biens.length > 0) {
    data.biensImmobiliers = biens;
  }

  const totalLine = actifsBlock.match(
    /TOTAL\s+((?:(?:-|[\d\s,]+)\s*€\s*)+)/i
  );
  if (totalLine) {
    const totals = parseTrailingAmounts(totalLine[1]);
    data.patrimoineTotal = pickFoyerAmount(totals, hasCommunColumn, true);
    const [p1, p2] = pickPersonAmounts(totals, hasCommunColumn);
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
        : undefined;
    return { person1Total: p1, person2Total: p2 };
  }

  return {};
}

export function parseCoupleRevenusCharges(
  section: string,
  data: ExtractedData,
  conjoint: NonNullable<ExtractedData["conjoint"]>
): void {
  const hasCommunColumn = /\bCommun\b/.test(section);

  const revenusBlock = section.split(/\bCharges\b/i)[0] ?? section;
  const revenusTotalLine = revenusBlock.match(
    /TOTAL\s+((?:(?:-|[\d\s,]+)\s*€\s*)+)/i
  );
  if (revenusTotalLine) {
    const amounts = parseTrailingAmounts(revenusTotalLine[1]);
    data.revenusTotal = pickFoyerAmount(amounts, hasCommunColumn, true);
    const [r1, r2] = pickPersonAmounts(amounts, hasCommunColumn);
    if (r1) data.revenusSalaires = r1;
    if (r2) conjoint.revenusTotal = r2;

    if (hasCommunColumn && amounts.length >= 4) {
      const fonciers = amounts[amounts.length - 2];
      if (fonciers && fonciers > 0) {
        data.revenusFonciers = fonciers;
      }
    }
  }

  const chargesIdx = section.search(/\bCharges\s+Désignation/i);
  const chargesBlock = chargesIdx >= 0 ? section.slice(chargesIdx) : "";
  const chargesTotalLine = chargesBlock.match(
    /TOTAL\s+((?:(?:-|[\d\s,]+)\s*€\s*)+)/i
  );
  if (chargesTotalLine) {
    const amounts = parseTrailingAmounts(chargesTotalLine[1]);
    data.chargesTotal = pickFoyerAmount(amounts, hasCommunColumn, true);
    const [c1, c2] = pickPersonAmounts(amounts, hasCommunColumn);
    if (c2) conjoint.chargesTotal = c2;
    if (c1 && !c2) {
      // charges souvent sur une seule personne
    }
  }
}
