import { useEffect, useMemo, useState } from "react";
import {
  CalendarSync,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  FileDown,
  FileSpreadsheet,
  Loader2,
  Lock,
  Unlock,
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
import { computeComptaAnnualSummary } from "@/lib/compta/compta-bilan";
import { isComptaDriveConfigured } from "@/lib/compta/compta-month-reminder";
import { formatComptaMonthLabel, shiftComptaMonth } from "@/lib/compta/compta-month";
import { toast } from "sonner";

export function Comptabilite() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [activeTab, setActiveTab] = useState("journal");
  const [bilanYear, setBilanYear] = useState(now.getFullYear());
  const [exportBusy, setExportBusy] = useState(false);
  const [driveSyncOpen, setDriveSyncOpen] = useState(false);
  const [calendarSyncOpen, setCalendarSyncOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
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
      toast.error(e instanceof Error ? e.message : "Erreur export PDF");
    } finally {
      setExportBusy(false);
    }
  };

  const handleExportCsv = () => {
    exportComptaJournalCsv({ year, month, depenses, encaissements, deplacements });
    toast.success("CSV exporté");
  };

  const toggleMonthClosed = async () => {
    setClosingBusy(true);
    try {
      const next = !monthClosed;
      await setComptaMonthClosed(year, month, next);
      setMonthClosed(next);
      toast.success(next ? "Mois marqué comme clôturé" : "Mois rouvert");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
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
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comptabilité</h1>
          <p className="text-sm text-muted-foreground">
            Journal mensuel — dépenses, encaissements et déplacements
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border bg-background">
            <Button type="button" variant="ghost" size="icon" onClick={() => shiftMonth(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[140px] px-1 text-center font-medium capitalize">
              {monthLabel}
            </span>
            <Button type="button" variant="ghost" size="icon" onClick={() => shiftMonth(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isCurrentMonth}
            onClick={goToToday}
          >
            Aujourd&apos;hui
          </Button>
          <Popover open={importMenuOpen} onOpenChange={setImportMenuOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={loading}>
                Importer
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1">
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
                Sync Drive
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
                  Sync Agenda
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={exportBusy || loading}
            onClick={handleExportCsv}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={exportBusy || loading}
            onClick={() => void handleExportPdf()}
          >
            {exportBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            PDF
          </Button>
          {driveConfigured ? (
            <Button
              type="button"
              variant={monthClosed ? "secondary" : "outline"}
              size="sm"
              disabled={closingBusy || loading}
              title={
                monthClosed
                  ? "Rouvrir le mois pour le marquer comme en cours"
                  : "Marquer le mois comme terminé (sync Drive faite)"
              }
              onClick={() => void toggleMonthClosed()}
            >
              {monthClosed ? (
                <Lock className="mr-2 h-4 w-4" />
              ) : (
                <Unlock className="mr-2 h-4 w-4" />
              )}
              {monthClosed ? "Clôturé" : "Clôturer"}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {bilanError ? <p className="text-sm text-destructive">{bilanError}</p> : null}

      {config ? (
        <ComptaConfigPanel
          config={config}
          year={year}
          month={month}
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
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="depenses">
            Dépenses
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{depenses.length}</span>
          </TabsTrigger>
          <TabsTrigger value="encaissements">
            Encaissements
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
              {encaissements.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="deplacements">
            Déplacements
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
              {deplacements.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="bilan">Bilan</TabsTrigger>
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
