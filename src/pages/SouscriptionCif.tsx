import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { buildSouscriptionVariables } from "@/lib/souscription-cif/build-variables";
import {
  defaultSouscriptionDossierFields,
  type SouscriptionDossierFields,
} from "@/lib/souscription-cif/dossier-fields";
import { getFoyerById } from "@/lib/api/tauri-foyers";
import { buildScpiLettreMissionPreview } from "@/lib/souscription-cif/render-template";
import { SOUSCRIPTION_VARIABLE_LABELS } from "@/lib/souscription-cif/scpi-lettre-mission-page1";
import {
  getDossierForContact,
  loadSouscriptionCifDraft,
  saveSouscriptionCifDraft,
  type SouscriptionCifProductType,
} from "@/lib/souscription-cif/souscription-cif-storage";
import { requestOpenParametres } from "@/lib/navigation/app-navigation";
import { AlertCircle, ExternalLink, FileSignature, User } from "lucide-react";

export type { SouscriptionCifProductType };

const PRODUCT_LABELS: Record<SouscriptionCifProductType, string> = {
  scpi: "SCPI",
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
      selectedContactId,
      dossiersByContactId,
    });
  }, [productType, selectedContactId, dossiersByContactId]);

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
    if (selectedContactId == null || !selectedContact?.foyer_id) return;

    const key = String(selectedContactId);
    if (dossiersByContactId[key]?.objectifsClient?.trim()) return;

    let cancelled = false;
    void getFoyerById(selectedContact.foyer_id).then((foyer) => {
      if (cancelled) return;
      const objectifs = foyer.objectifs_patrimoniaux?.trim();
      if (!objectifs) return;
      setDossiersByContactId((prev) => {
        if (prev[key]?.objectifsClient?.trim()) return prev;
        return {
          ...prev,
          [key]: {
            ...getDossierForContact(prev, selectedContactId),
            objectifsClient: objectifs,
          },
        };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedContactId, selectedContact?.foyer_id, dossiersByContactId]);

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

  const preview = useMemo(
    () => buildScpiLettreMissionPreview(variables, cgp?.cif_pied_de_page),
    [variables, cgp?.cif_pied_de_page]
  );

  const missingProfileLabels = useMemo(
    () =>
      preview.missingKeys
        .filter((k) => CGP_PROFILE_KEYS.has(k))
        .map((k) => SOUSCRIPTION_VARIABLE_LABELS[k] ?? k),
    [preview.missingKeys]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-serif font-bold text-primary">Souscription CIF</h2>
          <Badge variant="secondary">{PRODUCT_LABELS[productType]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Lettre de mission SCPI — navigation page par page. Brouillon enregistré localement.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-primary" aria-hidden />
            Client
          </CardTitle>
          <CardDescription>
            Choisissez le client pour lequel vous préparez le dossier SCPI.
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-start">
          <div className="space-y-4">
            <SouscriptionCifDossierForm value={dossier} onChange={patchDossier} />

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
                Les zones surlignées en jaune dans l&apos;aperçu restent à compléter.
              </p>
            )}
          </div>

          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileSignature className="h-4 w-4" aria-hidden />
              Lettre de mission
            </div>
            <ScpiLettreMissionPreview preview={preview} resetKey={selectedContactId} />
          </div>
        </div>
      )}
    </div>
  );
}
