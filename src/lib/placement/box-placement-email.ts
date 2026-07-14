/** Parse des mails Stellium Box Placement (no-reply@stellium.fr). */

export type BoxPlacementEmailKind = "CONFORME" | "NON_CONFORME";

export type ParsedBoxPlacementEmail = {
  kind: BoxPlacementEmailKind;
  contactNom: string;
  contactPrenom: string;
  stelliumLabel: string;
  productLabel: string;
  operationLine: string;
};

const CONFORME_SUBJECT_PREFIX = "box placement - envoi dossier d'opération - ";
const NON_CONFORME_SUBJECT_PREFIX = "box placement - non-conformité à traiter - ";

const CONFORME_BODY_MARKERS = [
  "opération suivante :",
  "operation suivante :",
  "confirmons de l'envoi au partenaire",
];

const NON_CONFORME_BODY_MARKERS = [
  "non-conformité pour l'opération suivante :",
  "non-conformite pour l'operation suivante :",
];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\u2019/g, "'")
    .toLowerCase()
    .trim();
}

/** Parse « NOM Prénom » ou « NOM DE FAMILLE Jean-Pierre ». */
export function parseBoxPlacementContactName(
  full: string
): { nom: string; prenom: string } | null {
  const trimmed = full.trim();
  if (!trimmed || trimmed === "-") return null;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.length === 2) {
    return { nom: parts[0]!, prenom: parts[1]! };
  }
  return {
    nom: parts.slice(0, -1).join(" "),
    prenom: parts[parts.length - 1]!,
  };
}

export function mapStelliumLabelToOperationType(label: string): string {
  const lower = normalizeText(label);
  if (lower.includes("arbitrage")) return "ARBITRAGE";
  if (lower.includes("versement")) return "VERSEMENT";
  if (lower.includes("reinvestissement")) return "REINVESTISSEMENT";
  if (lower.includes("souscription")) return "SOUSCRIPTION";
  return "AUTRE";
}

function extractLineAfterMarker(body: string, markers: string[]): string | null {
  const normalized = normalizeText(body);
  for (const marker of markers) {
    const idx = normalized.indexOf(marker);
    if (idx < 0) continue;
    const rawSlice = body.slice(idx + marker.length);
    const line = rawSlice.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (line) return line;
  }
  return null;
}

export function parseBoxPlacementOperationLine(
  line: string
): { stelliumLabel: string; productLabel: string; contactFull: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(" - ").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const contactFull = parts[parts.length - 1]!;
  const stelliumLabel = parts[0]!;
  const productLabel = parts.slice(1, -1).join(" - ");
  return { stelliumLabel, productLabel, contactFull };
}

export function detectBoxPlacementKind(
  subject: string,
  body: string
): BoxPlacementEmailKind | null {
  const subjectNorm = normalizeText(subject);
  if (subjectNorm.startsWith(NON_CONFORME_SUBJECT_PREFIX)) return "NON_CONFORME";
  if (subjectNorm.startsWith(CONFORME_SUBJECT_PREFIX)) return "CONFORME";

  const bodyNorm = normalizeText(body);
  if (NON_CONFORME_BODY_MARKERS.some((m) => bodyNorm.includes(m))) {
    return "NON_CONFORME";
  }
  if (CONFORME_BODY_MARKERS.some((m) => bodyNorm.includes(m))) {
    return "CONFORME";
  }
  return null;
}

export function parseContactFromBoxPlacementSubject(
  subject: string,
  kind: BoxPlacementEmailKind
): { nom: string; prenom: string } | null {
  const subjectNorm = normalizeText(subject);
  const expectedTail =
    kind === "CONFORME"
      ? "envoi dossier d'operation - "
      : "non-conformite a traiter - ";
  if (!subjectNorm.includes(expectedTail)) return null;
  const parts = subject.split(" - ").map((p) => p.trim());
  if (parts.length < 3) return null;
  return parseBoxPlacementContactName(parts[parts.length - 1]!);
}

export function parseBoxPlacementEmail(
  subject: string,
  body: string
): ParsedBoxPlacementEmail | null {
  const kind = detectBoxPlacementKind(subject, body);
  if (!kind) return null;

  const markers = kind === "CONFORME" ? CONFORME_BODY_MARKERS : NON_CONFORME_BODY_MARKERS;
  const operationLine = extractLineAfterMarker(body, markers);
  if (!operationLine) return null;

  const parsedLine = parseBoxPlacementOperationLine(operationLine);
  if (!parsedLine) return null;

  const fromLine = parseBoxPlacementContactName(parsedLine.contactFull);
  const fromSubject = parseContactFromBoxPlacementSubject(subject, kind);
  const contact = fromLine ?? fromSubject;
  if (!contact) return null;

  return {
    kind,
    contactNom: contact.nom,
    contactPrenom: contact.prenom,
    stelliumLabel: parsedLine.stelliumLabel,
    productLabel: parsedLine.productLabel,
    operationLine,
  };
}
