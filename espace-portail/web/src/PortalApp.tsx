import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientPreviewView } from "@/components/contacts/client-preview/ClientPreviewView";
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
import { PortalLogin } from "./PortalLogin";
import { PortalDocumentsSection } from "./PortalDocumentsSection";
import { PortalPatrimoineHeader } from "./PortalPatrimoineHeader";
import { PortalPrivacy } from "./PortalPrivacy";
import { applyPortalColorScheme, type PortalColorScheme } from "./portal-theme";
import type {
  EspaceClientInvestissementLine,
  EspaceClientPartenaireLine,
  EspaceClientSyncPayload,
  PatrimoineApiResponse,
} from "./types";

interface AuthMeResponse {
  contactId: number;
  email: string;
  prenom: string;
  nom: string;
}

interface PortalBrandingResponse {
  brandName?: string;
  logoUrl?: string;
  loginTagline: string;
  colorScheme: PortalColorScheme;
}

interface PortalConfigResponse {
  devMode: boolean;
  branding?: PortalBrandingResponse;
}

const DEFAULT_LOGIN_TAGLINE =
  "Consultez votre patrimoine en toute confidentialité";

const DEFAULT_BRANDING: PortalBrandingResponse = {
  loginTagline: DEFAULT_LOGIN_TAGLINE,
  colorScheme: "system",
};

type PortalScreen = "loading" | "login" | "dev" | "no-sync" | "app";

function readContactIdFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get("contact");
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function clearContactIdFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("contact")) return;
  url.searchParams.delete("contact");
  window.history.replaceState({}, "", url);
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

function isPrivacyPath(): boolean {
  return window.location.pathname === "/confidentialite";
}

export function PortalApp() {
  const [showPrivacy, setShowPrivacy] = useState(() => isPrivacyPath());
  // Le navigateur du client sait deja sur quel appareil il tourne : la mise en
  // page suit l'ecran, sans bascule a proposer.
  const { viewport } = useClientPreviewViewport();
  const [screen, setScreen] = useState<PortalScreen>("loading");
  const [devMode, setDevMode] = useState(false);
  const [devInputId, setDevInputId] = useState(
    readContactIdFromUrl()?.toString() ?? ""
  );
  const [loginEmail, setLoginEmail] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loginInfo, setLoginInfo] = useState<string | null>(null);
  const [payload, setPayload] = useState<EspaceClientSyncPayload | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<PortalBrandingResponse>(DEFAULT_BRANDING);

  const applyPatrimoineResponse = useCallback((body: PatrimoineApiResponse) => {
    setPayload(body.payload);
    setSyncedAt(body.syncedAt);
    setScreen("app");
    setError(null);
  }, []);

  const loadPatrimoineMe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/patrimoine/me", {
        credentials: "include",
      });
      const body = (await response.json()) as PatrimoineApiResponse & {
        error?: string;
      };
      if (response.status === 404) {
        setPayload(null);
        setSyncedAt(null);
        setScreen("no-sync");
        setError(
          body.error ??
            "Votre espace est prêt mais le patrimoine n'a pas encore été synchronisé par votre conseiller."
        );
        return;
      }
      if (!response.ok) {
        throw new Error(body.error ?? "Patrimoine indisponible");
      }
      applyPatrimoineResponse(body);
    } catch (err) {
      setPayload(null);
      setSyncedAt(null);
      setError(err instanceof Error ? err.message : "Erreur de chargement");
      setScreen("no-sync");
    } finally {
      setLoading(false);
    }
  }, [applyPatrimoineResponse]);

  const loadPatrimoineDev = useCallback(
    async (id: number) => {
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
        applyPatrimoineResponse(body);
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
    },
    [applyPatrimoineResponse]
  );

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const configResponse = await fetch("/api/v1/portal-config");
      const config = (await configResponse.json()) as PortalConfigResponse;
      setDevMode(Boolean(config.devMode));
      if (config.branding) {
        setBranding(config.branding);
        applyPortalColorScheme(config.branding.colorScheme);
      } else {
        applyPortalColorScheme("system");
      }

      const meResponse = await fetch("/api/v1/auth/me", {
        credentials: "include",
      });
      if (meResponse.ok) {
        const me = (await meResponse.json()) as AuthMeResponse;
        setLoginEmail(me.email);
        await loadPatrimoineMe();
        return;
      }

      const devContactId = readContactIdFromUrl();
      if (devContactId != null) {
        if (!config.devMode) {
          clearContactIdFromUrl();
          setScreen("login");
          return;
        }
        const devResponse = await fetch(`/api/v1/patrimoine/${devContactId}`);
        if (devResponse.ok) {
          const body = (await devResponse.json()) as PatrimoineApiResponse;
          applyPatrimoineResponse(body);
          return;
        }
        if (devResponse.status === 404) {
          setScreen("dev");
          return;
        }
      }

      setScreen("login");
    } catch {
      setScreen("login");
    } finally {
      setLoading(false);
    }
  }, [applyPatrimoineResponse, loadPatrimoineMe]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const onNavigate = () => setShowPrivacy(isPrivacyPath());
    window.addEventListener("popstate", onNavigate);
    return () => window.removeEventListener("popstate", onNavigate);
  }, []);

  const openPrivacy = useCallback(() => {
    if (!isPrivacyPath()) {
      window.history.pushState({ privacy: true }, "", "/confidentialite");
    }
    setShowPrivacy(true);
  }, []);

  const closePrivacy = useCallback(() => {
    if (isPrivacyPath()) {
      window.history.replaceState({}, "", "/");
    }
    setShowPrivacy(false);
  }, []);

  const handleRequestCode = async () => {
    setLoading(true);
    setError(null);
    setLoginInfo(null);
    try {
      const response = await fetch("/api/v1/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim() }),
      });
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Envoi impossible");
      }
      setCodeSent(true);
      setLoginCode("");
      setLoginInfo(
        body.message ??
          "Consultez votre boîte mail (vérifiez les spams). Le code arrive en quelques instants."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail.trim(),
          code: loginCode.trim(),
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Connexion impossible");
      }
      setLoginCode("");
      await loadPatrimoineMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setPayload(null);
    setSyncedAt(null);
    setLoginCode("");
    setCodeSent(false);
    setLoginInfo(null);
    setScreen("login");
    setError(null);
  };

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

  if (showPrivacy) {
    return <PortalPrivacy onBack={closePrivacy} />;
  }

  if (screen === "loading") {
    return (
      <main
        className={`${CP.root} flex min-h-[100dvh] items-center justify-center text-sm text-[var(--cp-ink-muted)]`}
      >
        Chargement…
      </main>
    );
  }

  if (screen === "login") {
    return (
      <PortalLogin
        email={loginEmail}
        code={loginCode}
        codeSent={codeSent}
        loading={loading}
        error={error}
        info={loginInfo}
        branding={{
          logoUrl: branding.logoUrl,
          loginTagline: branding.loginTagline,
        }}
        onEmailChange={setLoginEmail}
        onCodeChange={setLoginCode}
        onRequestCode={() => void handleRequestCode()}
        onSubmit={() => void handleLogin()}
        onOpenPrivacy={openPrivacy}
      />
    );
  }

  if (screen === "dev" && devMode) {
    return (
      <PortalDevGate
        inputId={devInputId}
        loading={loading}
        error={error}
        onInputChange={setDevInputId}
        onSubmit={() => void loadPatrimoineDev(Number(devInputId))}
      />
    );
  }

  if (screen === "no-sync") {
    return (
      <main
        className={`${CP.root} flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10`}
      >
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-medium tracking-tight text-[var(--cp-ink)]">
            Espace investisseur
          </h1>
          <p className="cp-caption text-[var(--cp-ink-muted)]">
            {error ??
              "Votre conseiller n'a pas encore synchronisé votre patrimoine."}
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="rounded-xl bg-[var(--cp-ink)] px-4 py-2.5 text-sm font-medium text-[var(--cp-bg)]"
              disabled={loading}
              onClick={() => void loadPatrimoineMe()}
            >
              {loading ? "Vérification…" : "Réessayer"}
            </button>
            <button
              type="button"
              className="rounded-xl border border-[var(--cp-line)] px-4 py-2.5 text-sm text-[var(--cp-ink-muted)]"
              onClick={() => void handleLogout()}
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!contact || !payload) {
    return (
      <PortalLogin
        email={loginEmail}
        code={loginCode}
        codeSent={codeSent}
        loading={loading}
        error={error ?? "Session expirée"}
        info={loginInfo}
        branding={{
          logoUrl: branding.logoUrl,
          loginTagline: branding.loginTagline,
        }}
        onEmailChange={setLoginEmail}
        onCodeChange={setLoginCode}
        onRequestCode={() => void handleRequestCode()}
        onSubmit={() => void handleLogin()}
        onOpenPrivacy={openPrivacy}
      />
    );
  }

  return (
    <main className={`${CP.root} flex min-h-[100dvh] w-full flex-col items-center`}>
      <PortalPatrimoineHeader
        prenom={contact.prenom}
        nom={contact.nom}
        logoUrl={branding.logoUrl}
        lastSyncLabel={formatSyncLabel(syncedAt ?? undefined)}
        onLogout={() => void handleLogout()}
      />
      <PortalDocumentsSection />
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
        hideTimelineSync
        emptyState={visible.length === 0 ? "empty" : null}
        timelineLoading={loading}
        lastSyncLabel={formatSyncLabel(syncedAt ?? undefined)}
      />
    </main>
  );
}
