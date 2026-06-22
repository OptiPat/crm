import {
  defaultSouscriptionDossierFields,
  type SouscriptionDossierFields,
} from "@/lib/souscription-cif/dossier-fields";
import { normalizeCapitalInvestAnnexeSouscriptions } from "@/lib/souscription-cif/capital-invest-annexe-souscriptions";
import { normalizeScpiAnnexeSouscriptions } from "@/lib/souscription-cif/scpi-annexe-souscriptions";
import {
  isCifProductTypeAvailable,
  parseSouscriptionCifProductType,
} from "@/lib/souscription-cif/cif-product-types";
import {
  normalizeOrigineFondsSelected,
  normalizeProvenanceFonds,
} from "@/lib/souscription-cif/annexes-scpi-origine-fonds";
export type SouscriptionCifProductType = "scpi" | "capital-investissement" | "g3f";

export type SouscriptionCifDocumentId =
  | "lettre-mission"
  | "convention-rto"
  | "rapport-mission"
  | "annexes-rapport";

const STORAGE_KEY = "crm_souscription_cif_draft";

/** Clé brouillon = client + type de souscription (annexes distinctes par produit). */
export function buildDossierStorageKey(
  contactId: number,
  productType: SouscriptionCifProductType
): string {
  return `${contactId}:${productType}`;
}

function migrateLegacyDossierKey(key: string): string {
  return key.includes(":") ? key : `${key}:scpi`;
}

export type SouscriptionCifDraft = {
  version: 1;
  productType: SouscriptionCifProductType;
  activeDocument: SouscriptionCifDocumentId;
  selectedContactId?: number;
  dossiersByContactId: Record<string, SouscriptionDossierFields>;
  savedAt: number;
};

function readStorage(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

function writeStorage(value: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, value);
}

function parseDossierFields(raw: unknown): SouscriptionDossierFields | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const defaults = defaultSouscriptionDossierFields();
  return {
    dateDoc: typeof o.dateDoc === "string" ? o.dateDoc : defaults.dateDoc,
    dateDer: typeof o.dateDer === "string" ? o.dateDer : "",
    dateRio: typeof o.dateRio === "string" ? o.dateRio : "",
    dateQpi: typeof o.dateQpi === "string" ? o.dateQpi : "",
    lieuNaissance: typeof o.lieuNaissance === "string" ? o.lieuNaissance : "",
    objectifsClient: typeof o.objectifsClient === "string" ? o.objectifsClient : "",
    rappelDemande: typeof o.rappelDemande === "string" ? o.rappelDemande : "",
    rappelSituationClient:
      typeof o.rappelSituationClient === "string" ? o.rappelSituationClient : "",
    analyseSituationClient:
      typeof o.analyseSituationClient === "string" ? o.analyseSituationClient : "",
    conseil: typeof o.conseil === "string" ? o.conseil : "",
    mesPreconisations: typeof o.mesPreconisations === "string" ? o.mesPreconisations : "",
    scpiAnnexeSouscriptions: normalizeScpiAnnexeSouscriptions(
      o.scpiAnnexeSouscriptions,
      o.scpiAnnexeProductKeys,
      o.mesPreconisations
    ),
    capitalInvestAnnexeSouscriptions: normalizeCapitalInvestAnnexeSouscriptions(
      o.capitalInvestAnnexeSouscriptions
    ),
    descriptionsCapitalInvest:
      typeof o.descriptionsCapitalInvest === "string" ? o.descriptionsCapitalInvest : "",
    quotePartPercueConsultantCifEur:
      typeof o.quotePartPercueConsultantCifEur === "string"
        ? o.quotePartPercueConsultantCifEur
        : "",
    provenanceFonds: normalizeProvenanceFonds(o.provenanceFonds),
    origineFondsSelected: normalizeOrigineFondsSelected(o.origineFondsSelected),
    origineFondsAutrePrecision:
      typeof o.origineFondsAutrePrecision === "string" ? o.origineFondsAutrePrecision : "",
  };
}

export function loadSouscriptionCifDraft(): SouscriptionCifDraft | null {
  try {
    const raw = readStorage();
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw) as Partial<SouscriptionCifDraft>;
    if (parsed.version !== 1 || typeof parsed.savedAt !== "number") return null;

    const dossiersByContactId: Record<string, SouscriptionDossierFields> = {};
    if (parsed.dossiersByContactId && typeof parsed.dossiersByContactId === "object") {
      for (const [key, value] of Object.entries(parsed.dossiersByContactId)) {
        const fields = parseDossierFields(value);
        if (fields) dossiersByContactId[migrateLegacyDossierKey(key)] = fields;
      }
    }

    let productType = parseSouscriptionCifProductType(parsed.productType);
    if (!isCifProductTypeAvailable(productType)) {
      productType = "scpi";
    }

    return {
      version: 1,
      productType,
      activeDocument:
        parsed.activeDocument === "convention-rto"
          ? "convention-rto"
          : parsed.activeDocument === "rapport-mission"
            ? "rapport-mission"
            : parsed.activeDocument === "annexes-rapport"
              ? "annexes-rapport"
              : "lettre-mission",
      selectedContactId:
        typeof parsed.selectedContactId === "number" ? parsed.selectedContactId : undefined,
      dossiersByContactId,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveSouscriptionCifDraft(
  draft: Omit<SouscriptionCifDraft, "version" | "savedAt">
): void {
  const payload: SouscriptionCifDraft = {
    version: 1,
    ...draft,
    savedAt: Date.now(),
  };
  writeStorage(JSON.stringify(payload));
}

export function getDossierForContact(
  dossiersByContactId: Record<string, SouscriptionDossierFields>,
  contactId: number,
  productType: SouscriptionCifProductType = "scpi"
): SouscriptionDossierFields {
  return (
    dossiersByContactId[buildDossierStorageKey(contactId, productType)] ??
    defaultSouscriptionDossierFields()
  );
}
