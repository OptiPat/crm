import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import type { ClientInvestissementUpdateInput } from "@/lib/espace-client/client-investissement-update";
import type { ClientAvoirDeclarationInput } from "@/lib/espace-client/client-avoir-declaration";
import {
  buildValorisationHistories,
  type ValorisationPointDto,
} from "@/lib/espace-client/espace-valorisations";
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
import type { PatrimoineTimelineEvent } from "@/lib/patrimoine/timeline";
import { toClientTimeline } from "@/lib/espace-client/espace-timeline";
import { getLatestValorisationLabel } from "@/components/contacts/client-preview/client-preview-format";
import { ContactEspaceAccesPanel } from "@/components/espace-client/ContactEspaceAccesPanel";
import {
  buildEspaceClientPreview,
  getEspaceSyncSummary,
  listEspaceScpiDeclarationsPending,
  type EspaceScpiDeclarationPending,
} from "@/lib/api/tauri-espace-client";
import { useAppBranding } from "@/components/app-branding/AppBrandingProvider";
import { ESPACE_CLIENT_CHANGED_EVENT } from "@/lib/espace-client/espace-client-events";
import { formatEspaceSyncLabel } from "@/lib/espace-client/espace-client-format";
import {
  ClientPreviewAdvisorPanel,
  type ClientPreviewViewport,
} from "@/components/contacts/client-preview/ClientPreviewAdvisorPanel";
import { ClientPreviewView } from "@/components/contacts/client-preview/ClientPreviewView";
import {
  ClientPreviewDocuments,
  type ClientPreviewDocumentDemande,
} from "@/components/contacts/client-preview/ClientPreviewDocuments";
import type { ClientPreviewEmptyState } from "@/components/contacts/client-preview/ClientPreviewHero";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";

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
  const [timeline, setTimeline] = useState<PatrimoineTimelineEvent[]>([]);
  const [valorisations, setValorisations] = useState<ValorisationPointDto[]>([]);
  const [demandes, setDemandes] = useState<ClientPreviewDocumentDemande[]>([]);
  const [rdvUrl, setRdvUrl] = useState<string | undefined>(undefined);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [viewport, setViewport] = useState<ClientPreviewViewport>("mobile");
  const [lastSyncLabel, setLastSyncLabel] = useState<string | null>(null);
  const [pendingScpiDeclarations, setPendingScpiDeclarations] = useState<
    EspaceScpiDeclarationPending[]
  >([]);

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

  // La timeline et le bouton de rendez-vous viennent du moteur qui alimente le
  // portail, pas d'une reconstruction locale : c'est ce qui garantit que
  // l'aperçu montre l'écran du client, et qu'une règle nouvelle n'a pas à être
  // écrite deux fois.
  const chargerApercu = useCallback(async () => {
    if (contact.id == null) return;
    try {
      const preview = await buildEspaceClientPreview(contact.id);
      setTimeline(toClientTimeline(preview.timeline));
      setValorisations(preview.valorisations);
      setDemandes(
        preview.demandes.map((demande) => ({
          id: demande.id,
          libelle: demande.libelle,
          demandeAt: demande.demandeAt,
        }))
      );
      setRdvUrl(preview.rdvUrl ?? undefined);
    } catch {
      setTimeline([]);
      setValorisations([]);
      setDemandes([]);
      setRdvUrl(undefined);
    } finally {
      setTimelineLoading(false);
    }
  }, [contact.id]);

  useEffect(() => {
    setTimelineLoading(true);
    void chargerApercu();
  }, [chargerApercu]);

  // Une valorisation saisie dans l'onglet Patrimoine change l'écran du client.
  useEffect(
    () => subscribeInvestissementsChanged(() => void chargerApercu()),
    [chargerApercu]
  );

  // Une échéance ajoutée dans le panneau voisin doit apparaître aussitôt.
  useEffect(() => {
    const handler = () => void chargerApercu();
    window.addEventListener(ESPACE_CLIENT_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ESPACE_CLIENT_CHANGED_EVENT, handler);
  }, [chargerApercu]);

  const visible = useMemo(
    () =>
      filterInvestissementsVisibleToViewer(
        investissements,
        viewer,
        foyerMembers
      ),
    [investissements, viewer, foyerMembers]
  );

  useEffect(() => {
    if (contact.id == null) return;
    let cancelled = false;
    const loadPending = () => {
      void listEspaceScpiDeclarationsPending(contact.id!)
        .then((rows) => {
          if (!cancelled) setPendingScpiDeclarations(rows);
        })
        .catch(() => {
          if (!cancelled) setPendingScpiDeclarations([]);
        });
    };
    loadPending();
    const onChanged = () => loadPending();
    window.addEventListener(ESPACE_CLIENT_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(ESPACE_CLIENT_CHANGED_EVENT, onChanged);
    };
  }, [contact.id]);

  const scpiDeclarationsByInvestissementId = useMemo(() => {
    const map = new Map<
      number,
      Array<{
        dateTs: number;
        montantCentimes: number;
        revenuPercuCentimes?: number | null;
      }>
    >();
    for (const row of pendingScpiDeclarations) {
      const list = map.get(row.investissementId) ?? [];
      list.push({
        dateTs: row.dateTs,
        montantCentimes: row.valorisationCentimes,
        revenuPercuCentimes: row.revenuPercuCentimes,
      });
      map.set(row.investissementId, list);
    }
    return map;
  }, [pendingScpiDeclarations]);

  const visibleForPreview = useMemo(() => {
    return visible.map((inv) => {
      const pending = scpiDeclarationsByInvestissementId.get(inv.id);
      if (!pending?.length) return inv;
      const latest = [...pending].sort((a, b) => b.dateTs - a.dateTs)[0];
      const encoursDate = inv.encours_date ?? 0;
      if (latest.dateTs < encoursDate) return inv;
      return {
        ...inv,
        encours_actuel: latest.montantCentimes,
        encours_date: latest.dateTs,
      };
    });
  }, [visible, scpiDeclarationsByInvestissementId]);

  // Même fusion que sur le portail : les valorisations du cabinet et les
  // déclarations du client, y compris celles qui n'ont pas encore été reprises.
  const evolutionHistories = useMemo(
    () =>
      buildValorisationHistories(
        valorisations,
        scpiDeclarationsByInvestissementId
      ),
    [valorisations, scpiDeclarationsByInvestissementId]
  );

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
      buildPerimetrePatrimoine(visibleForPreview, {
        dateDernierContact: contact.date_dernier_contact,
      }),
    [visibleForPreview, contact.date_dernier_contact]
  );

  const categorieData = useMemo(
    () => aggregateByCategorie(visibleForPreview),
    [visibleForPreview]
  );

  const disponibiliteData = useMemo(
    () => aggregateByDisponibilite(visibleForPreview),
    [visibleForPreview]
  );

  const valorisationLabel = useMemo(
    () => getLatestValorisationLabel(visibleForPreview),
    [visibleForPreview]
  );

  const handlePreviewScpiDeclaration = useCallback(
    async (_input: ClientInvestissementUpdateInput) => {
      toast.message(
        "Aperçu conseiller — le client enregistre cette saisie sur son espace."
      );
    },
    []
  );

  const handlePreviewAvoir = useCallback(
    async (_input: ClientAvoirDeclarationInput) => {
      toast.message(
        "Aperçu conseiller — le client enregistre cette saisie sur son espace."
      );
    },
    []
  );

  const handlePreviewRetirer = useCallback(async (_investissementId: number) => {
    toast.message(
      "Aperçu conseiller — le client retire ce placement depuis son espace."
    );
  }, []);

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
        visible={visibleForPreview}
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
        enableScpiTracking
        onSubmitScpiDeclaration={handlePreviewScpiDeclaration}
        enableAddAvoir
        onSubmitAvoir={handlePreviewAvoir}
        enableRetirerAvoir
        onRetirerAvoir={handlePreviewRetirer}
        rdvUrl={rdvUrl}
        showHeader
        logoUrl={logoSrc}
        // Même section que sur le portail, bouton compris : sans elle,
        // l'aperçu omettait ce que le client voit en premier après l'en-tête.
        headerSlot={<ClientPreviewDocuments demandes={demandes} />}
      />
    </div>
  );
}
