import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import { CifDocumentPrintPortal } from "@/components/souscription-cif/CifDocumentPrintPortal";
import { CifPagedDocumentPreview } from "@/components/souscription-cif/CifPagedDocumentPreview";
import { ScpiLettreMissionPreview } from "@/components/souscription-cif/ScpiLettreMissionPreview";
import { SouscriptionCifDossierForm } from "@/components/souscription-cif/SouscriptionCifDossierForm";
import { useCifPrintExport } from "@/hooks/use-cif-print-export";
import { buildCifPrintBundle } from "@/lib/souscription-cif/cif-print-export";
import { getClientCategorieLabel } from "@/lib/contacts/contact-list-labels";
import { getAllContacts, getContactById, getContactsByFoyer, type Contact } from "@/lib/api/tauri-contacts";
import { getDocumentsByContact, type Document } from "@/lib/api/tauri-documents";
import { getInvestissementsByContact, type Investissement } from "@/lib/api/tauri-investissements";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeDocumentsChanged } from "@/lib/documents/document-events";
import { loadFoyerInvestissements } from "@/lib/foyers/foyer-utils";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { buildDefaultConseil } from "@/lib/souscription-cif/build-default-annexes-fields";
import { buildMesPreconisationsFromSouscriptions } from "@/lib/souscription-cif/scpi-annexe-souscriptions";
import { buildDefaultObjectifsClient } from "@/lib/souscription-cif/build-default-objectifs-client";
import { buildDefaultRappelDemande } from "@/lib/souscription-cif/build-default-rappel-demande";
import {
  buildDefaultRappelSituation,
  buildRappelSituationSupplement,
  syncRappelSituationFromContact,
} from "@/lib/souscription-cif/build-rappel-situation-default";
import {
  getReadyContactSelection,
  lieuNaissanceFromContact,
} from "@/lib/souscription-cif/sync-dossier-contact-fields";
import { dossierDatePatchFromDocuments } from "@/lib/souscription-cif/sync-dossier-document-dates";
import { buildSouscriptionVariables } from "@/lib/souscription-cif/build-variables";
import {
  defaultSouscriptionDossierFields,
  type SouscriptionDossierFields,
} from "@/lib/souscription-cif/dossier-fields";
import { getFoyerById } from "@/lib/api/tauri-foyers";
import { buildScpiLettreMissionPreview } from "@/lib/souscription-cif/render-template";
import { buildAnnexesRapportPreview } from "@/lib/souscription-cif/render-annexes-rapport";
import { buildConventionRtoPreview } from "@/lib/souscription-cif/render-convention-rto";
import { buildRapportMissionPreview } from "@/lib/souscription-cif/render-rapport-mission";
import {
  ANNEXES_RAPPORT_DOCUMENT_TITLE,
  RTO_DOCUMENT_TITLE,
} from "@/lib/souscription-cif/cif-documents";
import {
  classifyCifVariableFocus,
  focusCifDossierFieldElement,
  getCifDossierFieldFocus,
} from "@/lib/souscription-cif/cif-dossier-field-focus";
import { SOUSCRIPTION_VARIABLE_LABELS } from "@/lib/souscription-cif/scpi-lettre-mission-page1";
import {
  buildDossierStorageKey,
  getDossierForContact,
  loadSouscriptionCifDraft,
  saveSouscriptionCifDraft,
  type SouscriptionCifDocumentId,
  type SouscriptionCifProductType,
} from "@/lib/souscription-cif/souscription-cif-storage";
import {
  CIF_PRODUCT_TYPE_OPTIONS,
  isCifProductTypeAvailable,
  parseSouscriptionCifProductType,
} from "@/lib/souscription-cif/cif-product-types";
import { requestOpenParametres } from "@/lib/navigation/app-navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, ExternalLink, Layers, Printer, User } from "lucide-react";

export type { SouscriptionCifDocumentId, SouscriptionCifProductType };

const RAPPORT_MISSION_UI_LABEL = "Rapport de mission et adéquation";

const DOCUMENT_LABELS: Record<SouscriptionCifDocumentId, string> = {
  "lettre-mission": "Lettre de mission",
  "convention-rto": RTO_DOCUMENT_TITLE,
  "rapport-mission": RAPPORT_MISSION_UI_LABEL,
  "annexes-rapport": ANNEXES_RAPPORT_DOCUMENT_TITLE,
};

const CGP_PROFILE_KEYS = new Set([
  "cgp_nom_complet",
  "cgp_representant_legal",
  "cgp_rcs_ville",
  "cgp_siren",
  "cgp_siren_compact",
  "cgp_adresse_ligne",
  "cgp_cp_ville",
  "cgp_anacofi_numero",
  "cgp_orias",
]);

type SouscriptionCifProps = {
  currentPage?: string;
  onOpenContact?: (contactId: number) => void;
  onNavigate?: (page: string) => void;
};

function readInitialDraft() {
  return loadSouscriptionCifDraft();
}

export function SouscriptionCif({ currentPage, onOpenContact, onNavigate }: SouscriptionCifProps) {
  const initialDraft = useMemo(() => readInitialDraft(), []);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [cgp, setCgp] = useState<CgpConfig | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<number | undefined>(
    () => initialDraft?.selectedContactId
  );
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactDocuments, setContactDocuments] = useState<Document[]>([]);
  const [dossiersByContactId, setDossiersByContactId] = useState<
    Record<string, SouscriptionDossierFields>
  >(() => initialDraft?.dossiersByContactId ?? {});
  const [activeDocument, setActiveDocument] = useState<SouscriptionCifDocumentId>(
    () => initialDraft?.activeDocument ?? "lettre-mission"
  );
  const [productType, setProductType] = useState<SouscriptionCifProductType>(() =>
    parseSouscriptionCifProductType(initialDraft?.productType)
  );
  const pendingFocusFieldIdRef = useRef<string | null>(null);
  const previousContactIdRef = useRef<number | undefined>(initialDraft?.selectedContactId);
  const selectedContactIdRef = useRef<number | undefined>(initialDraft?.selectedContactId);

  useEffect(() => {
    selectedContactIdRef.current = selectedContactId;
  }, [selectedContactId]);

  const dossier = useMemo(
    () =>
      selectedContactId != null
        ? getDossierForContact(dossiersByContactId, selectedContactId, productType)
        : defaultSouscriptionDossierFields(),
    [selectedContactId, productType, dossiersByContactId]
  );

  const patchDossier = useCallback(
    (patch: Partial<SouscriptionDossierFields>) => {
      if (selectedContactId == null) return;
      const key = buildDossierStorageKey(selectedContactId, productType);
      setDossiersByContactId((prev) => ({
        ...prev,
        [key]: { ...getDossierForContact(prev, selectedContactId, productType), ...patch },
      }));
    },
    [selectedContactId, productType]
  );

  const handleContactChange = useCallback((contactId: number | undefined) => {
    pendingFocusFieldIdRef.current = null;
    setSelectedContactId(contactId);
    if (contactId == null) {
      setSelectedContact(null);
      return;
    }
    const fromList = contacts.find((c) => c.id === contactId);
    if (fromList) {
      setSelectedContact((prev) =>
        prev?.id === fromList.id && prev.updated_at === fromList.updated_at ? prev : fromList
      );
      return;
    }
    setSelectedContact(null);
    void getContactById(contactId)
      .then((contact) => {
        if (selectedContactIdRef.current === contactId) {
          setSelectedContact(contact);
        }
      })
      .catch(() => {
        if (selectedContactIdRef.current === contactId) {
          setSelectedContact(null);
        }
      });
  }, [contacts]);

  const handleProductTypeChange = useCallback((value: SouscriptionCifProductType) => {
    if (!isCifProductTypeAvailable(value)) return;
    pendingFocusFieldIdRef.current = null;
    setProductType(value);
  }, []);

  useEffect(() => {
    const previousId = previousContactIdRef.current;
    if (previousId !== selectedContactId && selectedContactId != null) {
      setActiveDocument("lettre-mission");
    }
    previousContactIdRef.current = selectedContactId;
  }, [selectedContactId]);

  useEffect(() => {
    saveSouscriptionCifDraft({
      productType,
      activeDocument,
      selectedContactId,
      dossiersByContactId,
    });
  }, [productType, activeDocument, selectedContactId, dossiersByContactId]);

  const loadContacts = useCallback(async () => {
    try {
      setContacts(await getAllContacts());
    } catch (error) {
      console.error("Erreur chargement contacts (souscription CIF):", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCgp = useCallback(async () => {
    try {
      setCgp(await getCgpConfig());
    } catch (error) {
      console.error("Erreur chargement profil CGP:", error);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
    void loadCgp();
  }, [loadContacts, loadCgp]);

  useEventAutoRefresh(loadContacts, subscribeContactsChanged);

  useEffect(() => {
    if (!selectedContactId) {
      setSelectedContact(null);
      return;
    }
    const fromList = contacts.find((c) => c.id === selectedContactId);
    if (fromList) {
      setSelectedContact((prev) =>
        prev?.id === fromList.id && prev.updated_at === fromList.updated_at ? prev : fromList
      );
      return;
    }
    const requestedId = selectedContactId;
    void getContactById(requestedId)
      .then((contact) => {
        if (selectedContactIdRef.current === requestedId) {
          setSelectedContact(contact);
        }
      })
      .catch(() => {
        if (selectedContactIdRef.current === requestedId) {
          setSelectedContact(null);
        }
      });
  }, [selectedContactId, contacts]);

  useEffect(() => {
    const selection = getReadyContactSelection(selectedContactId, selectedContact);
    if (!selection || !isCifProductTypeAvailable(productType)) {
      setContactDocuments([]);
      return;
    }

    const { contactId, contact } = selection;
    let cancelled = false;

    const syncDossierFromContact = (
      foyer: Awaited<ReturnType<typeof getFoyerById>> | null,
      documents: Document[],
      foyerMembers: Contact[],
      investissements: Investissement[]
    ) => {
      if (cancelled || selectedContactIdRef.current !== contactId) return;
      const rappelSupplement = buildRappelSituationSupplement(
        foyerMembers,
        documents,
        investissements
      );
      setDossiersByContactId((prev) => {
        const key = buildDossierStorageKey(contactId, productType);
        const existing = getDossierForContact(prev, contactId, productType);
        const patch: Partial<SouscriptionDossierFields> = {};

        const contactLieu = lieuNaissanceFromContact(contact);
        if (existing.lieuNaissance !== contactLieu) {
          patch.lieuNaissance = contactLieu;
        }

        Object.assign(patch, dossierDatePatchFromDocuments(existing, documents));

        if (!existing.objectifsClient?.trim()) {
          patch.objectifsClient = buildDefaultObjectifsClient(contact, foyer);
        }
        if (!existing.rappelDemande?.trim()) {
          patch.rappelDemande = buildDefaultRappelDemande(contact, foyer);
        }
        if (!existing.conseil?.trim()) {
          patch.conseil = buildDefaultConseil();
        }

        if (!existing.rappelSituationClient?.trim()) {
          patch.rappelSituationClient = buildDefaultRappelSituation(
            contact,
            foyer,
            rappelSupplement
          );
        } else {
          const syncedRappel = syncRappelSituationFromContact(
            existing.rappelSituationClient,
            contact,
            foyer,
            rappelSupplement
          );
          if (syncedRappel !== existing.rappelSituationClient) {
            patch.rappelSituationClient = syncedRappel;
          }
        }

        if (
          existing.scpiAnnexeSouscriptions.length > 0 &&
          !existing.mesPreconisations?.trim()
        ) {
          patch.mesPreconisations = buildMesPreconisationsFromSouscriptions(
            existing.scpiAnnexeSouscriptions
          );
        }

        if (Object.keys(patch).length === 0) return prev;
        return { ...prev, [key]: { ...existing, ...patch } };
      });
    };

    const loadAndSyncDossier = () => {
      void Promise.all([
        contact.foyer_id ? getFoyerById(contact.foyer_id) : Promise.resolve(null),
        contact.foyer_id ? getContactsByFoyer(contact.foyer_id) : Promise.resolve([]),
        getDocumentsByContact(contactId),
      ]).then(async ([foyer, foyerMembers, documents]) => {
        if (cancelled || selectedContactIdRef.current !== contactId) return;
        const investissements = contact.foyer_id
          ? await loadFoyerInvestissements(contact.foyer_id, foyerMembers)
          : await getInvestissementsByContact(contactId);
        if (!cancelled && selectedContactIdRef.current === contactId) {
          setContactDocuments(documents);
          syncDossierFromContact(foyer, documents, foyerMembers, investissements);
        }
      });
    };

    loadAndSyncDossier();
    const unsubDocuments = subscribeDocumentsChanged(loadAndSyncDossier);
    const unsubInvestissements = subscribeInvestissementsChanged(loadAndSyncDossier);

    return () => {
      cancelled = true;
      unsubDocuments();
      unsubInvestissements();
    };
  }, [selectedContactId, selectedContact, productType]);

  const clientContacts = useMemo(
    () =>
      contacts.filter((c) =>
        ["CLIENT", "PROSPECT_CLIENT", "SUSPECT_CLIENT"].includes(c.categorie)
      ),
    [contacts]
  );

  const variables = useMemo(
    () => buildSouscriptionVariables(selectedContact, cgp, dossier, contactDocuments),
    [selectedContact, cgp, dossier, contactDocuments]
  );

  const lettreMissionPreview = useMemo(
    () => buildScpiLettreMissionPreview(variables, cgp?.cif_pied_de_page),
    [variables, cgp?.cif_pied_de_page]
  );

  const rapportMissionPreview = useMemo(
    () => buildRapportMissionPreview(variables, cgp?.cif_pied_de_page),
    [variables, cgp?.cif_pied_de_page]
  );

  const annexesRapportPreview = useMemo(
    () =>
      buildAnnexesRapportPreview(
        productType,
        variables,
        dossier,
        cgp?.cif_pied_de_page,
        selectedContact?.profil_risque_sri
      ),
    [productType, variables, dossier, cgp?.cif_pied_de_page, selectedContact?.profil_risque_sri]
  );

  const conventionRtoPreview = useMemo(
    () => buildConventionRtoPreview(variables, cgp?.cif_pied_de_page),
    [variables, cgp?.cif_pied_de_page]
  );

  const cifPreviews = useMemo(
    () => ({
      "lettre-mission": lettreMissionPreview,
      "convention-rto": conventionRtoPreview,
      "rapport-mission": rapportMissionPreview,
      "annexes-rapport": annexesRapportPreview,
    }),
    [lettreMissionPreview, conventionRtoPreview, rapportMissionPreview, annexesRapportPreview]
  );

  const { printBundle, printDocuments, isPrinting } = useCifPrintExport();

  const clientPdfName = variables.client_nom_prenom?.trim() || "Client";

  const printAllDocuments = useCallback(() => {
    void printDocuments(buildCifPrintBundle(cifPreviews, DOCUMENT_LABELS), clientPdfName);
  }, [cifPreviews, clientPdfName, printDocuments]);

  const printActiveDocument = useCallback(() => {
    void printDocuments(
      buildCifPrintBundle(cifPreviews, DOCUMENT_LABELS, [activeDocument]),
      clientPdfName
    );
  }, [activeDocument, cifPreviews, clientPdfName, printDocuments]);

  const preview =
    activeDocument === "convention-rto"
      ? conventionRtoPreview
      : activeDocument === "rapport-mission"
        ? rapportMissionPreview
        : activeDocument === "annexes-rapport"
          ? annexesRapportPreview
          : lettreMissionPreview;

  const missingProfileLabels = useMemo(
    () =>
      preview.missingKeys
        .filter((k) => CGP_PROFILE_KEYS.has(k))
        .map((k) => SOUSCRIPTION_VARIABLE_LABELS[k] ?? k),
    [preview.missingKeys]
  );

  const handleMissingVariableClick = useCallback(
    (key: string) => {
      const kind = classifyCifVariableFocus(key);
      if (kind === "cgp-profile") {
        if (onNavigate) {
          requestOpenParametres("profil", {
            scrollToId: "parametres-documents-cif",
            currentPage,
            setCurrentPage: onNavigate,
          });
        }
        return;
      }
      if (kind === "client-profile") {
        document.getElementById("cif-client-card")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        if (selectedContactId != null && onOpenContact) {
          onOpenContact(selectedContactId);
        }
        return;
      }
      const focus = getCifDossierFieldFocus(key);
      if (!focus) return;
      pendingFocusFieldIdRef.current = focus.fieldId;
      const sharedOnRto =
        activeDocument === "convention-rto" &&
        (key === "date_document" || key === "client_lieu_naissance");
      setActiveDocument(sharedOnRto ? "convention-rto" : focus.document);
    },
    [activeDocument, currentPage, onNavigate, onOpenContact, selectedContactId]
  );

  useEffect(() => {
    const fieldId = pendingFocusFieldIdRef.current;
    if (!fieldId) return;
    pendingFocusFieldIdRef.current = null;
    const timer = window.setTimeout(() => {
      focusCifDossierFieldElement(fieldId);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [activeDocument, dossier]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-serif font-bold text-primary">Souscription CIF</h2>
        <p className="text-sm text-muted-foreground">
          Lettre de mission et RTO (une fois pour toutes les solutions), rapport et annexes par
          souscription — contenu des annexes selon le produit (SCPI, etc.). Aperçu page par page,
          brouillon enregistré localement.
        </p>
      </div>

      <Card className="scroll-mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Layers className="h-5 w-5 text-primary" aria-hidden />
            Souscription
          </CardTitle>
          <CardDescription>
            Choisissez le type de produit — le contenu des annexes en dépend (SCPI, capital
            investissement, G3F…).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={productType}
            onValueChange={(value) =>
              handleProductTypeChange(value as SouscriptionCifProductType)
            }
          >
            <SelectTrigger className="max-w-md" aria-label="Type de souscription">
              <SelectValue placeholder="Type de souscription" />
            </SelectTrigger>
            <SelectContent>
              {CIF_PRODUCT_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id} disabled={!option.available}>
                  {option.label}
                  {!option.available ? " (bientôt disponible)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card id="cif-client-card" className="scroll-mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-primary" aria-hidden />
            Client
          </CardTitle>
          <CardDescription>
            Choisissez le client pour lequel vous préparez cette souscription.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement des contacts…</p>
          ) : (
            <ContactPersonSearch
              label="Client"
              hint="Clients, prospects et suspects — recherche par nom ou prénom."
              placeholder="Rechercher un client…"
              contacts={clientContacts.length > 0 ? clientContacts : contacts}
              value={selectedContactId}
              onChange={handleContactChange}
              onOpenContact={
                onOpenContact
                  ? (contact) => {
                      if (contact.id) onOpenContact(contact.id);
                    }
                  : undefined
              }
              badgeFn={(c) => getClientCategorieLabel(c.categorie) ?? c.categorie}
            />
          )}
        </CardContent>
      </Card>

      {selectedContact && isCifProductTypeAvailable(productType) && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-4">
            <SouscriptionCifDossierForm
              key={`${selectedContactId}-${productType}`}
              activeDocument={activeDocument}
              dossierKey={`${selectedContactId}-${productType}`}
              value={dossier}
              onChange={patchDossier}
            />

            {missingProfileLabels.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm text-amber-950">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                    Profil conseiller incomplet
                  </CardTitle>
                  <CardDescription className="text-amber-900/80">
                    Renseignez dans Paramètres → Profil → Documents CIF :{" "}
                    {missingProfileLabels.join(", ")}.
                  </CardDescription>
                </CardHeader>
                {onNavigate && (
                  <CardContent className="pt-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() =>
                        requestOpenParametres("profil", {
                          scrollToId: "parametres-documents-cif",
                          currentPage,
                          setCurrentPage: onNavigate,
                        })
                      }
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      Renseigner Documents CIF
                    </Button>
                  </CardContent>
                )}
              </Card>
            )}

            {preview.missingKeys.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Cliquez sur une zone surlignée dans l&apos;aperçu pour ouvrir le champ à compléter.
              </p>
            )}
          </div>

          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <Tabs
              value={activeDocument}
              onValueChange={(v) => setActiveDocument(v as SouscriptionCifDocumentId)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 gap-y-2">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
                <TabsTrigger value="lettre-mission" className="text-xs sm:text-sm">
                  Lettre de mission
                </TabsTrigger>
                <TabsTrigger value="convention-rto" className="text-xs sm:text-sm">
                  Convention RTO
                </TabsTrigger>
                <TabsTrigger value="rapport-mission" className="text-xs sm:text-sm">
                  {RAPPORT_MISSION_UI_LABEL}
                </TabsTrigger>
                <TabsTrigger value="annexes-rapport" className="text-xs sm:text-sm">
                  Annexes
                </TabsTrigger>
              </TabsList>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="gap-1.5"
                  disabled={isPrinting}
                  title="4 fenêtres d'enregistrement PDF (une par document) — nom proposé automatiquement."
                  onClick={printAllDocuments}
                >
                  <Printer className="h-4 w-4 shrink-0" aria-hidden />
                  {isPrinting ? "Téléchargement…" : "Télécharger les 4 documents"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={isPrinting}
                  title="Enregistrement PDF — choisissez « Enregistrer au format PDF » dans la fenêtre."
                  onClick={printActiveDocument}
                >
                  <Printer className="h-4 w-4 shrink-0" aria-hidden />
                  {isPrinting ? "Téléchargement…" : "Télécharger ce document"}
                </Button>
              </div>
              </div>

              <TabsContent value="lettre-mission" className="mt-3 space-y-3">
                <ScpiLettreMissionPreview
                  preview={lettreMissionPreview}
                  documentLabel={DOCUMENT_LABELS["lettre-mission"]}
                  resetKey={`${selectedContactId}-${productType}-lettre-mission`}
                  onMissingVariableClick={handleMissingVariableClick}
                />
              </TabsContent>

              <TabsContent value="convention-rto" className="mt-3 space-y-3">
                <ScpiLettreMissionPreview
                  preview={conventionRtoPreview}
                  documentLabel={DOCUMENT_LABELS["convention-rto"]}
                  resetKey={`${selectedContactId}-${productType}-convention-rto`}
                  onMissingVariableClick={handleMissingVariableClick}
                />
              </TabsContent>

              <TabsContent value="rapport-mission" className="mt-3 space-y-3">
                <CifPagedDocumentPreview
                  preview={rapportMissionPreview}
                  documentLabel={DOCUMENT_LABELS["rapport-mission"]}
                  resetKey={`${selectedContactId}-${productType}-rapport-mission`}
                  onMissingVariableClick={handleMissingVariableClick}
                />
              </TabsContent>

              <TabsContent value="annexes-rapport" className="mt-3 space-y-3">
                <CifPagedDocumentPreview
                  preview={annexesRapportPreview}
                  documentLabel={DOCUMENT_LABELS["annexes-rapport"]}
                  resetKey={`${selectedContactId}-${productType}-annexes-rapport`}
                  onMissingVariableClick={handleMissingVariableClick}
                />
              </TabsContent>
            </Tabs>
            <CifDocumentPrintPortal documents={printBundle} />
          </div>
        </div>
      )}
    </div>
  );
}
