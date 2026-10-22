import { useState } from "react";
import { AlertCircle, CircleUser, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactClientStatsPanel } from "@/components/statistiques/ContactClientStatsPanel";
import { ContactFilleulOrganisationPanel } from "@/components/statistiques/ContactFilleulOrganisationPanel";
import { StatistiquesPageToolbar } from "@/components/statistiques/StatistiquesPageToolbar";
import { StatistiquesSection } from "@/components/statistiques/statistiques-ui";
import {
  StatistiquesPageDataProvider,
  useStatistiquesPageData,
} from "@/components/statistiques/statistiques-page-data-context";
import { STATISTIQUES_SECTIONS, statistiquesSectionPanelCount } from "@/lib/statistiques/statistiques-sections";

type StatistiquesProps = {
  onNavigate?: (page: string) => void;
};

const SECTION_ICONS = {
  filleuls_organisation: Network,
  clients: CircleUser,
} as const;

/** Échec de chargement : sinon les panneaux affichent des zéros trompeurs. */
function StatistiquesLoadError() {
  const { loading, loadErrorSources, refreshData } = useStatistiquesPageData();
  const [retrying, setRetrying] = useState(false);
  if (loadErrorSources.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Impossible de charger les statistiques ({loadErrorSources.join(", ")}). Les chiffres
          affichés peuvent être incomplets ou à zéro.
        </span>
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={loading || retrying}
        onClick={() => {
          setRetrying(true);
          void refreshData().finally(() => setRetrying(false));
        }}
      >
        Réessayer
      </Button>
    </div>
  );
}

function StatistiquesContent({ onNavigate }: StatistiquesProps) {
  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-8">
      <StatistiquesPageToolbar />
      <StatistiquesLoadError />

      {STATISTIQUES_SECTIONS.map((section) => (
        <StatistiquesSection
          key={section.id}
          sectionId={section.id}
          title={section.title}
          intro={section.intro}
          icon={SECTION_ICONS[section.id]}
          panelCount={statistiquesSectionPanelCount(section.id)}
        >
          {section.id === "filleuls_organisation" ? (
            <ContactFilleulOrganisationPanel onNavigate={onNavigate} />
          ) : null}
          {section.id === "clients" ? <ContactClientStatsPanel onNavigate={onNavigate} /> : null}
        </StatistiquesSection>
      ))}
    </div>
  );
}

export function Statistiques({ onNavigate }: StatistiquesProps) {
  return (
    <StatistiquesPageDataProvider>
      <StatistiquesContent onNavigate={onNavigate} />
    </StatistiquesPageDataProvider>
  );
}
