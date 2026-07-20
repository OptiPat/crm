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

  const distributionPanels = (
    <>
      {(lens === "both" || lens === "client") && (
        <AttributionDistributionPanel
          panelId="geography_client"
          title={lens === "both" ? "Clients" : "Géographie"}
          description="Clients actifs, anciens clients et prospects clients par département."
          loading={loading}
          total={clientStats.total}
          totalLabel="Clients"
          totalHint="Suspects exclus — département dérivé du code postal."
          rows={clientStats.rows}
          onOpenRow={(row) => openRow("client", row)}
        />
      )}

      {(lens === "both" || lens === "filleul") && (
        <AttributionDistributionPanel
          panelId="geography_filleul"
          title={lens === "filleul" ? "Géographie" : "Filleuls"}
          description="Filleuls inscrits, prospects filleuls et filleuls désinscrits par département — tous parrains confondus."
          loading={loading}
          total={filleulStats.total}
          totalLabel="Filleuls"
          totalHint="Suspects filleuls exclus — département dérivé du code postal."
          rows={filleulStats.rows}
          onOpenRow={(row) => openRow("filleul", row)}
        />
      )}
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
