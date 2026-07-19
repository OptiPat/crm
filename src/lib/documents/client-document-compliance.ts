import type { Document } from "@/lib/api/tauri-documents";
import { formatIsoDateFr } from "@/lib/documents/document-display";
import { classifyIdentityDocumentKindFromPath } from "@/lib/documents/extraction/identity-document-kind";

export type ClientDocumentTypeBadge = "rio" | "qpi" | "identite" | "passeport";

export type ClientDocumentComplianceAlertId =
  | "rio_missing"
  | "rio_stale"
  | "rio_date_missing"
  | "qpi_missing"
  | "qpi_stale"
  | "qpi_date_missing"
  | "identite_missing"
  | "identite_ambiguous"
  | "identite_expired"
  | "identite_date_missing"
  | "cni_expired"
  | "cni_date_missing"
  | "passport_expired"
  | "passport_date_missing";

export type ClientDocumentComplianceAlert = {
  id: ClientDocumentComplianceAlertId;
  label: string;
  severity: "warning" | "error";
};

export type ClientDocumentCompliance = {
  typeBadges: ClientDocumentTypeBadge[];
  alerts: ClientDocumentComplianceAlert[];
};

const CNI_EXPIRY_GRACE_YEARS = 5;

type IdentityBucket = "cni" | "passport" | "ambiguous";

function parseIsoDateOnly(iso?: string | null): Date | null {
  if (!iso?.trim()) return null;
  const ms = Date.parse(iso.trim());
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function hasDocumentDate(doc: Pick<Document, "date_document">): boolean {
  return Boolean(doc.date_document?.trim());
}

export function identityDocumentBucket(
  doc: Pick<Document, "type_document" | "nom_fichier">
): IdentityBucket | null {
  if (doc.type_document !== "IDENTITE") return null;
  const kind = classifyIdentityDocumentKindFromPath(doc.nom_fichier);
  if (kind === "passport") return "passport";
  if (kind === "cni") return "cni";
  return "ambiguous";
}

export function isPassportIdentityDocument(
  doc: Pick<Document, "type_document" | "nom_fichier">
): boolean {
  return identityDocumentBucket(doc) === "passport";
}

export function isExplicitCniIdentityDocument(
  doc: Pick<Document, "type_document" | "nom_fichier">
): boolean {
  return identityDocumentBucket(doc) === "cni";
}

export function isSignatureAtLeastOneYearOld(
  isoDate: string | null | undefined,
  referenceDate: Date = new Date()
): boolean {
  const signed = parseIsoDateOnly(isoDate);
  if (!signed) return false;
  const ref = startOfDay(referenceDate);
  const anniversary = new Date(signed);
  anniversary.setFullYear(anniversary.getFullYear() + 1);
  return startOfDay(anniversary).getTime() <= ref.getTime();
}

/** Passeport : périmé dès la date de fin de validité dépassée. */
export function isPassportExpired(
  expiryIso: string | null | undefined,
  referenceDate: Date = new Date()
): boolean {
  const expiry = parseIsoDateOnly(expiryIso);
  if (!expiry) return false;
  return expiry.getTime() < startOfDay(referenceDate).getTime();
}

/** CNI : tolérance de 5 ans après la date de validité imprimée. */
export function isCniExpired(
  expiryIso: string | null | undefined,
  referenceDate: Date = new Date(),
  graceYears = CNI_EXPIRY_GRACE_YEARS
): boolean {
  const expiry = parseIsoDateOnly(expiryIso);
  if (!expiry) return false;
  const ref = startOfDay(referenceDate);
  const graceEnd = new Date(expiry);
  graceEnd.setFullYear(graceEnd.getFullYear() + graceYears);
  return startOfDay(graceEnd).getTime() <= ref.getTime();
}

function latestDocumentMatching(
  documents: Document[],
  matches: (doc: Document) => boolean
): Document | null {
  let best: Document | null = null;
  let bestScore = -1;
  for (const doc of documents) {
    if (!matches(doc)) continue;
    const dateScore = doc.date_document
      ? Date.parse(doc.date_document)
      : Number.NaN;
    const score = !Number.isNaN(dateScore) ? dateScore : doc.created_at * 1000;
    if (score > bestScore) {
      bestScore = score;
      best = doc;
    }
  }
  return best;
}

function latestDocumentByType(
  documents: Document[],
  type: Document["type_document"]
): Document | null {
  return latestDocumentMatching(documents, (doc) => doc.type_document === type);
}

function staleSignatureLabel(prefix: string, isoDate?: string | null): string {
  const fr = isoDate ? formatIsoDateFr(isoDate) : null;
  return fr ? `${prefix} ≥ 1 an (signé le ${fr})` : `${prefix} ≥ 1 an`;
}

function identityExpiryLabel(prefix: string, isoDate?: string | null): string {
  const fr = isoDate ? formatIsoDateFr(isoDate) : null;
  return fr ? `${prefix} expiré (${fr})` : `${prefix} expiré`;
}

function pushSignatureCompliance(
  alerts: ClientDocumentComplianceAlert[],
  doc: Document | null,
  options: {
    missingId: ClientDocumentComplianceAlertId;
    missingLabel: string;
    dateMissingId: ClientDocumentComplianceAlertId;
    dateMissingLabel: string;
    staleId: ClientDocumentComplianceAlertId;
    stalePrefix: string;
    referenceDate: Date;
    checkMissing: boolean;
  }
): void {
  if (!doc) {
    if (options.checkMissing) {
      alerts.push({
        id: options.missingId,
        label: options.missingLabel,
        severity: "warning",
      });
    }
    return;
  }
  if (!hasDocumentDate(doc)) {
    alerts.push({
      id: options.dateMissingId,
      label: options.dateMissingLabel,
      severity: "warning",
    });
    return;
  }
  if (isSignatureAtLeastOneYearOld(doc.date_document, options.referenceDate)) {
    alerts.push({
      id: options.staleId,
      label: staleSignatureLabel(options.stalePrefix, doc.date_document),
      severity: "warning",
    });
  }
}

function pushIdentityExpiryCompliance(
  alerts: ClientDocumentComplianceAlert[],
  doc: Document | null,
  options: {
    bucket: IdentityBucket;
    expiredId: ClientDocumentComplianceAlertId;
    dateMissingId: ClientDocumentComplianceAlertId;
    dateMissingLabel: string;
    expiredLabelPrefix: string;
    referenceDate: Date;
  }
): void {
  if (!doc) return;
  if (!hasDocumentDate(doc)) {
    alerts.push({
      id: options.dateMissingId,
      label: options.dateMissingLabel,
      severity: "warning",
    });
    return;
  }
  const expired =
    options.bucket === "cni"
      ? isCniExpired(doc.date_document, options.referenceDate)
      : isPassportExpired(doc.date_document, options.referenceDate);
  if (expired) {
    alerts.push({
      id: options.expiredId,
      label: identityExpiryLabel(options.expiredLabelPrefix, doc.date_document),
      severity: "error",
    });
  }
}

export function computeClientDocumentCompliance(
  documents: Document[],
  options?: { checkMissing?: boolean; referenceDate?: Date }
): ClientDocumentCompliance {
  const checkMissing = options?.checkMissing ?? true;
  const referenceDate = options?.referenceDate ?? new Date();

  const typeBadges: ClientDocumentTypeBadge[] = [];
  const alerts: ClientDocumentComplianceAlert[] = [];

  const rio = latestDocumentByType(documents, "PATRIMOINE");
  const qpi = latestDocumentByType(documents, "QPI");
  const cni = latestDocumentMatching(
    documents,
    (doc) => identityDocumentBucket(doc) === "cni"
  );
  const passport = latestDocumentMatching(
    documents,
    (doc) => identityDocumentBucket(doc) === "passport"
  );
  const ambiguous = latestDocumentMatching(
    documents,
    (doc) => identityDocumentBucket(doc) === "ambiguous"
  );

  if (rio) typeBadges.push("rio");
  if (qpi) typeBadges.push("qpi");
  if (cni) typeBadges.push("identite");
  if (passport) typeBadges.push("passeport");

  pushSignatureCompliance(alerts, rio, {
    missingId: "rio_missing",
    missingLabel: "RIO manquant",
    dateMissingId: "rio_date_missing",
    dateMissingLabel: "RIO : date de signature manquante",
    staleId: "rio_stale",
    stalePrefix: "RIO",
    referenceDate,
    checkMissing,
  });

  pushSignatureCompliance(alerts, qpi, {
    missingId: "qpi_missing",
    missingLabel: "QPI manquant",
    dateMissingId: "qpi_date_missing",
    dateMissingLabel: "QPI : date de signature manquante",
    staleId: "qpi_stale",
    stalePrefix: "QPI",
    referenceDate,
    checkMissing,
  });

  const hasIdentity = Boolean(cni || passport || ambiguous);
  if (!hasIdentity && checkMissing) {
    alerts.push({
      id: "identite_missing",
      label: "Pièce d'identité manquante",
      severity: "warning",
    });
  } else {
    if (ambiguous) {
      alerts.push({
        id: "identite_ambiguous",
        label: "Identité : renommer le fichier (cni / passeport)",
        severity: "warning",
      });
      pushIdentityExpiryCompliance(alerts, ambiguous, {
        bucket: "passport",
        expiredId: "identite_expired",
        dateMissingId: "identite_date_missing",
        dateMissingLabel: "Identité : date de validité manquante",
        expiredLabelPrefix: "Identité",
        referenceDate,
      });
    }
    pushIdentityExpiryCompliance(alerts, cni, {
      bucket: "cni",
      expiredId: "cni_expired",
      dateMissingId: "cni_date_missing",
      dateMissingLabel: "CNI : date de validité manquante",
      expiredLabelPrefix: "CNI",
      referenceDate,
    });
    pushIdentityExpiryCompliance(alerts, passport, {
      bucket: "passport",
      expiredId: "passport_expired",
      dateMissingId: "passport_date_missing",
      dateMissingLabel: "Passeport : date de validité manquante",
      expiredLabelPrefix: "Passeport",
      referenceDate,
    });
  }

  return { typeBadges, alerts };
}
