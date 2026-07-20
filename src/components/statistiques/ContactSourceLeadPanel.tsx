import { useCallback, useMemo, useState } from "react";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import {
  computeContactSourceLeadInvestissementStats,
  computeContactSourceLeadStats,
  filterContactsBySourceLeadKey,
  type SourceLeadStatsLens,
} from "@/lib/statistiques/contact-source-stats";
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
  toDashboardStatContactList,
  type AttributionInvestissementStatRow,
  type AttributionStatRow,
} from "./contact-stats-panels";
import { useStatistiquesPageData } from "./statistiques-page-data-context";

type ContactSourceLeadPanelProps = {
  onNavigate?: (page: string) => void;
};

export function ContactSourceLeadPanel({ onNavigate }: ContactSourceLeadPanelProps) {
  const {
    contacts,
    investissementsWithDetails: investissements,
    selfContactId,
    loading,
    dataRefreshKey,
    refreshData,
  } = useStatistiquesPageData();

  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [investissementsSheetOpen, setInvestissementsSheetOpen] = useState(false);
  const [selectedContactRow, setSelectedContactRow] = useState<AttributionStatRow | null>(null);
  const [selectedContactLens, setSelectedContactLens] = useState<SourceLeadStatsLens>("client");
  const [selectedInvestissementRow, setSelectedInvestissementRow] =
    useState<AttributionInvestissementStatRow | null>(null);

  const statsOptions = useMemo(() => ({ selfContactId }), [selfContactId]);

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

  const clientContactStats = useMemo(
    () => computeContactSourceLeadStats(contacts, statsOptions, "client"),
    [contacts, statsOptions]
  );

  const filleulContactStats = useMemo(
    () => computeContactSourceLeadStats(contacts, statsOptions, "filleul"),
    [contacts, statsOptions]
  );

  const clientConversionStats = useMemo(
    () =>
      computeContactSourceLeadInvestissementStats(contacts, investissements, statsOptions, "client"),
    [contacts, investissements, statsOptions]
  );

  const filleulConversionStats = useMemo(
    () =>
      computeContactSourceLeadInvestissementStats(
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
    return toDashboardStatContactList(
      filterContactsBySourceLeadKey(
        contacts,
        selectedContactRow.key,
        statsOptions,
        selectedContactLens
      )
    );
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
          panelId="source_client"
          title="Source contact — Clients"
          description="Prospects et clients actifs avec le champ Source / lead renseigné sur la fiche."
          loading={loading}
          total={clientContactStats.total}
          totalLabel="Clients"
          totalHint="Exclus : suspects clients, prescripteurs, filleuls seuls."
          rows={clientContactStats.rows}
          onOpenRow={(row) => openContactDistributionRow(row, "client")}
        />

        <AttributionDistributionPanel
          panelId="source_filleul"
          title="Source contact — Filleuls"
          description="Filleuls de votre réseau direct avec Source / lead — vous devez être leur parrain sur la fiche."
          loading={loading}
          total={filleulContactStats.total}
          totalLabel="Filleuls"
          totalHint="Prospects, inscrits et désinscrits."
          rows={filleulContactStats.rows}
          onOpenRow={(row) => openContactDistributionRow(row, "filleul")}
        />

        <AttributionConversionPanel
          panelId="conversion_client"
          title="Conversion et volume — Clients"
          description="Par source : combien ont signé un investissement « avec moi », et combien d'euros au total."
          loading={loading}
          rows={clientConversionStats.rows}
          variant="client"
          summaryLabel="Supports"
          summaryValue={clientConversionStats.total}
          summaryHint={`${formatDashboardCurrency(clientConversionStats.totalMontantCentimes / 100)} souscrits`}
          onOpenRow={(row) => openConversionRow(row, "client")}
        />

        <AttributionConversionPanel
          panelId="conversion_filleul"
          title="Conversion — Filleuls"
          description="Par source : combien de prospects filleuls sont devenus inscrits (ou désinscrits) dans votre réseau."
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
