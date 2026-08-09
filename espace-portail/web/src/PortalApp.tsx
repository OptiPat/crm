import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientPreviewView } from "@/components/contacts/client-preview/ClientPreviewView";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  aggregateByCategorie,
  aggregateByDisponibilite,
} from "@/lib/patrimoine/patrimoine-charts";
import { buildPerimetrePatrimoine } from "@/lib/patrimoine/perimetre";
import type { PatrimoineTimelineEvent } from "@/lib/patrimoine/timeline";
import type {
  EspaceClientInvestissementLine,
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

function toTimeline(
  events: EspaceClientSyncPayload["timeline"]
): PatrimoineTimelineEvent[] {
  return events.map((event) => ({
    id: event.id,
    kind: event.kind as PatrimoineTimelineEvent["kind"],
    date: event.date,
    label: event.label,
    detail: event.detail ?? undefined,
    type_produit: event.typeProduit ?? undefined,
    origine: event.origine ?? undefined,
  }));
}

function formatSyncLabel(unix?: number): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function PortalApp() {
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
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-10">
        <div>
          <p className="text-sm font-medium text-zinc-100">Espace client</p>
          <p className="mt-1 text-xs text-zinc-400">
            Mode développement — saisissez l&apos;identifiant contact synchronisé
            depuis le CRM.
          </p>
        </div>
        <label className="space-y-1.5 text-xs">
          <span className="text-zinc-400">ID contact</span>
          <input
            type="number"
            min={1}
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="ex. 42"
          />
        </label>
        <button
          type="button"
          disabled={loading || !inputId.trim()}
          onClick={() => setContactId(Number(inputId))}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Chargement…" : "Afficher mon patrimoine"}
        </button>
        {error ? <p className="text-sm text-amber-400">{error}</p> : null}
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-black py-6">
      <ClientPreviewView
        contact={contact}
        visible={visible}
        partenaireById={new Map()}
        perimetre={perimetre}
        categorieData={categorieData}
        disponibiliteData={disponibiliteData}
        timeline={timeline}
        viewport="mobile"
        emptyState={visible.length === 0 ? "empty" : null}
        timelineLoading={loading}
        lastSyncLabel={formatSyncLabel(syncedAt ?? undefined)}
      />
    </main>
  );
}
