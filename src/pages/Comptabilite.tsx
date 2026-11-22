import { useEffect, useMemo, useState } from "react";
import {
  CalendarSync,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  FileDown,
  FileSpreadsheet,
  CircleCheck,
  Loader2,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComptaBilanTab } from "@/components/compta/ComptaBilanTab";
import { ComptaCalendarSyncDialog } from "@/components/compta/ComptaCalendarSyncDialog";
import { ComptaConfigPanel } from "@/components/compta/ComptaConfigPanel";
import { ComptaDriveSyncDialog } from "@/components/compta/ComptaDriveSyncDialog";
import { ComptaDepensesTab } from "@/components/compta/ComptaDepensesTab";
import { ComptaEncaissementsTab } from "@/components/compta/ComptaEncaissementsTab";
import { ComptaDeplacementsTab } from "@/components/compta/ComptaDeplacementsTab";
import { ComptaJournalTab } from "@/components/compta/ComptaJournalTab";
import { ComptaMonthKpiBanner } from "@/components/compta/ComptaMonthKpiBanner";
import { useComptaBilanData } from "@/hooks/useComptaBilanData";
import { useComptaMonthData } from "@/hooks/useComptaMonthData";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { isComptaMonthClosed, setComptaMonthClosed } from "@/lib/api/tauri-compta";
import { exportComptaJournalCsv } from "@/lib/compta/compta-csv-export";
import { exportComptaJournalPdf } from "@/lib/compta/compta-pdf-export";
import { assertCanExport } from "@/lib/export/assert-can-export";
import { useCanExport } from "@/components/team/TeamWorkspaceProvider";
import { computeComptaAnnualSummary } from "@/lib/compta/compta-bilan";
import { isComptaDriveConfigured } from "@/lib/compta/compta-month-reminder";
import { formatComptaMonthLabel, shiftComptaMonth } from "@/lib/compta/compta-month";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/api/invoke-error";

export function Comptabilite() {
  const canExport = useCanExport();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [activeTab, setActiveTab] = useState("journal");
  const [bilanYear, setBilanYear] = useState(now.getFullYear());
  const [exportBusy, setExportBusy] = useState(false);
  const [driveSyncOpen, setDriveSyncOpen] = useState(false);
  const [calendarSyncOpen, setCalendarSyncOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [monthClosed, setMonthClosed] = useState(false);
  const [closingBusy, setClosingBusy] = useState(false);

  const {
    config,
    setConfig,
    depenses,
    encaissements,
    deplacements,
    loading,
    error,
    reload,
  } = useComptaMonthData(year, month);

  const bilanEvolutionEndYear = bilanYear === year ? year : bilanYear;
  const bilanEvolutionEndMonth = bilanYear === year ? month : 12;

  const {
    depenses: bilanDepenses,
    encaissements: bilanEncaissements,
    deplacements: bilanDeplacements,
    loading: bilanLoading,
    error: bilanError,
    reload: reloadBilan,
  } = useComptaBilanData(bilanYear, bilanEvolutionEndYear, bilanEvolutionEndMonth);

  const {
    depenses: prevBilanDepenses,
    encaissements: prevBilanEncaissements,
    deplacements: prevBilanDeplacements,
    loading: prevBilanLoading,
  } = useComptaBilanData(bilanYear - 1, bilanYear - 1, 12);

  const previousAnnual = useMemo(
    () =>
      computeComptaAnnualSummary(
        prevBilanEncaissements,
        prevBilanDepenses,
        prevBilanDeplacements,
        bilanYear - 1
      ),
    [prevBilanEncaissements, prevBilanDepenses, prevBilanDeplacements, bilanYear]
  );

  useEffect(() => {
    void isComptaMonthClosed(year, month).then(setMonthClosed);
  }, [year, month]);

  const monthLabel = useMemo(() => formatComptaMonthLabel(year, month), [year, month]);
  const driveConfigured = isComptaDriveConfigured(config);
  // Réglage ponctuel : replié derrière l'icône Réglages une fois complet.
  const configComplete = Boolean(
    config?.adresseDepart.trim() && config?.driveRootFolderId.trim()
  );
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

  const shiftMonth = (delta: number) => {
    const next = shiftComptaMonth(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
  };

  const goToToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  };

  const handleExportPdf = async () => {
    setExportBusy(true);
    try {
      assertCanExport(canExport);
      const cgp = await getCgpConfig();
      const owner = [cgp.prenom, cgp.nom].filter(Boolean).join(" ").trim() || "Cabinet";
      exportComptaJournalPdf({
        year,
        month,
        ownerLabel: owner,
        depenses,
        encaissements,
        deplacements,
      });
      toast.success("PDF exporté");
    } catch (e) {
      toast.error(userErrorMessage(e, "Impossible d'exporter le PDF"));
    } finally {
      setExportBusy(false);
    }
  };

  const handleExportCsv = () => {
    try {
      assertCanExport(canExport);
      exportComptaJournalCsv({ year, month, depenses, encaissements, deplacements });
      toast.success("CSV exporté");
    } catch (e) {
      toast.error(userErrorMessage(e, "Export impossible"));
    }
  };

  const toggleMonthClosed = async () => {
    setClosingBusy(true);
    try {
      const next = !monthClosed;
      await setComptaMonthClosed(year, month, next);
      setMonthClosed(next);
      toast.success(next ? "Mois marqué comme terminé" : "Mois remis en cours");
    } catch (e) {
      toast.error(userErrorMessage(e, "Impossible de modifier la clôture du mois"));
    } finally {
      setClosingBusy(false);
    }
  };

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Navigation : mois + statut */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border bg-card">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Mois précédent"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[140px] px-1 text-center font-semibold capitalize">
              {monthLabel}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Mois suivant"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {!isCurrentMonth ? (
            <Button type="button" variant="ghost" size="sm" onClick={goToToday}>
              Aujourd&apos;hui
            </Button>
          ) : null}
          {driveConfigured && monthClosed ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              <CircleCheck className="h-3.5 w-3.5" aria-hidden />
              Mois terminé
            </span>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={importMenuOpen} onOpenChange={setImportMenuOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={loading}>
                Importer
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  setImportMenuOpen(false);
                  setDriveSyncOpen(true);
                }}
              >
                <Cloud className="mr-2 h-4 w-4" />
                Synchroniser Drive
              </Button>
              {config ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    setImportMenuOpen(false);
                    setCalendarSyncOpen(true);
                  }}
                >
                  <CalendarSync className="mr-2 h-4 w-4" />
                  Synchroniser l&apos;agenda
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
          {canExport ? (
            <Popover open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={exportBusy || loading}>
                  {exportBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="mr-2 h-4 w-4" />
                  )}
                  Exporter
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    setExportMenuOpen(false);
                    void handleExportPdf();
                  }}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  PDF
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    setExportMenuOpen(false);
                    handleExportCsv();
                  }}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  CSV (tableur)
                </Button>
              </PopoverContent>
            </Popover>
          ) : null}
          {driveConfigured ? (
            <Button
              type="button"
              variant={monthClosed ? "ghost" : "outline"}
              size="sm"
              disabled={closingBusy || loading}
              aria-pressed={monthClosed}
              title={
                monthClosed
                  ? "Remettre le mois en cours (les saisies restent modifiables dans tous les cas)."
                  : "Repère personnel : indique que le mois est fini. Rien n'est verrouillé."
              }
              onClick={() => void toggleMonthClosed()}
            >
              <CircleCheck className="mr-2 h-4 w-4" />
              {monthClosed ? "Rouvrir le mois" : "Marquer terminé"}
            </Button>
          ) : null}
          {config && configComplete ? (
            <Button
              type="button"
              variant={configOpen ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Réglages comptabilité"
              aria-pressed={configOpen}
              onClick={() => setConfigOpen((v) => !v)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {bilanError ? <p className="text-sm text-destructive">{bilanError}</p> : null}

      {config && (!configComplete || configOpen) ? (
        <ComptaConfigPanel
          config={config}
          year={year}
          month={month}
          defaultOpen={configComplete}
          onSaved={(saved) => setConfig(saved)}
        />
      ) : null}

      <ComptaMonthKpiBanner
        depenses={depenses}
        encaissements={encaissements}
        deplacements={deplacements}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto w-auto flex-wrap justify-start gap-6 rounded-none border-b border-border/70 bg-transparent p-0">
          <TabsTrigger value="journal" className="gap-2 rounded-none border-b-2 border-transparent px-1 pb-2.5 pt-0 text-sm font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">Journal</TabsTrigger>
          <TabsTrigger value="depenses" className="gap-2 rounded-none border-b-2 border-transparent px-1 pb-2.5 pt-0 text-sm font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">
            Dépenses
            <span className="tabular-nums font-normal text-muted-foreground">{depenses.length}</span>
          </TabsTrigger>
          <TabsTrigger value="encaissements" className="gap-2 rounded-none border-b-2 border-transparent px-1 pb-2.5 pt-0 text-sm font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">
            Encaissements
            <span className="tabular-nums font-normal text-muted-foreground">
              {encaissements.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="deplacements" className="gap-2 rounded-none border-b-2 border-transparent px-1 pb-2.5 pt-0 text-sm font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">
            Déplacements
            <span className="tabular-nums font-normal text-muted-foreground">
              {deplacements.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="bilan" className="gap-2 rounded-none border-b-2 border-transparent px-1 pb-2.5 pt-0 text-sm font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">Bilan</TabsTrigger>
        </TabsList>

        <TabsContent value="journal" className="mt-4">
          <ComptaJournalTab
            depenses={depenses}
            encaissements={encaissements}
            deplacements={deplacements}
          />
        </TabsContent>
        <TabsContent value="depenses" className="mt-4">
          <ComptaDepensesTab year={year} month={month} depenses={depenses} onChanged={reload} />
        </TabsContent>
        <TabsContent value="encaissements" className="mt-4">
          <ComptaEncaissementsTab
            year={year}
            month={month}
            encaissements={encaissements}
            onChanged={reload}
          />
        </TabsContent>
        <TabsContent value="deplacements" className="mt-4">
          {config ? (
            <ComptaDeplacementsTab config={config} deplacements={deplacements} onChanged={reload} />
          ) : null}
        </TabsContent>
        <TabsContent value="bilan" className="mt-4">
          <ComptaBilanTab
            year={bilanYear}
            onYearChange={setBilanYear}
            evolutionEndYear={bilanEvolutionEndYear}
            evolutionEndMonth={bilanEvolutionEndMonth}
            depenses={bilanDepenses}
            encaissements={bilanEncaissements}
            deplacements={bilanDeplacements}
            previousAnnual={previousAnnual}
            previousLoading={prevBilanLoading}
            loading={bilanLoading}
          />
        </TabsContent>
      </Tabs>

      <ComptaDriveSyncDialog
        open={driveSyncOpen}
        onOpenChange={setDriveSyncOpen}
        year={year}
        month={month}
        onImported={async () => {
          await reload();
          await reloadBilan();
        }}
      />
      {config ? (
        <ComptaCalendarSyncDialog
          open={calendarSyncOpen}
          onOpenChange={setCalendarSyncOpen}
          year={year}
          month={month}
          config={config}
          onImported={async () => {
            await reload();
            await reloadBilan();
          }}
        />
      ) : null}
    </div>
  );
}
