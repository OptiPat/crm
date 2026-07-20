import { useCallback, useEffect, useMemo, useState } from "react";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import {
  getInvestissementsWithDetails,
  type InvestissementWithDetails,
} from "@/lib/api/tauri-investissements";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { resolveOrganisationSelfContact } from "@/lib/organisation/organisation-tree";
import {
  computeContactPrescripteurConversionStats,
  computeContactPrescripteurStats,
  filterContactsByPrescripteurKey,
} from "@/lib/statistiques/contact-prescripteur-stats";
import type { SourceLeadStatsLens } from "@/lib/statistiques/contact-source-stats";
import {
  formatDashboardCurrency,
  formatDashboardPercent,
} from "@/components/dashboard/dashboard-format";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { SourceLeadInvestissementsSheet } from "./SourceLeadInvestissementsSheet";
import {
  AttributionConversionPanel,
  AttributionDistributionPanel,
  formatConversionSubtitle,
  resolveInvestissementOpenContactId,
  toDashboardStatContact,
  type AttributionInvestissementStatRow,
  type AttributionStatRow,
} from "./contact-stats-panels";

type ContactPrescripteurPanelProps = {
  onNavigate?: (page: string) => void;
};

export function ContactPrescripteurPanel({ onNavigate }: ContactPrescripteurPanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissements, setInvestissements] = useState<InvestissementWithDetails[]>([]);
  const [selfContactId, setSelfContactId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [investissementsSheetOpen, setInvestissementsSheetOpen] = useState(false);
  const [selectedContactRow, setSelectedContactRow] = useState<AttributionStatRow | null>(null);
  const [selectedContactLens, setSelectedContactLens] = useState<SourceLeadStatsLens>("client");
  const [selectedInvestissementRow, setSelectedInvestissementRow] =
    useState<AttributionInvestissementStatRow | null>(null);

  const statsOptions = useMemo(() => ({ selfContactId }), [selfContactId]);

  const refreshData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const [rows, invRows, cgp] = await Promise.all([
        getAllContacts(),
        getInvestissementsWithDetails(),
        getCgpConfig(),
      ]);
      setContacts(rows);
      setInvestissements(invRows);
      setSelfContactId(resolveOrganisationSelfContact(rows, cgp)?.id ?? null);
      setDataRefreshKey((key) => key + 1);
    } catch (error) {
      console.error("Erreur chargement statistiques prescripteurs:", error);
      setContacts([]);
      setInvestissements([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const {
    openContactWithTab,
    clearListBackMode,
    sheet: contactDetailSheet,
    isOpen: contactDetailOpen,
    activeContactId,
  } = useContactDetailSheet({
    onNavigate,
    onUpdate: () => void refreshData({ silent: true }),
  });

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(
    () => subscribeContactsChanged(() => void refreshData({ silent: true })),
    [refreshData]
  );

  useEffect(
    () => subscribeInvestissementsChanged(() => void refreshData({ silent: true })),
    [refreshData]
  );

  const clientContactStats = useMemo(
    () => computeContactPrescripteurStats(contacts, statsOptions, "client"),
    [contacts, statsOptions]
  );

  const filleulContactStats = useMemo(
    () => computeContactPrescripteurStats(contacts, statsOptions, "filleul"),
    [contacts, statsOptions]
  );

  const clientConversionStats = useMemo(
    () =>
      computeContactPrescripteurConversionStats(contacts, investissements, statsOptions, "client"),
    [contacts, investissements, statsOptions]
  );

  const filleulConversionStats = useMemo(
    () =>
      computeContactPrescripteurConversionStats(
        contacts,
        investissements,
        statsOptions,
        "filleul"
      ),
    [contacts, investissements, statsOptions]
  );

  const contactStatsTotalForSheet = useMemo(() => {
    return selectedContactLens === "client" ? clientContactStats.total : filleulContactStats.total;
  }, [selectedContactLens, clientContactStats.total, filleulContactStats.total]);

  const filleulConversionSummary = useMemo(() => {
    const total = filleulContactStats.total;
    const signed = filleulConversionStats.rows.reduce(
      (sum, row) => sum + row.signedContactCount,
      0
    );
    const conversionPercent = total > 0 ? (signed / total) * 100 : 0;
    const pctLabel = conversionPercent.toFixed(1).replace(".0", "");
    return {
      signed,
      hint: `${signed} inscrit${signed > 1 ? "s" : ""} · ${pctLabel} % de conversion globale`,
    };
  }, [filleulContactStats.total, filleulConversionStats.rows]);

  const loadContactsSheet = useCallback(async () => {
    if (!selectedContactRow) return [];
    return filterContactsByPrescripteurKey(
      contacts,
      selectedContactRow.key,
      statsOptions,
      selectedContactLens
    ).map(toDashboardStatContact);
  }, [contacts, selectedContactRow, statsOptions, selectedContactLens]);

  const loadInvestissementsSheet = useCallback(async () => {
    if (!selectedInvestissementRow) return [];
    const ids = new Set(selectedInvestissementRow.investissementIds);
    return investissements.filter((inv) => ids.has(inv.id));
  }, [investissements, selectedInvestissementRow]);

  const resolveContactId = useCallback(
    (inv: InvestissementWithDetails) => resolveInvestissementOpenContactId(inv, contacts),
    [contacts]
  );

  const drillDownOpen = contactsSheetOpen || investissementsSheetOpen;

  const openContactDistributionRow = useCallback(
    (row: AttributionStatRow, lens: SourceLeadStatsLens) => {
      setSelectedContactLens(lens);
      setSelectedContactRow(row);
      setContactsSheetOpen(true);
    },
    []
  );

  const openConversionRow = useCallback(
    (row: AttributionInvestissementStatRow, lens: SourceLeadStatsLens) => {
      if (lens === "client" && row.count > 0) {
        setSelectedInvestissementRow(row);
        setInvestissementsSheetOpen(true);
        return;
      }
      setSelectedContactLens(lens);
      setSelectedContactRow({
        key: row.key,
        label: row.label,
        count: row.contactCount,
        percent: 0,
        contactIds: row.contactIds,
      });
      setContactsSheetOpen(true);
    },
    []
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <AttributionDistributionPanel
          panelId="prescripteur_client"
          title="Prescripteur — Clients"
          description="Clients regroupés par prescripteur renseigné sur la fiche."
          loading={loading}
          total={clientContactStats.total}
          totalLabel="Clients"
          totalHint="Mêmes règles que Source / lead : suspects clients et filleuls seuls exclus."
          rows={clientContactStats.rows}
          onOpenRow={(row) => openContactDistributionRow(row, "client")}
        />

        <AttributionDistributionPanel
          panelId="prescripteur_filleul"
          title="Prescripteur — Filleuls"
          description="Filleuls du réseau direct regroupés par prescripteur."
          loading={loading}
          total={filleulContactStats.total}
          totalLabel="Filleuls"
          totalHint="Mêmes règles que Source / lead : réseau direct, suspects filleuls exclus."
          rows={filleulContactStats.rows}
          onOpenRow={(row) => openContactDistributionRow(row, "filleul")}
        />

        <AttributionConversionPanel
          panelId="prescripteur_conversion_client"
          title="Conversion et volume — Clients"
          description="Par prescripteur : taux de conversion et montants signés « avec moi »."
          loading={loading}
          rows={clientConversionStats.rows}
          variant="client"
          summaryLabel="Supports"
          summaryValue={clientConversionStats.total}
          summaryHint={`${formatDashboardCurrency(clientConversionStats.totalMontantCentimes / 100)} souscrits`}
          onOpenRow={(row) => openConversionRow(row, "client")}
        />

        <AttributionConversionPanel
          panelId="prescripteur_conversion_filleul"
          title="Conversion — Filleuls"
          description="Par prescripteur : taux de conversion filleul (inscrit ou désinscrit)."
          loading={loading}
          rows={filleulConversionStats.rows}
          variant="filleul"
          summaryLabel="Filleuls"
          summaryValue={filleulContactStats.total}
          summaryHint={filleulConversionSummary.hint}
          onOpenRow={(row) => openConversionRow(row, "filleul")}
        />
      </div>

      {drillDownOpen ? <DashboardDrillDownBackdrop /> : null}

      <DashboardStatContactsSheet
        open={contactsSheetOpen}
        onOpenChange={(open) => {
          if (!open && contactDetailOpen) return;
          setContactsSheetOpen(open);
          if (!open) {
            setSelectedContactRow(null);
            clearListBackMode();
          }
        }}
        title={selectedContactRow?.label ?? "Contacts"}
        description={
          selectedContactRow
            ? `${selectedContactRow.count} contact${selectedContactRow.count > 1 ? "s" : ""} — ${formatDashboardPercent(selectedContactRow.count, contactStatsTotalForSheet)}`
            : undefined
        }
        loadContacts={loadContactsSheet}
        refreshSignal={dataRefreshKey}
        activeContactId={contactDetailOpen ? activeContactId : null}
        stackedContactOpen={contactDetailOpen}
        onOpenContact={(contactId) => {
          void openContactWithTab(contactId, undefined, { listBack: true });
        }}
      />

      <SourceLeadInvestissementsSheet
        open={investissementsSheetOpen}
        onOpenChange={(open) => {
          if (!open && contactDetailOpen) return;
          setInvestissementsSheetOpen(open);
          if (!open) {
            setSelectedInvestissementRow(null);
            clearListBackMode();
          }
        }}
        title={selectedInvestissementRow?.label ?? "Investissements"}
        description={
          selectedInvestissementRow
            ? `${formatConversionSubtitle(selectedInvestissementRow)} · ${selectedInvestissementRow.count} support${selectedInvestissementRow.count > 1 ? "s" : ""}`
            : undefined
        }
        loadItems={loadInvestissementsSheet}
        refreshSignal={dataRefreshKey}
        resolveContactId={resolveContactId}
        activeContactId={contactDetailOpen ? activeContactId : null}
        stackedContactOpen={contactDetailOpen}
        onOpenContact={(contactId) => {
          void openContactWithTab(contactId, "patrimoine", { listBack: true });
        }}
      />

      {contactDetailSheet}
    </>
  );
}
