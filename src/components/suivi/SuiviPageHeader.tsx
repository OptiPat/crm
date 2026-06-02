import { AlertCircle, Mail, RefreshCw, Settings2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SuiviMainTab } from "@/lib/navigation/suivi-navigation";

type SuiviStat = {
  id: SuiviMainTab;
  label: string;
  value: number;
  hint: string;
  icon: typeof AlertCircle;
  accent: string;
};

export function SuiviPageHeader({
  alertesCount,
  etiquettesContactsCount,
  readyEmailCount,
  activeTab,
  onTabChange,
  onSyncEtiquettes,
  syncingEtiquettes,
  loadingAlertes,
  onConfigureEtiquettes,
}: {
  alertesCount: number;
  etiquettesContactsCount: number;
  readyEmailCount: number;
  activeTab: SuiviMainTab;
  onTabChange: (tab: SuiviMainTab) => void;
  onSyncEtiquettes: () => void;
  syncingEtiquettes: boolean;
  loadingAlertes: boolean;
  onConfigureEtiquettes?: () => void;
}) {
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const stats: SuiviStat[] = [
    {
      id: "alertes",
      label: "Alertes",
      value: alertesCount,
      hint: "Dates de suivi à traiter",
      icon: AlertCircle,
      accent: "border-orange-200/80 bg-orange-50/60 hover:bg-orange-50",
    },
    {
      id: "etiquettes",
      label: "Contacts étiquetés",
      value: etiquettesContactsCount,
      hint: "Files de relance actives",
      icon: Tag,
      accent: "border-blue-200/80 bg-blue-50/60 hover:bg-blue-50",
    },
    {
      id: "envois",
      label: "Envois prêts",
      value: readyEmailCount,
      hint: "Étiquettes et modèles (déclencheur)",
      icon: Mail,
      accent: "border-emerald-200/80 bg-emerald-50/60 hover:bg-emerald-50",
    },
  ];

  return (
    <header className="space-y-5 border-b border-border/60 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground capitalize">{today}</p>
          <h2 className="text-3xl font-serif font-bold text-primary tracking-tight mt-1">
            Suivi &amp; alertes
          </h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">
            Priorités de relance, contacts étiquetés et file d&apos;envoi email.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onConfigureEtiquettes && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={onConfigureEtiquettes}
            >
              <Settings2 className="h-4 w-4" />
              Règles &amp; campagnes
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onSyncEtiquettes}
            disabled={syncingEtiquettes}
          >
            <RefreshCw className={cn("h-4 w-4", syncingEtiquettes && "animate-spin")} />
            Recalculer les règles auto
          </Button>
          {loadingAlertes && (
            <RefreshCw
              className="h-5 w-5 animate-spin text-muted-foreground"
              aria-label="Chargement des alertes"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const selected = activeTab === stat.id;
          return (
            <button
              key={stat.id}
              type="button"
              onClick={() => onTabChange(stat.id)}
              className={cn(
                "rounded-xl border p-4 text-left transition-all",
                stat.accent,
                selected && "ring-2 ring-primary/35 shadow-sm"
              )}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/80 shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold tabular-nums text-foreground leading-tight">
                    {stat.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{stat.hint}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </header>
  );
}
