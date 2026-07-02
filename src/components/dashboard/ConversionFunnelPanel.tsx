import { useCallback, useEffect, useState } from "react";
import { ArrowDown, CalendarCheck, ChevronRight, Handshake, PenLine, UserCheck, Users } from "lucide-react";
import {
  getConversionClientContacts,
  getConversionClientStats,
  getConversionFilleulContacts,
  getConversionFilleulStats,
  type ConversionClientSegment,
  type ConversionClientStats,
  type ConversionFilleulSegment,
  type ConversionFilleulStats,
} from "@/lib/api/tauri-dashboard";
import { cn } from "@/lib/utils";
import { DashboardStatContactsSheet } from "./DashboardStatContactsSheet";
import type { DashboardDrillDownOpenContact } from "@/lib/dashboard/dashboard-drill-down";
import { ChartEmpty, ChartLoading, DashboardPanel } from "./dashboard-ui";

type FunnelStep = {
  label: string;
  count: number;
  color: string;
  icon: typeof CalendarCheck;
  onClick?: () => void;
};

function formatRate(rate: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${rate.toFixed(1)} %`;
}

function FunnelHero({
  label,
  value,
  accentClass,
}: {
  label: string;
  value: string;
  accentClass: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5", accentClass)}>
          {value}
        </p>
      </div>
    </div>
  );
}

function FunnelSteps({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1);

  return (
    <div className="space-y-1">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const widthPct = step.count > 0 ? Math.max(8, (step.count / max) * 100) : 0;
        const interactive = Boolean(step.onClick) && step.count > 0;
        return (
          <div key={step.label}>
            {index > 0 && (
              <div className="flex justify-center py-1" aria-hidden>
                <ArrowDown className="h-4 w-4 text-muted-foreground/40" />
              </div>
            )}
            <div
              className={cn(
                "rounded-lg border border-border/50 bg-background/80 px-3 py-2.5 space-y-2",
                interactive && "cursor-pointer hover:bg-muted/30 transition-colors"
              )}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              onClick={interactive ? step.onClick : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        step.onClick?.();
                      }
                    }
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${step.color}18`, color: step.color }}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                  <span className="text-sm font-medium truncate">{step.label}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-lg font-serif font-bold tabular-nums">{step.count}</span>
                  {interactive ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                  ) : null}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${widthPct}%`, backgroundColor: step.color }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClientConversionCard({
  stats,
  periodLabel,
  periodStart,
  periodEnd,
  onOpenContact,
  dataRefreshSignal = 0,
  activeContactId,
}: {
  stats: ConversionClientStats;
  periodLabel: string;
  periodStart: number;
  periodEnd: number;
  onOpenContact?: DashboardDrillDownOpenContact;
  dataRefreshSignal?: number;
  activeContactId?: number | null;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [segment, setSegment] = useState<ConversionClientSegment>("r1");
  const [sheetTitle, setSheetTitle] = useState("");

  const openSegment = useCallback(
    (next: ConversionClientSegment, title: string) => {
      if (!onOpenContact) return;
      setSegment(next);
      setSheetTitle(title);
      setSheetOpen(true);
    },
    [onOpenContact]
  );

  const loadContacts = useCallback(
    () => getConversionClientContacts(periodStart, periodEnd, segment),
    [periodStart, periodEnd, segment]
  );

  const steps: FunnelStep[] = [
    {
      label: "R1 renseignés",
      count: stats.rdv_r1,
      color: "#3B82F6",
      icon: CalendarCheck,
      onClick: () => openSegment("r1", "R1 renseignés"),
    },
    {
      label: "Signés (avec moi)",
      count: stats.signatures,
      color: "#10B981",
      icon: PenLine,
      onClick: () => openSegment("signatures", "Signés (avec moi)"),
    },
  ];

  if (stats.rdv_r1 === 0 && stats.signatures_portfolio === 0) {
    return (
      <DashboardPanel
        title="Conversion client"
        description={`Premier RDV → solution patrimoniale « avec moi » · ${periodLabel}`}
      >
        <ChartEmpty
          height={220}
          title="Aucun R1 sur la période"
          subtitle="Élargissez la plage de dates ou renseignez la date R1 sur vos contacts."
        />
      </DashboardPanel>
    );
  }

  return (
    <>
      <DashboardPanel
        title="Conversion client"
        description={
          onOpenContact
            ? `Premier RDV → solution « avec moi » · ${periodLabel} — cliquer une étape pour la liste`
            : `Premier RDV → solution patrimoniale « avec moi » · ${periodLabel}`
        }
      >
        <div className="space-y-4">
          <FunnelHero
            label="Taux R1 → signature"
            value={formatRate(stats.taux_conversion, stats.rdv_r1)}
            accentClass="text-emerald-700"
          />
          {stats.rdv_r1 > 0 ? (
            <FunnelSteps steps={steps} />
          ) : (
            <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-3 py-2.5">
              Aucun R1 sur la période sélectionnée. Élargissez la plage ou renseignez la{" "}
              <strong>date R1</strong> sur vos prospects.
            </p>
          )}
          {stats.signatures_portfolio > 0 && (
            <button
              type="button"
              className={cn(
                "text-xs text-muted-foreground border-t pt-3 w-full text-left",
                onOpenContact && "hover:text-foreground transition-colors cursor-pointer"
              )}
              disabled={!onOpenContact}
              onClick={() =>
                openSegment("portfolio", "Portefeuille signé « avec moi » sur la période")
              }
            >
              Portefeuille signé « avec moi » :{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {stats.signatures_portfolio}
              </span>{" "}
              contact{stats.signatures_portfolio > 1 ? "s" : ""} sur la période
              {onOpenContact ? " → voir la liste" : null}
            </button>
          )}
        </div>
      </DashboardPanel>

      <DashboardStatContactsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={sheetTitle}
        description="Cliquer un contact pour ouvrir sa fiche"
        loadContacts={loadContacts}
        refreshSignal={dataRefreshSignal}
        activeContactId={activeContactId}
        onOpenContact={onOpenContact}
      />
    </>
  );
}

function FilleulConversionCard({
  stats,
  periodLabel,
  periodStart,
  periodEnd,
  onOpenContact,
  dataRefreshSignal = 0,
  activeContactId,
}: {
  stats: ConversionFilleulStats;
  periodLabel: string;
  periodStart: number;
  periodEnd: number;
  onOpenContact?: DashboardDrillDownOpenContact;
  dataRefreshSignal?: number;
  activeContactId?: number | null;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [segment, setSegment] = useState<ConversionFilleulSegment>("invites");
  const [sheetTitle, setSheetTitle] = useState("");

  const openSegment = useCallback(
    (next: ConversionFilleulSegment, title: string) => {
      if (!onOpenContact) return;
      setSegment(next);
      setSheetTitle(title);
      setSheetOpen(true);
    },
    [onOpenContact]
  );

  const loadContacts = useCallback(
    () => getConversionFilleulContacts(periodStart, periodEnd, segment),
    [periodStart, periodEnd, segment]
  );

  const steps: FunnelStep[] = [
    {
      label: "Invitations JD / PO",
      count: stats.invites,
      color: "#F59E0B",
      icon: Users,
      onClick: () => openSegment("invites", "Invitations JD / PO"),
    },
    {
      label: "Présents",
      count: stats.presents,
      color: "#3B82F6",
      icon: UserCheck,
      onClick: () => openSegment("presents", "Présents"),
    },
    {
      label: "Convertis en filleul",
      count: stats.convertis,
      color: "#10B981",
      icon: Handshake,
      onClick: () => openSegment("convertis", "Convertis en filleul"),
    },
  ];

  if (stats.invites === 0) {
    return (
      <DashboardPanel
        title="Conversion filleul"
        description={`Invitation → présence → statut filleul · ${periodLabel}`}
      >
        <ChartEmpty
          height={220}
          title="Aucune invitation sur la période"
          subtitle="Indiquez une invitation JD ou PO sur vos contacts filleuls."
        />
      </DashboardPanel>
    );
  }

  return (
    <>
      <DashboardPanel
        title="Conversion filleul"
        description={
          onOpenContact
            ? `Invitation → filleul · ${periodLabel} — cliquer une étape pour la liste`
            : `Invitation → présence → statut filleul · ${periodLabel}`
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FunnelHero
              label="Taux de présence"
              value={formatRate(stats.taux_presence, stats.invites)}
              accentClass="text-blue-700"
            />
            <FunnelHero
              label="Taux de conversion"
              value={formatRate(stats.taux_conversion, stats.invites)}
              accentClass="text-emerald-700"
            />
          </div>
          <FunnelSteps steps={steps} />
        </div>
      </DashboardPanel>

      <DashboardStatContactsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={sheetTitle}
        description="Cliquer un contact pour ouvrir sa fiche"
        loadContacts={loadContacts}
        refreshSignal={dataRefreshSignal}
        activeContactId={activeContactId}
        onOpenContact={onOpenContact}
      />
    </>
  );
}

interface ConversionFunnelPanelProps {
  periodStart: number;
  periodEnd: number;
  periodLabel: string;
  dataRefreshSignal?: number;
  activeContactId?: number | null;
  onOpenContact?: DashboardDrillDownOpenContact;
}

export function ConversionFunnelPanel({
  periodStart,
  periodEnd,
  periodLabel,
  dataRefreshSignal = 0,
  activeContactId,
  onOpenContact,
}: ConversionFunnelPanelProps) {
  const [client, setClient] = useState<ConversionClientStats | null>(null);
  const [filleul, setFilleul] = useState<ConversionFilleulStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [c, f] = await Promise.all([
          getConversionClientStats(periodStart, periodEnd),
          getConversionFilleulStats(periodStart, periodEnd),
        ]);
        setClient(c);
        setFilleul(f);
      } catch (e) {
        console.error("Erreur stats conversion:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [periodStart, periodEnd, dataRefreshSignal]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartLoading height={280} />
        <ChartLoading height={280} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
      {client ? (
        <ClientConversionCard
          stats={client}
          periodLabel={periodLabel}
          periodStart={periodStart}
          periodEnd={periodEnd}
          dataRefreshSignal={dataRefreshSignal}
          activeContactId={activeContactId}
          onOpenContact={onOpenContact}
        />
      ) : null}
      {filleul ? (
        <FilleulConversionCard
          stats={filleul}
          periodLabel={periodLabel}
          periodStart={periodStart}
          periodEnd={periodEnd}
          dataRefreshSignal={dataRefreshSignal}
          activeContactId={activeContactId}
          onOpenContact={onOpenContact}
        />
      ) : null}
    </div>
  );
}
