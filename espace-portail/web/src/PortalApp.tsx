import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientPreviewView } from "@/components/contacts/client-preview/ClientPreviewView";
import { ClientPreviewViewportToggle } from "@/components/contacts/client-preview/ClientPreviewViewportToggle";
import { CP } from "@/components/contacts/client-preview/client-preview-theme";
import { useClientPreviewViewport } from "@/components/contacts/client-preview/use-client-preview-viewport";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import {
  aggregateByCategorie,
  aggregateByDisponibilite,
} from "@/lib/patrimoine/patrimoine-charts";
import { buildPerimetrePatrimoine } from "@/lib/patrimoine/perimetre";
import {
  filterPatrimoineTimelineForClient,
  type PatrimoineTimelineEvent,
} from "@/lib/patrimoine/timeline";
import { PortalDevGate } from "./PortalDevGate";
import type {
  EspaceClientInvestissementLine,
  EspaceClientPartenaireLine,
  EspaceClientSyncPayload,
  PatrimoineApiResponse,
} from "./types";

function readContactIdFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get("contact");
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function toInvestissement(line: EspaceClientInvestissementLine): Investissement {
  return {
    id: line.id,
    type_produit: line.typeProduit,
    partenaire_id: line.partenaireId ?? undefined,
    nom_produit: line.nomProduit,
    montant_initial: line.montantInitial ?? undefined,
    encours_actuel: line.encoursActuel ?? undefined,
    encours_date: line.encoursDate ?? undefined,
    origine: line.origine,
    statut: line.statut,
    date_souscription: line.dateSouscription ?? undefined,
    date_fin_demembrement: line.dateFinDemembrement ?? undefined,
    date_fin_pret: line.dateFinPret ?? undefined,
    date_prochain_arbitrage: line.dateProchainArbitrage ?? undefined,
    derniere_maj_client: line.derniereMajClient ?? undefined,
  } as Investissement;
}

function toPartenaire(line: EspaceClientPartenaireLine): Partenaire {
  return {
    id: line.id,
    type_partenaire: "ASSUREUR",
    raison_sociale: line.raisonSociale,
    url_extranet: line.urlExtranet ?? undefined,
    created_at: 0,
    updated_at: 0,
  };
}

function toTimeline(
  events: EspaceClientSyncPayload["timeline"]
): PatrimoineTimelineEvent[] {
  return filterPatrimoineTimelineForClient(
    events.map((event) => ({
      id: event.id,
      kind: event.kind as PatrimoineTimelineEvent["kind"],
      date: event.date,
      label: event.label,
      detail: event.detail ?? undefined,
      type_produit: event.typeProduit ?? undefined,
      origine: event.origine ?? undefined,
    }))
  );
}

function formatSyncLabel(unix?: number): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function PortalApp() {
  const { viewport, setViewport } = useClientPreviewViewport();
  const [contactId, setContactId] = useState<number | null>(readContactIdFromUrl);
  const [inputId, setInputId] = useState(contactId?.toString() ?? "");
  const [payload, setPayload] = useState<EspaceClientSyncPayload | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/patrimoine/${id}`);
      const body = (await response.json()) as PatrimoineApiResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Patrimoine indisponible");
      }
      setPayload(body.payload);
      setSyncedAt(body.syncedAt);
      const url = new URL(window.location.href);
      url.searchParams.set("contact", String(id));
      window.history.replaceState({}, "", url);
    } catch (err) {
      setPayload(null);
      setSyncedAt(null);
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contactId != null) {
      void load(contactId);
    }
  }, [contactId, load]);

  const contact = useMemo((): Contact | null => {
    if (!payload) return null;
    return {
      id: payload.contact.contactId,
      prenom: payload.contact.prenom,
      nom: payload.contact.nom,
      categorie: "CLIENT",
    } as Contact;
  }, [payload]);

  const visible = useMemo(
    () => (payload?.investissements ?? []).map(toInvestissement),
    [payload]
  );

  const partenaireById = useMemo(() => {
    const map = new Map<number, Partenaire>();
    for (const line of payload?.partenaires ?? []) {
      map.set(line.id, toPartenaire(line));
    }
    return map;
  }, [payload]);

  const perimetre = useMemo(
    () => buildPerimetrePatrimoine(visible),
    [visible]
  );
  const categorieData = useMemo(
    () => aggregateByCategorie(visible),
    [visible]
  );
  const disponibiliteData = useMemo(
    () => aggregateByDisponibilite(visible),
    [visible]
  );
  const timeline = useMemo(
    () => toTimeline(payload?.timeline ?? []),
    [payload]
  );

  if (!contact || !payload) {
    return (
      <PortalDevGate
        inputId={inputId}
        loading={loading}
        error={error}
        onInputChange={setInputId}
        onSubmit={() => setContactId(Number(inputId))}
      />
    );
  }

  return (
    <main className={`${CP.root} flex min-h-[100dvh] w-full flex-col items-center`}>
      <ClientPreviewViewportToggle
        viewport={viewport}
        onChange={setViewport}
        className="w-full max-w-3xl shrink-0 pt-4 pb-1"
      />
      <ClientPreviewView
        contact={contact}
        visible={visible}
        partenaireById={partenaireById}
        perimetre={perimetre}
        categorieData={categorieData}
        disponibiliteData={disponibiliteData}
        timeline={timeline}
        viewport={viewport}
        showDeviceFrame={false}
        emptyState={visible.length === 0 ? "empty" : null}
        timelineLoading={loading}
        lastSyncLabel={formatSyncLabel(syncedAt ?? undefined)}
      />
    </main>
  );
}
