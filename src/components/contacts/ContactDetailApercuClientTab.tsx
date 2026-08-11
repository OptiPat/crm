import { useCallback, useEffect, useMemo, useState } from "react";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import { getAlertesNonTraitees, type Alerte } from "@/lib/api/tauri-alertes";
import { getTachesByContact } from "@/lib/api/tauri-taches";
import { getValorisationsByInvestissement } from "@/lib/api/tauri-investissement-valorisations";
import {
  filterInvestissementsVisibleToViewer,
  isInvestissementVisibleToViewer,
  type FoyerMemberRef,
} from "@/lib/patrimoine/visibilite";
import {
  aggregateByCategorie,
  aggregateByDisponibilite,
} from "@/lib/patrimoine/patrimoine-charts";
import { buildPerimetrePatrimoine } from "@/lib/patrimoine/perimetre";
import {
  buildPatrimoineTimeline,
  filterPatrimoineTimelineForClient,
  type PatrimoineTimelineEvent,
} from "@/lib/patrimoine/timeline";
import { getLatestValorisationLabel } from "@/components/contacts/client-preview/client-preview-format";
import { ContactEspaceAccesPanel } from "@/components/espace-client/ContactEspaceAccesPanel";
import {
  getEspaceClientSyncConfig,
  getEspaceSyncSummary,
} from "@/lib/api/tauri-espace-client";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { useAppBranding } from "@/components/app-branding/AppBrandingProvider";
import {
  listEspaceEcheances,
  type EspaceEcheance,
} from "@/lib/api/tauri-espace-client";
import { normalizeAgendaLinks, type AgendaLink } from "@/lib/emails/agenda-links";
import { ESPACE_CLIENT_CHANGED_EVENT } from "@/lib/espace-client/espace-client-events";
import { formatEspaceSyncLabel } from "@/lib/espace-client/espace-client-format";
import {
  ClientPreviewAdvisorPanel,
  type ClientPreviewViewport,
} from "@/components/contacts/client-preview/ClientPreviewAdvisorPanel";
import { ClientPreviewView } from "@/components/contacts/client-preview/ClientPreviewView";
import type { ClientPreviewEmptyState } from "@/components/contacts/client-preview/ClientPreviewHero";
import type { EvolutionHistoryById } from "@/components/contacts/client-preview/ClientPreviewEvolution";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";

export interface ContactDetailApercuClientTabProps {
  contact: Contact;
  investissements: Investissement[];
  foyerMembers: FoyerMemberRef[];
  partenaires: Partenaire[];
  onOpenPatrimoine?: () => void;
}

/**
 * Même règle que la synchronisation : le lien doit exister et être sécurisé,
 * sinon aucun bouton. Sans ce partage, l'aperçu promettrait un bouton que le
 * client ne verrait jamais.
 */
function resoudreRdvUrl(
  lienId: string | null | undefined,
  liens: AgendaLink[]
): string | undefined {
  const choisi = lienId?.trim();
  if (!choisi) return undefined;
  const url = liens.find((lien) => lien.id === choisi)?.url.trim();
  return url?.startsWith("https://") ? url : undefined;
}

export function ContactDetailApercuClientTab({
  contact,
  investissements,
  foyerMembers,
  partenaires,
  onOpenPatrimoine,
}: ContactDetailApercuClientTabProps) {
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [taches, setTaches] = useState<
    Awaited<ReturnType<typeof getTachesByContact>>
  >([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [viewport, setViewport] = useState<ClientPreviewViewport>("mobile");
  const [lastSyncLabel, setLastSyncLabel] = useState<string | null>(null);
  const [evolutionHistories, setEvolutionHistories] =
    useState<EvolutionHistoryById>(new Map());

  const loadSyncSummary = useCallback(async () => {
    try {
      const summary = await getEspaceSyncSummary();
      setLastSyncLabel(formatEspaceSyncLabel(summary.derniere_synchro_at));
    } catch {
      setLastSyncLabel(null);
    }
  }, []);

  useEffect(() => {
    void loadSyncSummary();
  }, [loadSyncSummary]);

  useEffect(() => {
    const handler = () => void loadSyncSummary();
    window.addEventListener(ESPACE_CLIENT_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ESPACE_CLIENT_CHANGED_EVENT, handler);
  }, [loadSyncSummary]);

  const viewer = useMemo(
    () => ({
      id: contact.id!,
      foyer_id: contact.foyer_id,
      role_foyer: contact.role_foyer,
      date_naissance: contact.date_naissance,
    }),
    [contact]
  );

  useEffect(() => {
    if (!contact.id) return;
    let cancelled = false;
    setTimelineLoading(true);

    void Promise.all([
      getAlertesNonTraitees()
        .then((all) => all.filter((a) => a.contact_id === contact.id))
        .catch(() => [] as Alerte[]),
      getTachesByContact(contact.id).catch(
        () => [] as Awaited<ReturnType<typeof getTachesByContact>>
      ),
    ]).then(([nextAlertes, nextTaches]) => {
      if (cancelled) return;
      setAlertes(nextAlertes);
      setTaches(nextTaches);
      setTimelineLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [contact.id]);

  const visible = useMemo(
    () =>
      filterInvestissementsVisibleToViewer(
        investissements,
        viewer,
        foyerMembers
      ),
    [investissements, viewer, foyerMembers]
  );

  const visibleIdsKey = useMemo(
    () =>
      visible
        .map((inv) => inv.id)
        .sort((a, b) => a - b)
        .join(","),
    [visible]
  );

  useEffect(() => {
    if (!visibleIdsKey) {
      setEvolutionHistories(new Map());
      return;
    }
    let cancelled = false;
    const ids = visibleIdsKey.split(",").map(Number);

    const load = () => {
      void Promise.all(
        ids.map(async (id) => {
          try {
            const rows = await getValorisationsByInvestissement(id);
            return [
              id,
              rows.map((r) => ({
                dateTs: r.date_valorisation,
                montantCentimes: r.montant,
              })),
            ] as const;
          } catch {
            return [id, [] as Array<{ dateTs: number; montantCentimes: number }>] as const;
          }
        })
      ).then((entries) => {
        if (cancelled) return;
        setEvolutionHistories(new Map(entries));
      });
    };

    load();
    const unsubscribe = subscribeInvestissementsChanged(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [visibleIdsKey]);

  const hiddenCount = useMemo(
    () =>
      investissements.filter(
        (inv) => !isInvestissementVisibleToViewer(inv, viewer, foyerMembers)
      ).length,
    [investissements, viewer, foyerMembers]
  );

  // Le portail affiche le logo configuré sur son serveur ; le CRM ne le
  // connaît pas. Celui du cabinet en est l'équivalent le plus proche, et il
  // rend l'aperçu fidèle sur la mise en page, qui est ce qui se juge ici.
  const { logoSrc } = useAppBranding();

  const [echeances, setEcheances] = useState<EspaceEcheance[]>([]);
  const [agendaLinks, setAgendaLinks] = useState<AgendaLink[]>([]);

  const chargerEcheances = useCallback(async () => {
    if (contact.id == null) return;
    try {
      setEcheances(await listEspaceEcheances(contact.id));
    } catch {
      setEcheances([]);
    }
  }, [contact.id]);

  useEffect(() => {
    void chargerEcheances();
  }, [chargerEcheances]);

  // Une échéance ajoutée dans le panneau voisin doit apparaître aussitôt dans
  // l'aperçu, sans changer d'onglet.
  useEffect(() => {
    const handler = () => void chargerEcheances();
    window.addEventListener(ESPACE_CLIENT_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ESPACE_CLIENT_CHANGED_EVENT, handler);
  }, [chargerEcheances]);

  // L'aperçu doit montrer ce que le client verra, bouton compris — sinon il
  // cesse d'être un aperçu. Même résolution que la synchronisation : le lien
  // désigné dans les réglages, cherché parmi les agendas du profil CGP.
  const [rdvUrl, setRdvUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let annule = false;
    Promise.all([getCgpConfig(), getEspaceClientSyncConfig()])
      .then(([cgp, sync]) => {
        if (annule) return;
        const liens = normalizeAgendaLinks(cgp);
        setAgendaLinks(liens);
        setRdvUrl(resoudreRdvUrl(sync.rdv_lien_id, liens));
      })
      .catch(() => {
        if (!annule) setRdvUrl(undefined);
      });
    return () => {
      annule = true;
    };
  }, []);

  const emptyState = useMemo((): ClientPreviewEmptyState => {
    if (investissements.length === 0) return "empty";
    if (visible.length === 0) return "all_hidden";
    return null;
  }, [investissements.length, visible.length]);

  const partenaireById = useMemo(() => {
    const map = new Map<number, Partenaire>();
    for (const p of partenaires) map.set(p.id, p);
    return map;
  }, [partenaires]);

  const perimetre = useMemo(
    () =>
      buildPerimetrePatrimoine(visible, {
        dateDernierContact: contact.date_dernier_contact,
      }),
    [visible, contact.date_dernier_contact]
  );

  const categorieData = useMemo(
    () => aggregateByCategorie(visible),
    [visible]
  );

  const disponibiliteData = useMemo(
    () => aggregateByDisponibilite(visible),
    [visible]
  );

  // Les échéances rédigées à la main vivent en base, pas dans les alertes ni
  // les tâches : sans ce rappel, l'aperçu ignorerait ce que le conseiller
  // vient d'écrire pour son client, et cesserait d'être un aperçu.
  const timeline = useMemo(() => {
    const maintenant = Math.floor(Date.now() / 1000);
    const placements = filterPatrimoineTimelineForClient(
      buildPatrimoineTimeline(visible, alertes, taches)
    );
    const conseiller: PatrimoineTimelineEvent[] = echeances
      .filter((echeance) => echeance.date_echeance >= maintenant)
      .map((echeance) => ({
        id: `echeance-${echeance.id}`,
        kind: "conseiller" as const,
        date: echeance.date_echeance,
        label: echeance.titre,
        detail: echeance.message ?? undefined,
        rdvUrl: resoudreRdvUrl(echeance.rdv_lien_id, agendaLinks),
      }));

    return [...placements, ...conseiller].sort((a, b) => a.date - b.date);
  }, [visible, alertes, taches, echeances, agendaLinks]);

  const valorisationLabel = useMemo(
    () => getLatestValorisationLabel(visible),
    [visible]
  );

  return (
    <div className="flex flex-col items-center gap-4">
      <ContactEspaceAccesPanel
        contact={contact}
        onChanged={() => void loadSyncSummary()}
      />
      <ClientPreviewAdvisorPanel
        visibleCount={visible.length}
        hiddenCount={hiddenCount}
        valorisationLabel={valorisationLabel}
        viewport={viewport}
        onViewportChange={setViewport}
        onOpenPatrimoine={onOpenPatrimoine}
        lastSyncLabel={lastSyncLabel}
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
        emptyState={emptyState}
        timelineLoading={timelineLoading}
        lastSyncLabel={lastSyncLabel}
        evolutionHistoriesByInvestissementId={evolutionHistories}
        rdvUrl={rdvUrl}
        showHeader
        logoUrl={logoSrc}
      />
    </div>
  );
}
