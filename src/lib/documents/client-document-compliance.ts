import type { Document } from "@/lib/api/tauri-documents";
import { formatIsoDateFr } from "@/lib/documents/document-display";

export type ClientDocumentTypeBadge = "rio" | "qpi" | "identite";

export type ClientDocumentComplianceAlertId =
  | "rio_missing"
  | "rio_stale"
  | "qpi_missing"
  | "qpi_stale"
  | "identite_missing"
  | "identite_expired";

export type ClientDocumentComplianceAlert = {
  id: ClientDocumentComplianceAlertId;
  label: string;
  severity: "warning" | "error";
};

export type ClientDocumentCompliance = {
  typeBadges: ClientDocumentTypeBadge[];
  alerts: ClientDocumentComplianceAlert[];
};

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

export function isIdentityExpired(
  expiryIso: string | null | undefined,
  referenceDate: Date = new Date()
): boolean {
  const expiry = parseIsoDateOnly(expiryIso);
  if (!expiry) return false;
  return expiry.getTime() < startOfDay(referenceDate).getTime();
}

function latestDocumentByType(
  documents: Document[],
  type: Document["type_document"]
): Document | null {
  let best: Document | null = null;
  let bestScore = -1;
  for (const doc of documents) {
    if (doc.type_document !== type) continue;
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

function staleSignatureLabel(prefix: string, isoDate?: string | null): string {
  const fr = isoDate ? formatIsoDateFr(isoDate) : null;
  return fr ? `${prefix} ≥ 1 an (signé le ${fr})` : `${prefix} ≥ 1 an`;
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
  const identite = latestDocumentByType(documents, "IDENTITE");

  if (rio) typeBadges.push("rio");
  if (qpi) typeBadges.push("qpi");
  if (identite) typeBadges.push("identite");

  if (!checkMissing) {
    return { typeBadges, alerts };
  }

  if (!rio) {
    alerts.push({ id: "rio_missing", label: "RIO manquant", severity: "warning" });
  } else if (isSignatureAtLeastOneYearOld(rio.date_document, referenceDate)) {
    alerts.push({
      id: "rio_stale",
      label: staleSignatureLabel("RIO", rio.date_document),
      severity: "warning",
    });
  }

  if (!qpi) {
    alerts.push({ id: "qpi_missing", label: "QPI manquant", severity: "warning" });
  } else if (isSignatureAtLeastOneYearOld(qpi.date_document, referenceDate)) {
    alerts.push({
      id: "qpi_stale",
      label: staleSignatureLabel("QPI", qpi.date_document),
      severity: "warning",
    });
  }

  if (!identite) {
    alerts.push({
      id: "identite_missing",
      label: "Pièce d'identité manquante",
      severity: "warning",
    });
  } else if (isIdentityExpired(identite.date_document, referenceDate)) {
    const fr = identite.date_document
      ? formatIsoDateFr(identite.date_document)
      : null;
    alerts.push({
      id: "identite_expired",
      label: fr ? `CNI expirée (${fr})` : "CNI expirée",
      severity: "error",
    });
  }

  return { typeBadges, alerts };
}
