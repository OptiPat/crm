import { useEffect, useState } from "react";
import { ArrowDown, CalendarCheck, Handshake, PenLine, UserCheck, Users } from "lucide-react";
import {
  getConversionClientStats,
  getConversionFilleulStats,
  type ConversionClientStats,
  type ConversionFilleulStats,
} from "@/lib/api/tauri-dashboard";
import { cn } from "@/lib/utils";
import { ChartEmpty, ChartLoading, DashboardPanel } from "./dashboard-ui";

type FunnelStep = {
  label: string;
  count: number;
  color: string;
  icon: typeof CalendarCheck;
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
        return (
          <div key={step.label}>
            {index > 0 && (
              <div className="flex justify-center py-1" aria-hidden>
                <ArrowDown className="h-4 w-4 text-muted-foreground/40" />
              </div>
            )}
            <div className="rounded-lg border border-border/50 bg-background/80 px-3 py-2.5 space-y-2">
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
                <span className="text-lg font-serif font-bold tabular-nums shrink-0">{step.count}</span>
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

function ClientConversionCard({ stats }: { stats: ConversionClientStats }) {
  const steps: FunnelStep[] = [
    {
      label: "R1 renseignés",
      count: stats.rdv_r1,
      color: "#3B82F6",
      icon: CalendarCheck,
    },
    {
      label: "Signés (avec moi)",
      count: stats.signatures,
      color: "#10B981",
      icon: PenLine,
    },
  ];

  if (stats.rdv_r1 === 0 && stats.signatures_portfolio === 0) {
    return (
      <DashboardPanel title="Conversion client" description="Premier RDV → solution patrimoniale avec vous">
        <ChartEmpty height={220} title="Aucun R1 renseigné" subtitle="Indiquez la date R1 sur vos contacts pour suivre le taux de conversion." />
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel
      title="Conversion client"
      description="Premier RDV → solution patrimoniale « avec moi »"
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
            Renseignez la <strong>date R1</strong> sur vos prospects pour activer le funnel de conversion.
          </p>
        )}
        {stats.signatures_portfolio > 0 && (
          <p className="text-xs text-muted-foreground border-t pt-3">
            Portefeuille signé « avec moi » :{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {stats.signatures_portfolio}
            </span>{" "}
            contact{stats.signatures_portfolio > 1 ? "s" : ""} (historique inclus)
          </p>
        )}
      </div>
    </DashboardPanel>
  );
}

function FilleulConversionCard({ stats }: { stats: ConversionFilleulStats }) {
  const steps: FunnelStep[] = [
    {
      label: "Invitations JD / PO",
      count: stats.invites,
      color: "#F59E0B",
      icon: Users,
    },
    {
      label: "Présents",
      count: stats.presents,
      color: "#3B82F6",
      icon: UserCheck,
    },
    {
      label: "Convertis en filleul",
      count: stats.convertis,
      color: "#10B981",
      icon: Handshake,
    },
  ];

  if (stats.invites === 0) {
    return (
      <DashboardPanel title="Conversion filleul" description="Invitation → présence → statut filleul">
        <ChartEmpty
          height={220}
          title="Aucune invitation enregistrée"
          subtitle="Indiquez une invitation JD ou PO sur vos contacts filleuls."
        />
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel title="Conversion filleul" description="Invitation → présence → statut filleul">
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
  );
}

export function ConversionFunnelPanel() {
  const [client, setClient] = useState<ConversionClientStats | null>(null);
  const [filleul, setFilleul] = useState<ConversionFilleulStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [c, f] = await Promise.all([
          getConversionClientStats(),
          getConversionFilleulStats(),
        ]);
        setClient(c);
        setFilleul(f);
      } catch (e) {
        console.error("Erreur stats conversion:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
      {client ? <ClientConversionCard stats={client} /> : null}
      {filleul ? <FilleulConversionCard stats={filleul} /> : null}
    </div>
  );
}
