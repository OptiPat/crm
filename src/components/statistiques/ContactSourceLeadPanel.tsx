import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import {
  getInvestissementsWithDetails,
  type InvestissementWithDetails,
} from "@/lib/api/tauri-investissements";
import type { DashboardStatContact } from "@/lib/api/tauri-dashboard";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { resolveOrganisationSelfContact } from "@/lib/organisation/organisation-tree";
import {
  computeContactSourceLeadInvestissementStats,
  computeContactSourceLeadStats,
  filterContactsBySourceLeadKey,
  type ContactSourceLeadInvestissementStatRow,
  type ContactSourceLeadStatRow,
  type SourceLeadStatsLens,
} from "@/lib/statistiques/contact-source-stats";
import {
  formatDashboardCurrency,
  formatDashboardPercent,
} from "@/components/dashboard/dashboard-format";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { DashboardStatContactsSheet } from "@/components/dashboard/DashboardStatContactsSheet";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { cn } from "@/lib/utils";
import { SourceLeadInvestissementsSheet } from "./SourceLeadInvestissementsSheet";
import { StatistiquesPanel } from "./statistiques-ui";
import type { StatistiquesPanelId } from "@/lib/statistiques/statistiques-page-preferences";

const ROW_COLORS = ["#10B981", "#3B82F6", "#C9A227", "#8B5CF6", "#F59E0B", "#06B6D4", "#EF4444"];

function formatSourceConversionSubtitle(row: ContactSourceLeadInvestissementStatRow): string {
  const pct = row.conversionPercent.toFixed(1).replace(".0", "");
  return `${row.signedContactCount}/${row.contactCount} soit ${pct} % de taux de conversion`;
}

function toDashboardStatContact(contact: Contact): DashboardStatContact {
  return {
    contact_id: contact.id,
    nom: contact.nom,
    prenom: contact.prenom,
    categorie: contact.categorie,
    filleul_categorie: contact.filleul_categorie,
    date_r1: contact.date_r1,
    date_invitation_filleul: contact.date_invitation_filleul,
  };
}

function resolveInvestissementOpenContactId(
  inv: InvestissementWithDetails,
  contacts: Contact[]
): number | null {
  if (inv.contact_id != null) return inv.contact_id;
  if (inv.foyer_id == null) return null;
  const members = contacts
    .filter((c) => c.id != null && c.foyer_id === inv.foyer_id)
    .sort((a, b) => a.id! - b.id!);
  return members[0]?.id ?? null;
}

function SourceLeadDistributionRows<
  T extends { key: string; label: string; count: number; percent: number },
>({
  rows,
  total,
  icon: Icon,
  formatSubtitle,
  formatValue,
  getBarPercent,
  isInteractive: isInteractiveRow,
  onOpenRow,
}: {
  rows: T[];
  total: number;
  icon: LucideIcon;
  formatSubtitle: (row: T, total: number) => string;
  formatValue?: (row: T) => string;
  getBarPercent?: (row: T) => number;
  isInteractive?: (row: T) => boolean;
  onOpenRow: (row: T) => void;
}) {
  const barValues = rows.map((row) => getBarPercent?.(row) ?? row.count);
  const max = Math.max(...barValues, 1);

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const color = ROW_COLORS[index % ROW_COLORS.length];
        const barValue = getBarPercent?.(row) ?? row.count;
        const widthPct = barValue > 0 ? Math.max(8, (barValue / max) * 100) : 0;
        const interactive = isInteractiveRow ? isInteractiveRow(row) : row.count > 0;

        return (
          <div
            key={row.key}
            className={cn(
              "rounded-lg border border-border/50 bg-background/80 px-3 py-2.5 space-y-2",
              interactive && "cursor-pointer hover:bg-muted/30 transition-colors"
            )}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={interactive ? () => onOpenRow(row) : undefined}
            onKeyDown={
              interactive
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenRow(row);
                    }
                  }
                : undefined
            }
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${color}18`, color }}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{row.label}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatSubtitle(row, total)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-lg font-serif font-bold tabular-nums">
                  {formatValue ? formatValue(row) : row.count}
                </span>
                {interactive ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                ) : null}
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${widthPct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

type SourceLeadDistributionPanelProps = {
  panelId: StatistiquesPanelId;
  title: string;
  description: string;
  loading: boolean;
  total: number;
  totalLabel: string;
  totalHint: string;
  rows: ContactSourceLeadStatRow[];
  onOpenRow: (row: ContactSourceLeadStatRow) => void;
};

function SourceLeadDistributionPanel({
  panelId,
  title,
  description,
  loading,
  total,
  totalLabel,
  totalHint,
  rows,
  onOpenRow,
}: SourceLeadDistributionPanelProps) {
  return (
    <StatistiquesPanel title={title} description={description} collapsible panelId={panelId}>
      {loading ? (
        <ChartLoading />
      ) : total === 0 ? (
        <ChartEmpty title="Aucun contact éligible pour cette statistique." height={180} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{totalLabel}</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {total}
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-right max-w-xs">{totalHint}</p>
          </div>
          <SourceLeadDistributionRows
            rows={rows}
            total={total}
            icon={Users}
            formatSubtitle={(row, rowTotal) => formatDashboardPercent(row.count, rowTotal)}
            onOpenRow={onOpenRow}
          />
        </div>
      )}
    </StatistiquesPanel>
  );
}

type ConversionDistributionPanelProps = {
  panelId: StatistiquesPanelId;
  title: string;
  description: string;
  loading: boolean;
  rows: ContactSourceLeadInvestissementStatRow[];
  variant: "client" | "filleul";
  summaryLabel: string;
  summaryValue: number;
  summaryHint: string;
  onOpenRow: (row: ContactSourceLeadInvestissementStatRow) => void;
};

function ConversionDistributionPanel({
  panelId,
  title,
  description,
  loading,
  rows,
  variant,
  summaryLabel,
  summaryValue,
  summaryHint,
  onOpenRow,
}: ConversionDistributionPanelProps) {
  const isClient = variant === "client";

  return (
    <StatistiquesPanel title={title} description={description} collapsible panelId={panelId}>
      {loading ? (
        <ChartLoading />
      ) : rows.length === 0 ? (
        <ChartEmpty title="Aucun contact éligible pour cette statistique." height={180} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{summaryLabel}</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {summaryValue}
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-right max-w-xs">{summaryHint}</p>
          </div>
          <SourceLeadDistributionRows
            rows={rows}
            total={rows.reduce((sum, row) => sum + row.contactCount, 0)}
            icon={TrendingUp}
            formatSubtitle={(row) => formatSourceConversionSubtitle(row)}
            formatValue={
              isClient
                ? (row) => (row.montantCentimes > 0 ? formatEuroCentimes(row.montantCentimes) : "0 €")
                : (row) => `${row.conversionPercent.toFixed(0).replace(".0", "")} %`
            }
            getBarPercent={(row) => (isClient ? row.montantCentimes : row.conversionPercent)}
            isInteractive={(row) => row.contactCount > 0}
            onOpenRow={onOpenRow}
          />
        </div>
      )}
    </StatistiquesPanel>
  );
}

type ContactSourceLeadPanelProps = {
  onNavigate?: (page: string) => void;
};

export function ContactSourceLeadPanel({ onNavigate }: ContactSourceLeadPanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissements, setInvestissements] = useState<InvestissementWithDetails[]>([]);
  const [selfContactId, setSelfContactId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [contactsSheetOpen, setContactsSheetOpen] = useState(false);
  const [investissementsSheetOpen, setInvestissementsSheetOpen] = useState(false);
  const [selectedContactRow, setSelectedContactRow] = useState<ContactSourceLeadStatRow | null>(
    null
  );
  const [selectedContactLens, setSelectedContactLens] = useState<SourceLeadStatsLens>("client");
  const [selectedInvestissementRow, setSelectedInvestissementRow] =
    useState<ContactSourceLeadInvestissementStatRow | null>(null);

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
      console.error("Erreur chargement statistiques contacts:", error);
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
    return filterContactsBySourceLeadKey(
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
    (row: ContactSourceLeadStatRow, lens: SourceLeadStatsLens) => {
      setSelectedContactLens(lens);
      setSelectedContactRow(row);
      setContactsSheetOpen(true);
    },
    []
  );

  const openConversionRow = useCallback(
    (row: ContactSourceLeadInvestissementStatRow, lens: SourceLeadStatsLens) => {
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
        <SourceLeadDistributionPanel
          panelId="source_client"
          title="Source contact — Spécial client"
          description="Prospects et clients actifs avec le champ Source / lead renseigné sur la fiche."
          loading={loading}
          total={clientContactStats.total}
          totalLabel="Clients"
          totalHint="Exclus : suspects clients, prescripteurs, filleuls seuls. Un contact client+filleul est compté ici."
          rows={clientContactStats.rows}
          onOpenRow={(row) => openContactDistributionRow(row, "client")}
        />

        <SourceLeadDistributionPanel
          panelId="source_filleul"
          title="Source contact — Spécial filleul"
          description="Filleuls de votre réseau direct avec Source / lead — vous devez être leur parrain sur la fiche."
          loading={loading}
          total={filleulContactStats.total}
          totalLabel="Filleuls"
          totalHint="Prospects, inscrits et désinscrits. Exclus : suspects filleuls et filleuls d'un autre parrain."
          rows={filleulContactStats.rows}
          onOpenRow={(row) => openContactDistributionRow(row, "filleul")}
        />

        <ConversionDistributionPanel
          panelId="conversion_client"
          title="Conversion et volume — Spécial client"
          description="Par source : combien ont signé un investissement « avec moi », et combien d'euros au total."
          loading={loading}
          rows={clientConversionStats.rows}
          variant="client"
          summaryLabel="Supports"
          summaryValue={clientConversionStats.total}
          summaryHint={`${formatDashboardCurrency(clientConversionStats.totalMontantCentimes / 100)} souscrits`}
          onOpenRow={(row) => openConversionRow(row, "client")}
        />

        <ConversionDistributionPanel
          panelId="conversion_filleul"
          title="Conversion — Spécial filleul"
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
            ? `${formatSourceConversionSubtitle(selectedInvestissementRow)} · ${selectedInvestissementRow.count} support${selectedInvestissementRow.count > 1 ? "s" : ""}`
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
