import type {
  OrganisationDiagnosticEntry,
  OrganisationDiagnosticSeverity,
} from "@/lib/statistiques/organisation-diagnostic";
import { cn } from "@/lib/utils";
import { ChartLoading } from "@/components/dashboard/dashboard-ui";
import { StatistiquesPanel } from "./statistiques-ui";

const SEVERITY_LABEL: Record<OrganisationDiagnosticSeverity, string> = {
  critical: "Critique",
  alert: "Alerte",
  watch: "À surveiller",
  ok: "Point fort",
};

const SEVERITY_BOX_CLASSES: Record<OrganisationDiagnosticSeverity, string> = {
  critical: "border-red-400 bg-red-100/80",
  alert: "border-red-200/80 bg-red-50/90",
  watch: "border-amber-200/80 bg-amber-50/90",
  ok: "border-emerald-200/80 bg-emerald-50/90",
};

const SEVERITY_BADGE_CLASSES: Record<OrganisationDiagnosticSeverity, string> = {
  critical: "bg-red-600 text-white",
  alert: "bg-red-100 text-red-800",
  watch: "bg-amber-100 text-amber-900",
  ok: "bg-emerald-100 text-emerald-800",
};

function DiagnosticEntryCard({ entry }: { entry: OrganisationDiagnosticEntry }) {
  return (
    <div className={cn("rounded-xl border px-4 py-3 space-y-1.5", SEVERITY_BOX_CLASSES[entry.severity])}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{entry.title}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            SEVERITY_BADGE_CLASSES[entry.severity]
          )}
        >
          {SEVERITY_LABEL[entry.severity]}
        </span>
      </div>
      <p className="text-xs text-foreground/80 whitespace-pre-line leading-relaxed">{entry.message}</p>
      <p className="text-xs text-muted-foreground italic">{entry.recommendation}</p>
    </div>
  );
}

export function OrganisationDiagnosticPanel({
  loading,
  entries,
}: {
  loading: boolean;
  entries: OrganisationDiagnosticEntry[];
}) {
  return (
    <StatistiquesPanel
      title="Diagnostic Organisation (brouillon)"
      description="Lecture croisée des indicateurs ci-dessous par rapport aux références groupe et à des seuils métier — synthèse expérimentale, pas encore une vérité absolue. Voir docs/DIAGNOSTIC_ORGANISATION.md pour le détail des règles."
      collapsible
      panelId="filleul_org_diagnostic"
    >
      {loading ? (
        <ChartLoading />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-2.5">
          Pas assez de données sur cet exercice pour établir un diagnostic.
        </p>
      ) : (
        <div className="space-y-2.5">
          {entries.map((entry) => (
            <DiagnosticEntryCard key={entry.ruleId} entry={entry} />
          ))}
        </div>
      )}
    </StatistiquesPanel>
  );
}
