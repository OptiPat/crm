import { useCallback, useMemo, useState } from "react";
import {
  computeContactGeographyStats,
  filterContactsByGeographyKey,
  type GeographyLens,
} from "@/lib/statistiques/contact-geography-stats";
import { formatDashboardPercent } from "@/components/dashboard/dashboard-format";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import {
  AttributionDistributionPanel,
  toDashboardStatContactList,
  type AttributionStatRow,
} from "./contact-stats-panels";
import { FranceDepartementsHeatMap } from "./FranceDepartementsHeatMap";
import { useStatistiquesContactsFetch } from "./statistiques-client-data-context";

type ContactGeographyPanelProps = {
  onNavigate?: (page: string) => void;
  /** Par défaut : clients + filleuls. */
  lens?: GeographyLens | "both";
};

export function ContactGeographyPanel({
  onNavigate,
  lens = "both",
}: ContactGeographyPanelProps) {
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<AttributionStatRow | null>(null);
  const [selectedLens, setSelectedLens] = useState<GeographyLens>("client");
  const { contacts, loading, dataRefreshKey, refreshData } = useStatistiquesContactsFetch();

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

  const clientStats = useMemo(() => computeContactGeographyStats(contacts, "client"), [contacts]);
  const filleulStats = useMemo(() => computeContactGeographyStats(contacts, "filleul"), [contacts]);

  const loadContactsSheet = useCallback(async () => {
    if (!selectedRow) return [];
    return toDashboardStatContactList(
      filterContactsByGeographyKey(contacts, selectedLens, selectedRow.key)
    );
  }, [contacts, selectedRow, selectedLens]);

  const openRow = useCallback((lens: GeographyLens, row: AttributionStatRow) => {
    if (row.count === 0) return;
    setSelectedLens(lens);
    setSelectedRow(row);
    setContactsSheetOpen(true);
  }, []);

  const selectedStats = selectedLens === "client" ? clientStats : filleulStats;

  const renderDistributionPanel = (geoLens: GeographyLens, stats: typeof clientStats) => (
    <AttributionDistributionPanel
      panelId={geoLens === "client" ? "geography_client" : "geography_filleul"}
      title={lens === "both" ? (geoLens === "client" ? "Clients" : "Filleuls") : "Géographie"}
      description={
        geoLens === "client"
          ? "Clients actifs, anciens clients et prospects clients par département."
          : "Filleuls inscrits, prospects filleuls et filleuls désinscrits par département — tous parrains confondus."
      }
      loading={loading}
      total={stats.total}
      totalLabel={geoLens === "client" ? "Clients" : "Filleuls"}
      totalHint="Suspects exclus — département dérivé du code postal."
      rows={stats.rows}
      onOpenRow={(row) => openRow(geoLens, row)}
      mapSlot={
        !loading && stats.total > 0 ? (
          <FranceDepartementsHeatMap
            rows={stats.rows}
            onSelectDept={(row) => openRow(geoLens, row)}
            foreignAudienceLabel={geoLens === "client" ? "Clients" : "Filleuls"}
          />
        ) : null
      }
    />
  );

  const distributionPanels = (
    <>
      {(lens === "both" || lens === "client") && renderDistributionPanel("client", clientStats)}
      {(lens === "both" || lens === "filleul") && renderDistributionPanel("filleul", filleulStats)}
    </>
  );

  return (
    <>
      {lens === "both" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">{distributionPanels}</div>
      ) : (
        distributionPanels
      )}

      {contactsSheetOpen ? <DashboardDrillDownBackdrop /> : null}

      <DashboardStatContactsSheet
        open={contactsSheetOpen}
        onOpenChange={(open) => {
          if (!open && contactDetailOpen) return;
          setContactsSheetOpen(open);
          if (!open) {
            setSelectedRow(null);
            clearListBackMode();
          }
        }}
        title={selectedRow?.label ?? "Contacts"}
        description={
          selectedRow
            ? `${selectedRow.count} contact${selectedRow.count > 1 ? "s" : ""} — ${formatDashboardPercent(
                selectedRow.count,
                selectedStats.total
              )}`
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

      {contactDetailSheet}
    </>
  );
}
