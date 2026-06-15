import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactPersonSearch } from "@/components/contacts/ContactPersonSearch";
import { ScpiLettreMissionPreview } from "@/components/souscription-cif/ScpiLettreMissionPreview";
import { SouscriptionCifDossierForm } from "@/components/souscription-cif/SouscriptionCifDossierForm";
import { getClientCategorieLabel } from "@/lib/contacts/contact-list-labels";
import { getAllContacts, getContactById, type Contact } from "@/lib/api/tauri-contacts";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import {
  buildDefaultConseil,
  buildDefaultMesPreconisations,
} from "@/lib/souscription-cif/build-default-annexes-fields";
import { buildDefaultObjectifsClient } from "@/lib/souscription-cif/build-default-objectifs-client";
import { buildDefaultRappelDemande } from "@/lib/souscription-cif/build-default-rappel-demande";
import { buildDefaultRappelSituation } from "@/lib/souscription-cif/build-rappel-situation-default";
import { buildSouscriptionVariables } from "@/lib/souscription-cif/build-variables";
import {
  defaultSouscriptionDossierFields,
  type SouscriptionDossierFields,
} from "@/lib/souscription-cif/dossier-fields";
import { getFoyerById } from "@/lib/api/tauri-foyers";
import { buildScpiLettreMissionPreview } from "@/lib/souscription-cif/render-template";
import { buildAnnexesRapportPreview } from "@/lib/souscription-cif/render-annexes-rapport";
import { buildRapportMissionPreview } from "@/lib/souscription-cif/render-rapport-mission";
import {
  ANNEXES_RAPPORT_DOCUMENT_TITLE,
  CIF_DOCUMENT_LIFECYCLE,
} from "@/lib/souscription-cif/cif-documents";
import {
  classifyCifVariableFocus,
  focusCifDossierFieldElement,
  getCifDossierFieldFocus,
} from "@/lib/souscription-cif/cif-dossier-field-focus";
import { RM_DOCUMENT_TITLE } from "@/lib/souscription-cif/rapport-mission-page1";
import { SOUSCRIPTION_VARIABLE_LABELS } from "@/lib/souscription-cif/scpi-lettre-mission-page1";
import {
  getDossierForContact,
  loadSouscriptionCifDraft,
  saveSouscriptionCifDraft,
  type SouscriptionCifDocumentId,
  type SouscriptionCifProductType,
} from "@/lib/souscription-cif/souscription-cif-storage";
import { requestOpenParametres } from "@/lib/navigation/app-navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ExternalLink, FileSignature, User } from "lucide-react";

export type { SouscriptionCifDocumentId, SouscriptionCifProductType };

const DOCUMENT_LABELS: Record<SouscriptionCifDocumentId, string> = {
  "lettre-mission": "Lettre de mission",
  "rapport-mission": RM_DOCUMENT_TITLE,
  "annexes-rapport": ANNEXES_RAPPORT_DOCUMENT_TITLE,
};

const CGP_PROFILE_KEYS = new Set([
  "cgp_nom_complet",
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
  const [dossiersByContactId, setDossiersByContactId] = useState<
    Record<string, SouscriptionDossierFields>
  >(() => initialDraft?.dossiersByContactId ?? {});
  const [activeDocument, setActiveDocument] = useState<SouscriptionCifDocumentId>(
    () => initialDraft?.activeDocument ?? "lettre-mission"
  );
  const pendingFocusFieldIdRef = useRef<string | null>(null);

  const productType: SouscriptionCifProductType = "scpi";

  const dossier = useMemo(
    () =>
      selectedContactId != null
        ? getDossierForContact(dossiersByContactId, selectedContactId)
        : defaultSouscriptionDossierFields(),
    [selectedContactId, dossiersByContactId]
  );

  const patchDossier = useCallback(
    (patch: Partial<SouscriptionDossierFields>) => {
      if (selectedContactId == null) return;
      const key = String(selectedContactId);
      setDossiersByContactId((prev) => ({
        ...prev,
        [key]: { ...getDossierForContact(prev, selectedContactId), ...patch },
      }));
    },
    [selectedContactId]
  );

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
      setSelectedContact(fromList);
      return;
    }
    void getContactById(selectedContactId)
      .then(setSelectedContact)
      .catch(() => setSelectedContact(null));
  }, [selectedContactId, contacts]);

  useEffect(() => {
    if (selectedContactId == null || !selectedContact) return;

    const key = String(selectedContactId);
    const current = getDossierForContact(dossiersByContactId, selectedContactId);
    const needsObjectifs = !current.objectifsClient?.trim();
    const needsRappelDemande = !current.rappelDemande?.trim();
    const needsRappelSituation = !current.rappelSituationClient?.trim();
    const needsLieuNaissance = !current.lieuNaissance?.trim();
    const needsConseil = !current.conseil?.trim();
    const needsMesPreconisations = !current.mesPreconisations?.trim();
    if (
      !needsObjectifs &&
      !needsRappelDemande &&
      !needsRappelSituation &&
      !needsLieuNaissance &&
      !needsConseil &&
      !needsMesPreconisations
    ) {
      return;
    }

    const applyPatch = (foyer: Awaited<ReturnType<typeof getFoyerById>> | null) => {
      setDossiersByContactId((prev) => {
        const existing = getDossierForContact(prev, selectedContactId);
        const patch: Partial<SouscriptionDossierFields> = {};
        const objectifs = buildDefaultObjectifsClient(foyer);
        if (needsObjectifs) {
          patch.objectifsClient = objectifs;
        }
        if (needsRappelDemande) {
          patch.rappelDemande = buildDefaultRappelDemande();
        }
        if (needsRappelSituation) {
          patch.rappelSituationClient = buildDefaultRappelSituation(selectedContact, foyer);
        }
        if (needsLieuNaissance && selectedContact.lieu_naissance?.trim()) {
          patch.lieuNaissance = selectedContact.lieu_naissance.trim();
        }
        if (needsConseil) {
          patch.conseil = buildDefaultConseil();
        }
        if (needsMesPreconisations) {
          patch.mesPreconisations = buildDefaultMesPreconisations();
        }
        if (Object.keys(patch).length === 0) return prev;
        return {
          ...prev,
          [key]: { ...existing, ...patch },
        };
      });
    };

    if (!selectedContact.foyer_id) {
      if (
        needsObjectifs ||
        needsRappelDemande ||
        needsRappelSituation ||
        needsLieuNaissance ||
        needsConseil ||
        needsMesPreconisations
      ) {
        applyPatch(null);
      }
      return;
    }

    let cancelled = false;
    void getFoyerById(selectedContact.foyer_id).then((foyer) => {
      if (cancelled) return;
      applyPatch(foyer);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedContactId, selectedContact, dossiersByContactId]);

  const clientContacts = useMemo(
    () =>
      contacts.filter((c) =>
        ["CLIENT", "PROSPECT_CLIENT", "SUSPECT_CLIENT"].includes(c.categorie)
      ),
    [contacts]
  );

  const variables = useMemo(
    () => buildSouscriptionVariables(selectedContact, cgp, dossier),
    [selectedContact, cgp, dossier]
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
    () => buildAnnexesRapportPreview(productType, variables, dossier, cgp?.cif_pied_de_page),
    [productType, variables, dossier, cgp?.cif_pied_de_page]
  );

  const preview =
    activeDocument === "rapport-mission"
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
      setActiveDocument(focus.document);
    },
    [currentPage, onNavigate, onOpenContact, selectedContactId]
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
          Lettre de mission (une fois pour toutes les solutions), rapport et annexes par
          souscription — contenu des annexes selon le produit (SCPI, etc.). Aperçu page par page,
          brouillon enregistré localement.
        </p>
      </div>

      <Card id="cif-client-card" className="scroll-mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-primary" aria-hidden />
            Client
          </CardTitle>
          <CardDescription>
            Choisissez le client pour lequel vous préparez la souscription.
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
              onChange={setSelectedContactId}
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

      {selectedContact && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-4">
            <SouscriptionCifDossierForm
              activeDocument={activeDocument}
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
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="lettre-mission" className="text-xs sm:text-sm">
                  Lettre de mission
                </TabsTrigger>
                <TabsTrigger value="rapport-mission" className="text-xs sm:text-sm">
                  Rapport de mission
                </TabsTrigger>
                <TabsTrigger value="annexes-rapport" className="text-xs sm:text-sm">
                  Annexes
                </TabsTrigger>
              </TabsList>

              {CIF_DOCUMENT_LIFECYCLE[activeDocument] === "once" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Document signé une fois — valable pour toutes les solutions.
                </p>
              )}
              {CIF_DOCUMENT_LIFECYCLE[activeDocument] === "per-subscription" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Document propre à cette souscription — contenu adapté au produit choisi.
                </p>
              )}

              <TabsContent value="lettre-mission" className="mt-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <FileSignature className="h-4 w-4" aria-hidden />
                  {DOCUMENT_LABELS["lettre-mission"]}
                </div>
                <ScpiLettreMissionPreview
                  preview={lettreMissionPreview}
                  documentLabel={DOCUMENT_LABELS["lettre-mission"]}
                  resetKey={`${selectedContactId}-lettre-mission`}
                  onMissingVariableClick={handleMissingVariableClick}
                />
              </TabsContent>

              <TabsContent value="rapport-mission" className="mt-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <FileSignature className="h-4 w-4" aria-hidden />
                  {DOCUMENT_LABELS["rapport-mission"]}
                </div>
                <ScpiLettreMissionPreview
                  preview={rapportMissionPreview}
                  documentLabel={DOCUMENT_LABELS["rapport-mission"]}
                  resetKey={`${selectedContactId}-rapport-mission`}
                  onMissingVariableClick={handleMissingVariableClick}
                />
              </TabsContent>

              <TabsContent value="annexes-rapport" className="mt-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <FileSignature className="h-4 w-4" aria-hidden />
                  {DOCUMENT_LABELS["annexes-rapport"]}
                </div>
                <ScpiLettreMissionPreview
                  preview={annexesRapportPreview}
                  documentLabel={DOCUMENT_LABELS["annexes-rapport"]}
                  resetKey={`${selectedContactId}-annexes-rapport`}
                  onMissingVariableClick={handleMissingVariableClick}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
