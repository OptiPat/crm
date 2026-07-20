import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getAllInvestissements } from "@/lib/api/tauri-investissements";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import {
  computeClientScpiReinvestStats,
  filterContactsForClientScpiReinvestList,
  formatClientScpiReinvestPercent,
  formatClientScpiReinvestSubtitle,
  type ClientScpiReinvestListKind,
} from "@/lib/statistiques/contact-client-scpi-reinvest-stats";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { cn } from "@/lib/utils";
import { toDashboardStatContactList } from "./contact-stats-panels";
import { StatistiquesPanel } from "./statistiques-ui";

function ScpiReinvestListButton({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick: () => void;
}) {
  const interactive = count > 0;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={interactive ? onClick : undefined}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5 text-left",
        interactive && "hover:bg-muted/40 cursor-pointer transition-colors"
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {count} client{count > 1 ? "s" : ""}
        </p>
      </div>
      {interactive ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </button>
  );
}

type ContactClientScpiReinvestPanelProps = {
  onNavigate?: (page: string) => void;
};

export function ContactClientScpiReinvestPanel({ onNavigate }: ContactClientScpiReinvestPanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissements, setInvestissements] = useState<Awaited<ReturnType<typeof getAllInvestissements>>>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [listKind, setListKind] = useState<ClientScpiReinvestListKind | null>(null);

  const refreshData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const [rows, invs] = await Promise.all([getAllContacts(), getAllInvestissements()]);
      setContacts(rows);
      setInvestissements(invs);
      setDataRefreshKey((key) => key + 1);
    } catch (error) {
      console.error("Erreur chargement stat réinvestissement SCPI:", error);
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

  const stats = useMemo(
    () => computeClientScpiReinvestStats(contacts, investissements),
    [contacts, investissements]
  );

  const loadContactsSheet = useCallback(async () => {
    if (!listKind) return [];
    return toDashboardStatContactList(
      filterContactsForClientScpiReinvestList(contacts, listKind, investissements)
    );
  }, [contacts, investissements, listKind]);

  const openList = useCallback((kind: ClientScpiReinvestListKind) => {
    setListKind(kind);
    setContactsSheetOpen(true);
  }, []);

  const sheetCount =
    listKind === "withReinvest"
      ? stats.withReinvestCount
      : stats.withoutReinvestContactIds.length;

  const sheetTitle =
    listKind === "withReinvest"
      ? "Clients — SCPI avec réinvestissement des dividendes"
      : listKind === "withoutReinvest"
        ? "Clients — SCPI sans réinvestissement des dividendes"
        : "Contacts";

  return (
    <>
      <StatistiquesPanel
        title="Réinvestissement SCPI"
        description="Part des clients ayant une SCPI pleine propriété « avec moi » avec réinvestissement des dividendes actif."
        collapsible
        panelId="client_scpi_reinvest"
      >
        {loading ? (
          <ChartLoading />
        ) : stats.totalCount === 0 ? (
          <ChartEmpty title="Aucun client actif avec SCPI pleine propriété « avec moi »." height={180} />
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Avec réinvestissement
                </p>
                <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                  {formatClientScpiReinvestPercent(stats.withReinvestPercent)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-right max-w-xs">
                {formatClientScpiReinvestSubtitle(stats)}
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              SCPI pleine propriété actives « avec moi » uniquement — aligné onglet Patrimoine /
              Investissements.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ScpiReinvestListButton
                label="Avec réinvestissement"
                count={stats.withReinvestCount}
                onClick={() => openList("withReinvest")}
              />
              <ScpiReinvestListButton
                label="Sans réinvestissement"
                count={stats.withoutReinvestContactIds.length}
                onClick={() => openList("withoutReinvest")}
              />
            </div>
          </div>
        )}
      </StatistiquesPanel>

      {contactsSheetOpen ? <DashboardDrillDownBackdrop /> : null}

      <DashboardStatContactsSheet
        open={contactsSheetOpen}
        onOpenChange={(open) => {
          if (!open && contactDetailOpen) return;
          setContactsSheetOpen(open);
          if (!open) {
            setListKind(null);
            clearListBackMode();
          }
        }}
        title={sheetTitle}
        description={
          listKind && sheetCount > 0
            ? `${sheetCount} client${sheetCount > 1 ? "s" : ""} · ${formatClientScpiReinvestPercent(stats.withReinvestPercent)} avec réinvestissement au total`
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
