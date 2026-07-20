import { useCallback, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatDashboardCurrency } from "@/components/dashboard/dashboard-format";
import {
  computeClientAbovePanierMoyenStats,
  filterContactsForClientAbovePanierMoyenList,
  formatClientAbovePanierMoyenPercent,
  formatClientAbovePanierMoyenSubtitle,
  type ClientAbovePanierMoyenListKind,
} from "@/lib/statistiques/contact-client-panier-moyen-stats";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { cn } from "@/lib/utils";
import { toDashboardStatContactList } from "./contact-stats-panels";
import { StatistiquesPanel } from "./statistiques-ui";
import { useStatistiquesClientPatrimoineFetch } from "./statistiques-client-data-context";

function PanierMoyenListButton({
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

type ContactClientAbovePanierMoyenPanelProps = {
  onNavigate?: (page: string) => void;
};

export function ContactClientAbovePanierMoyenPanel({
  onNavigate,
}: ContactClientAbovePanierMoyenPanelProps) {
  const {
    contacts,
    investissements,
    dashboard,
    loading,
    dataRefreshKey,
    refreshData,
  } = useStatistiquesClientPatrimoineFetch();
  const panierMoyenEuros = dashboard?.panier_moyen ?? null;
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [listKind, setListKind] = useState<ClientAbovePanierMoyenListKind | null>(null);

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

  const stats = useMemo(() => {
    if (panierMoyenEuros == null) return null;
    return computeClientAbovePanierMoyenStats(contacts, investissements, panierMoyenEuros);
  }, [contacts, investissements, panierMoyenEuros]);

  const loadContactsSheet = useCallback(async () => {
    if (!listKind || panierMoyenEuros == null) return [];
    return toDashboardStatContactList(
      filterContactsForClientAbovePanierMoyenList(
        contacts,
        listKind,
        investissements,
        panierMoyenEuros
      )
    );
  }, [contacts, investissements, listKind, panierMoyenEuros]);

  const openList = useCallback((kind: ClientAbovePanierMoyenListKind) => {
    setListKind(kind);
    setContactsSheetOpen(true);
  }, []);

  const sheetCount =
    listKind === "above" ? stats?.aboveCount ?? 0 : stats?.atOrBelowContactIds.length ?? 0;

  const sheetTitle =
    listKind === "above"
      ? "Clients actifs — au-dessus du panier moyen"
      : listKind === "atOrBelow"
        ? "Clients actifs — en dessous ou égal au panier moyen"
        : "Contacts";

  return (
    <>
      <StatistiquesPanel
        title="Au-dessus du panier moyen"
        description="Part des clients actifs dont le montant souscrit « avec moi » (perso + part du commun foyer) dépasse le panier moyen global."
        collapsible
        panelId="client_above_panier_moyen"
      >
        {loading ? (
          <ChartLoading />
        ) : stats == null ? (
          <ChartEmpty title="Impossible de charger la statistique." height={180} />
        ) : stats.totalCount === 0 ? (
          <ChartEmpty title="Aucun client actif éligible." height={180} />
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Dépasse le panier moyen
                </p>
                <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                  {formatClientAbovePanierMoyenPercent(stats.abovePercent)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-right max-w-xs">
                {formatClientAbovePanierMoyenSubtitle(stats)}
                <br />
                Panier moyen : {formatDashboardCurrency(stats.panierMoyenEuros)}
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Montants initiaux « avec moi » : perso hors foyer + placements du foyer (y compris rattachés
              à un déclarant) répartis entre les clients actifs du foyer.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <PanierMoyenListButton
                label="Au-dessus du panier moyen"
                count={stats.aboveCount}
                onClick={() => openList("above")}
              />
              <PanierMoyenListButton
                label="En dessous ou égal"
                count={stats.atOrBelowContactIds.length}
                onClick={() => openList("atOrBelow")}
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
          listKind && stats && sheetCount > 0
            ? `${sheetCount} client${sheetCount > 1 ? "s" : ""} · panier moyen ${formatDashboardCurrency(stats.panierMoyenEuros)}`
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
