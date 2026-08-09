import { useCallback, useEffect, useMemo, useState } from "react";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import { getAlertesNonTraitees, type Alerte } from "@/lib/api/tauri-alertes";
import { getTachesByContact } from "@/lib/api/tauri-taches";
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
} from "@/lib/patrimoine/timeline";
import { getLatestValorisationLabel } from "@/components/contacts/client-preview/client-preview-format";
import { ContactEspaceAccesPanel } from "@/components/espace-client/ContactEspaceAccesPanel";
import {
  getEspaceSyncSummary,
} from "@/lib/api/tauri-espace-client";
import { ESPACE_CLIENT_CHANGED_EVENT } from "@/lib/espace-client/espace-client-events";
import { formatEspaceSyncLabel } from "@/lib/espace-client/espace-client-format";
import {
  ClientPreviewAdvisorPanel,
  type ClientPreviewViewport,
} from "@/components/contacts/client-preview/ClientPreviewAdvisorPanel";
import { ClientPreviewView } from "@/components/contacts/client-preview/ClientPreviewView";
import type { ClientPreviewEmptyState } from "@/components/contacts/client-preview/ClientPreviewHero";

export interface ContactDetailApercuClientTabProps {
  contact: Contact;
  investissements: Investissement[];
  foyerMembers: FoyerMemberRef[];
  partenaires: Partenaire[];
  onOpenPatrimoine?: () => void;
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

  const hiddenCount = useMemo(
    () =>
      investissements.filter(
        (inv) => !isInvestissementVisibleToViewer(inv, viewer, foyerMembers)
      ).length,
    [investissements, viewer, foyerMembers]
  );

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

  const timeline = useMemo(
    () =>
      filterPatrimoineTimelineForClient(
        buildPatrimoineTimeline(visible, alertes, taches)
      ),
    [visible, alertes, taches]
  );

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
      />
    </div>
  );
}
