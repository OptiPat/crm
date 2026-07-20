import { useCallback, useMemo, useState } from "react";
import {
  computeClientAttritionStats,
  filterContactsForClientAttritionLens,
  type ContactAttritionStatResult,
} from "@/lib/statistiques/contact-attrition-stats";
import { formatDashboardPercent } from "@/components/dashboard/dashboard-format";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { toDashboardStatContactList } from "./contact-stats-panels";
import { AttritionKpiPanel } from "./contact-attrition-kpi-panel";
import { useStatistiquesContactsFetch } from "./statistiques-client-data-context";

type AttritionDrillDown = {
  kind: "active" | "attrited";
  title: string;
  count: number;
};

type ContactAttritionPanelProps = {
  onNavigate?: (page: string) => void;
  title?: string;
};

export function ContactAttritionPanel({
  onNavigate,
  title = "Attrition",
}: ContactAttritionPanelProps) {
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [drillDown, setDrillDown] = useState<AttritionDrillDown | null>(null);
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

  const clientStats = useMemo(() => computeClientAttritionStats(contacts), [contacts]);

  const loadContactsSheet = useCallback(async () => {
    if (!drillDown) return [];
    return toDashboardStatContactList(
      filterContactsForClientAttritionLens(contacts, drillDown.kind)
    );
  }, [contacts, drillDown]);

  const openList = useCallback((kind: "active" | "attrited", stats: ContactAttritionStatResult) => {
    const count = kind === "active" ? stats.activeCount : stats.attritedCount;
    if (count === 0) return;

    const titles = { active: "Clients actifs", attrited: "Anciens clients" };
    setDrillDown({ kind, title: titles[kind], count });
    setContactsSheetOpen(true);
  }, []);

  return (
    <>
      <AttritionKpiPanel
        panelId="attrition_client"
        title={title}
        description="Part des clients devenus anciens clients (statut EN_PAUSE) parmi les clients actifs et anciens."
        loading={loading}
        stats={clientStats}
        activeLabel="Clients actifs"
        attritedLabel="Anciens clients"
        hint="Base : catégorie Client uniquement — prospects et suspects clients exclus."
        onOpenList={(kind) => openList(kind, clientStats)}
      />

      {contactsSheetOpen ? <DashboardDrillDownBackdrop /> : null}

      <DashboardStatContactsSheet
        open={contactsSheetOpen}
        onOpenChange={(open) => {
          if (!open && contactDetailOpen) return;
          setContactsSheetOpen(open);
          if (!open) {
            setDrillDown(null);
            clearListBackMode();
          }
        }}
        title={drillDown?.title ?? "Contacts"}
        description={
          drillDown
            ? `${drillDown.count} contact${drillDown.count > 1 ? "s" : ""} — ${formatDashboardPercent(
                drillDown.count,
                clientStats.totalCount
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
