import {
  defaultSouscriptionDossierFields,
  type SouscriptionDossierFields,
} from "@/lib/souscription-cif/dossier-fields";
export type SouscriptionCifProductType = "scpi";

export type SouscriptionCifDocumentId =
  | "lettre-mission"
  | "rapport-mission"
  | "annexes-rapport";

const STORAGE_KEY = "crm_souscription_cif_draft";

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
  const o = raw as Partial<SouscriptionDossierFields>;
  return {
    dateDoc: typeof o.dateDoc === "string" ? o.dateDoc : defaultSouscriptionDossierFields().dateDoc,
    dateDer: typeof o.dateDer === "string" ? o.dateDer : "",
    dateRio: typeof o.dateRio === "string" ? o.dateRio : "",
    dateQpi: typeof o.dateQpi === "string" ? o.dateQpi : "",
    lieuNaissance: typeof o.lieuNaissance === "string" ? o.lieuNaissance : "",
    objectifsClient: typeof o.objectifsClient === "string" ? o.objectifsClient : "",
    rappelDemande: typeof o.rappelDemande === "string" ? o.rappelDemande : "",
    rappelSituationClient:
      typeof o.rappelSituationClient === "string" ? o.rappelSituationClient : "",
    conseil: typeof o.conseil === "string" ? o.conseil : "",
    mesPreconisations: typeof o.mesPreconisations === "string" ? o.mesPreconisations : "",
    scpiAnnexeProductKeys: Array.isArray(o.scpiAnnexeProductKeys)
      ? o.scpiAnnexeProductKeys.filter((k): k is string => typeof k === "string")
      : [],
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
        if (fields) dossiersByContactId[key] = fields;
      }
    }

    return {
      version: 1,
      productType: parsed.productType === "scpi" ? "scpi" : "scpi",
      activeDocument:
        parsed.activeDocument === "rapport-mission"
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
  contactId: number
): SouscriptionDossierFields {
  return dossiersByContactId[String(contactId)] ?? defaultSouscriptionDossierFields();
}
