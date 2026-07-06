import { useMemo, useState } from "react";
import { CalendarSync, ChevronLeft, ChevronRight, Cloud, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComptaBilanTab } from "@/components/compta/ComptaBilanTab";
import { ComptaCalendarSyncDialog } from "@/components/compta/ComptaCalendarSyncDialog";
import { ComptaConfigPanel } from "@/components/compta/ComptaConfigPanel";
import { ComptaDriveSyncDialog } from "@/components/compta/ComptaDriveSyncDialog";
import { ComptaDepensesTab } from "@/components/compta/ComptaDepensesTab";
import { ComptaEncaissementsTab } from "@/components/compta/ComptaEncaissementsTab";
import { ComptaDeplacementsTab } from "@/components/compta/ComptaDeplacementsTab";
import { ComptaJournalTab } from "@/components/compta/ComptaJournalTab";
import { useComptaBilanData } from "@/hooks/useComptaBilanData";
import { useComptaMonthData } from "@/hooks/useComptaMonthData";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { exportComptaJournalPdf } from "@/lib/compta/compta-pdf-export";
import { formatComptaMonthLabel, shiftComptaMonth } from "@/lib/compta/compta-month";
import { toast } from "sonner";

export function Comptabilite() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [exportBusy, setExportBusy] = useState(false);
  const [driveSyncOpen, setDriveSyncOpen] = useState(false);
  const [calendarSyncOpen, setCalendarSyncOpen] = useState(false);

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

  const {
    depenses: bilanDepenses,
    encaissements: bilanEncaissements,
    deplacements: bilanDeplacements,
    loading: bilanLoading,
    error: bilanError,
    reload: reloadBilan,
  } = useComptaBilanData(year, month);

  const monthLabel = useMemo(() => formatComptaMonthLabel(year, month), [year, month]);

  const shiftMonth = (delta: number) => {
    const next = shiftComptaMonth(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comptabilité</h1>
          <p className="text-sm text-muted-foreground">
            Journal mensuel — dépenses, encaissements et déplacements
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center font-medium capitalize">{monthLabel}</span>
          <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" disabled={loading} onClick={() => setDriveSyncOpen(true)}>
            <Cloud className="mr-2 h-4 w-4" />
            Sync Drive
          </Button>
          {config ? (
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => setCalendarSyncOpen(true)}
            >
              <CalendarSync className="mr-2 h-4 w-4" />
              Sync Agenda
            </Button>
          ) : null}
          <Button type="button" variant="secondary" disabled={exportBusy || loading} onClick={() => void handleExportPdf()}>
            {exportBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            Exporter PDF
          </Button>
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

      <Tabs defaultValue="depenses">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="depenses">
            Dépenses
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{depenses.length}</span>
          </TabsTrigger>
          <TabsTrigger value="encaissements">
            Encaissements
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{encaissements.length}</span>
          </TabsTrigger>
          <TabsTrigger value="deplacements">
            Déplacements
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{deplacements.length}</span>
          </TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="bilan">Bilan</TabsTrigger>
        </TabsList>

        <TabsContent value="depenses" className="mt-4">
          <ComptaDepensesTab depenses={depenses} onChanged={reload} />
        </TabsContent>
        <TabsContent value="encaissements" className="mt-4">
          <ComptaEncaissementsTab encaissements={encaissements} onChanged={reload} />
        </TabsContent>
        <TabsContent value="deplacements" className="mt-4">
          {config ? (
            <ComptaDeplacementsTab config={config} deplacements={deplacements} onChanged={reload} />
          ) : null}
        </TabsContent>
        <TabsContent value="journal" className="mt-4">
          <ComptaJournalTab
            depenses={depenses}
            encaissements={encaissements}
            deplacements={deplacements}
          />
        </TabsContent>
        <TabsContent value="bilan" className="mt-4">
          <ComptaBilanTab
            year={year}
            month={month}
            depenses={bilanDepenses}
            encaissements={bilanEncaissements}
            deplacements={bilanDeplacements}
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
