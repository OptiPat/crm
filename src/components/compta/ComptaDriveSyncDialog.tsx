import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createComptaEncaissement,
  type NewComptaEncaissement,
} from "@/lib/api/tauri-compta";
import {
  downloadComptaDriveFile,
  importComptaDriveDepense,
  scanComptaDriveMonth,
  type ComptaDriveFileStatus,
  type ComptaDriveScanResponse,
} from "@/lib/api/tauri-compta-sync";
import { COMPTA_CATEGORIES } from "@/lib/compta/compta-constants";
import { extractComptaDepenseFromText } from "@/lib/compta/compta-depense-extract";
import { extractComptaInvoiceFromText } from "@/lib/compta/compta-invoice-extract";
import {
  computeDepenseHt,
  computeEncaissementTotals,
  formatComptaMoney,
} from "@/lib/compta/compta-money";
import { openComptaDriveLink } from "@/lib/compta/compta-drive";
import { extractTextFromPDFPath } from "@/lib/pdf/extractor";
import { toast } from "sonner";

interface ComptaDriveSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
  onImported: () => Promise<void>;
}

type EncDraft = {
  client: string;
  date: string;
  exonere: string;
  ht: string;
  tva: string;
  don: string;
  confidence: "low" | "medium" | "high";
  status: "loading" | "ready" | "error";
  error?: string;
};

type DepDraft = {
  date: string;
  categorie: string;
  tiers: string;
  ttc: string;
  tva: string;
  ht: string;
  confidence: "low" | "medium" | "high";
  documentKind: "invoice" | "bank_statement";
  currency: "EUR" | "USD";
  status: "loading" | "ready" | "error";
  error?: string;
};

function dateFromModified(modifiedTime?: string | null): string {
  if (!modifiedTime) return new Date().toISOString().split("T")[0]!;
  return modifiedTime.slice(0, 10);
}

function tiersFromFileName(name: string): string {
  return name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim();
}

function parsedToDraft(
  parsed: ReturnType<typeof extractComptaInvoiceFromText>
): Omit<EncDraft, "status"> {
  return {
    client: parsed.client,
    date: parsed.date,
    exonere: String(parsed.exonere),
    ht: String(parsed.ht),
    tva: String(parsed.tva),
    don: String(parsed.don),
    confidence: parsed.confidence,
  };
}

function parsedDepToDraft(
  parsed: ReturnType<typeof extractComptaDepenseFromText>
): Omit<DepDraft, "status"> {
  return {
    date: parsed.date,
    categorie: parsed.suggestedCategorie,
    tiers: parsed.tiers,
    ttc: String(parsed.ttc),
    tva: String(parsed.tva),
    ht: String(parsed.ht),
    confidence: parsed.confidence,
    documentKind: parsed.documentKind,
    currency: parsed.currency,
  };
}

function validateEncDraft(draft: EncDraft): string | null {
  if (!draft.client.trim()) return "Client requis";
  return null;
}

function validateDepDraft(draft: DepDraft): string | null {
  const isBankStatement =
    draft.documentKind === "bank_statement" || draft.categorie === "Relevé de compte";
  if (!draft.categorie.trim()) return "Catégorie requise";
  const tiers = draft.tiers.trim() || (isBankStatement ? "La Banque Postale" : "");
  if (!tiers) return "Tiers requis";
  const ttc = parseFloat(draft.ttc) || 0;
  if (!isBankStatement && ttc <= 0) return "Montant TTC requis";
  return null;
}

function SelectionToolbar({
  selectedCount,
  readyCount,
  batchBusy,
  onSelectAll,
  onDeselectAll,
  onImportSelected,
  importLabel,
}: {
  selectedCount: number;
  readyCount: number;
  batchBusy: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onImportSelected: () => void;
  importLabel: string;
}) {
  if (readyCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={batchBusy} onClick={onSelectAll}>
          Tout cocher
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={batchBusy} onClick={onDeselectAll}>
          Tout décocher
        </Button>
        <span className="text-xs text-muted-foreground">
          {selectedCount} sélectionné{selectedCount > 1 ? "s" : ""} sur {readyCount}
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={batchBusy || selectedCount === 0}
        onClick={onImportSelected}
      >
        {batchBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {importLabel} ({selectedCount})
      </Button>
    </div>
  );
}

export function ComptaDriveSyncDialog({
  open,
  onOpenChange,
  year,
  month,
  onImported,
}: ComptaDriveSyncDialogProps) {
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [scan, setScan] = useState<ComptaDriveScanResponse | null>(null);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [batchImporting, setBatchImporting] = useState(false);
  const [selectedEnc, setSelectedEnc] = useState<Record<string, boolean>>({});
  const [selectedDep, setSelectedDep] = useState<Record<string, boolean>>({});
  const [encDrafts, setEncDrafts] = useState<Record<string, EncDraft>>({});
  const [depDrafts, setDepDrafts] = useState<Record<string, DepDraft>>({});
  const [extractProgress, setExtractProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  /** Annule extractions en cours (fermeture dialog, nouvel actualiser, StrictMode). */
  const batchGenRef = useRef(0);

  const extractEncaissementFile = useCallback(
    async (file: ComptaDriveFileStatus, batchGen: number) => {
      if (batchGen !== batchGenRef.current) return;

      setEncDrafts((prev) => ({
        ...prev,
        [file.id]: {
          client: "",
          date: dateFromModified(file.modifiedTime),
          exonere: "0",
          ht: "",
          tva: "",
          don: "0",
          confidence: "low",
          status: "loading",
        },
      }));

      try {
        const path = await downloadComptaDriveFile(file.id, file.name);
        if (batchGen !== batchGenRef.current) return;

        const extracted = await extractTextFromPDFPath(path);
        if (batchGen !== batchGenRef.current) return;

        const parsed = extractComptaInvoiceFromText(extracted.text, file.name);
        setEncDrafts((prev) => ({
          ...prev,
          [file.id]: { ...parsedToDraft(parsed), status: "ready" },
        }));
        setSelectedEnc((prev) => ({ ...prev, [file.id]: true }));
      } catch (e) {
        if (batchGen !== batchGenRef.current) return;
        const message = e instanceof Error ? e.message : "Extraction PDF échouée";
        setEncDrafts((prev) => ({
          ...prev,
          [file.id]: {
            client: "",
            date: dateFromModified(file.modifiedTime),
            exonere: "0",
            ht: "",
            tva: "",
            don: "0",
            confidence: "low",
            status: "error",
            error: message,
          },
        }));
      }
    },
    []
  );

  const extractDepenseFile = useCallback(
    async (file: ComptaDriveFileStatus, batchGen: number) => {
      if (batchGen !== batchGenRef.current) return;

      setDepDrafts((prev) => ({
        ...prev,
        [file.id]: {
          date: dateFromModified(file.modifiedTime),
          categorie: "",
          tiers: tiersFromFileName(file.name),
          ttc: "",
          tva: "",
          ht: "",
          confidence: "low",
          documentKind: "invoice",
          currency: "EUR",
          status: "loading",
        },
      }));

      try {
        const path = await downloadComptaDriveFile(file.id, file.name);
        if (batchGen !== batchGenRef.current) return;

        const extracted = await extractTextFromPDFPath(path);
        if (batchGen !== batchGenRef.current) return;

        const parsed = extractComptaDepenseFromText(extracted.text, file.name);
        setDepDrafts((prev) => ({
          ...prev,
          [file.id]: { ...parsedDepToDraft(parsed), status: "ready" },
        }));
        setSelectedDep((prev) => ({ ...prev, [file.id]: true }));
      } catch (e) {
        if (batchGen !== batchGenRef.current) return;
        const message = e instanceof Error ? e.message : "Extraction PDF échouée";
        setDepDrafts((prev) => ({
          ...prev,
          [file.id]: {
            date: dateFromModified(file.modifiedTime),
            categorie: "",
            tiers: tiersFromFileName(file.name),
            ttc: "",
            tva: "",
            ht: "",
            confidence: "low",
            documentKind: "invoice",
            currency: "EUR",
            status: "error",
            error: message,
          },
        }));
      }
    },
    []
  );

  const loadScan = useCallback(async () => {
    batchGenRef.current += 1;
    const batchGen = batchGenRef.current;
    setLoading(true);
    setExtracting(false);
    setExtractProgress(null);
    setEncDrafts({});
    setDepDrafts({});
    setSelectedEnc({});
    setSelectedDep({});
    try {
      const result = await scanComptaDriveMonth(year, month);
      if (batchGen !== batchGenRef.current) return;

      setScan(result);
      const pendingEnc = result.encaissementsFiles.filter((f) => !f.alreadyImported);
      const pendingDep = result.depensesFiles.filter((f) => !f.alreadyImported);
      const totalExtract = pendingEnc.length + pendingDep.length;
      if (totalExtract === 0) return;

      setExtracting(true);
      setExtractProgress({ done: 0, total: totalExtract });

      let done = 0;
      for (let i = 0; i < pendingEnc.length; i++) {
        if (batchGen !== batchGenRef.current) break;
        await extractEncaissementFile(pendingEnc[i]!, batchGen);
        if (batchGen !== batchGenRef.current) break;
        done += 1;
        setExtractProgress({ done, total: totalExtract });
      }
      for (let i = 0; i < pendingDep.length; i++) {
        if (batchGen !== batchGenRef.current) break;
        await extractDepenseFile(pendingDep[i]!, batchGen);
        if (batchGen !== batchGenRef.current) break;
        done += 1;
        setExtractProgress({ done, total: totalExtract });
      }
    } catch (e) {
      if (batchGen !== batchGenRef.current) return;
      toast.error(e instanceof Error ? e.message : "Erreur scan Drive");
      setScan(null);
    } finally {
      if (batchGen === batchGenRef.current) {
        setLoading(false);
        setExtracting(false);
        setExtractProgress(null);
      }
    }
  }, [year, month, extractEncaissementFile, extractDepenseFile]);

  useEffect(() => {
    if (!open) return;
    void loadScan();
    return () => {
      batchGenRef.current += 1;
    };
  }, [open, loadScan]);

  const updateEncDraft = (fileId: string, patch: Partial<EncDraft>) => {
    setEncDrafts((prev) => {
      const current = prev[fileId];
      if (!current) return prev;
      return { ...prev, [fileId]: { ...current, ...patch } };
    });
  };

  const markFileImported = useCallback(
    (fileId: string, kind: "encaissements" | "depenses") => {
      setScan((prev) => {
        if (!prev) return prev;
        const key = kind === "encaissements" ? "encaissementsFiles" : "depensesFiles";
        return {
          ...prev,
          [key]: prev[key].map((f) =>
            f.id === fileId ? { ...f, alreadyImported: true } : f
          ),
        };
      });
      setEncDrafts((prev) => {
        if (!(fileId in prev)) return prev;
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      setDepDrafts((prev) => {
        if (!(fileId in prev)) return prev;
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      setSelectedEnc((prev) => {
        if (!(fileId in prev)) return prev;
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      setSelectedDep((prev) => {
        if (!(fileId in prev)) return prev;
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    },
    []
  );

  const updateDepDraft = (fileId: string, patch: Partial<DepDraft>) => {
    setDepDrafts((prev) => {
      const current = prev[fileId];
      if (!current) return prev;
      const next = { ...current, ...patch };
      if ("ttc" in patch || "tva" in patch) {
        const ttc = parseFloat(next.ttc) || 0;
        const tva = parseFloat(next.tva) || 0;
        next.ht = String(computeDepenseHt(ttc, tva));
      }
      return { ...prev, [fileId]: next };
    });
  };

  const importEncaissement = async (
    file: ComptaDriveFileStatus,
    draft: EncDraft,
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    const validationError = validateEncDraft(draft);
    if (validationError) {
      if (!options?.silent) toast.error(validationError);
      return false;
    }
    const exonere = parseFloat(draft.exonere) || 0;
    const ht = parseFloat(draft.ht) || 0;
    const tva = parseFloat(draft.tva) || 0;
    const don = parseFloat(draft.don) || 0;
    const { ttc, total } = computeEncaissementTotals(exonere, ht, tva, don);
    const payload: NewComptaEncaissement = {
      client: draft.client.trim(),
      date: draft.date,
      exonere,
      ht,
      tva,
      ttc,
      total,
      don,
      isPartenaire: false,
      lienDrive: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
      sourceDriveFileId: file.id,
    };
    if (!options?.silent) setBusyFileId(file.id);
    try {
      await createComptaEncaissement(payload);
      if (!options?.silent) toast.success(`Encaissement importé : ${file.name}`);
      markFileImported(file.id, "encaissements");
      return true;
    } catch (e) {
      if (!options?.silent) {
        toast.error(e instanceof Error ? e.message : "Import encaissement échoué");
      }
      return false;
    } finally {
      if (!options?.silent) setBusyFileId(null);
    }
  };

  const importDepense = async (
    file: ComptaDriveFileStatus,
    draft: DepDraft,
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    const validationError = validateDepDraft(draft);
    if (validationError) {
      if (!options?.silent) toast.error(validationError);
      return false;
    }
    const isBankStatement =
      draft.documentKind === "bank_statement" || draft.categorie === "Relevé de compte";
    const ttc = parseFloat(draft.ttc) || 0;
    const tva = parseFloat(draft.tva) || 0;
    const ht = parseFloat(draft.ht) || computeDepenseHt(ttc, tva);
    const tiers = draft.tiers.trim() || (isBankStatement ? "La Banque Postale" : "");
    if (draft.currency === "USD" && !isBankStatement && !options?.silent) {
      toast.warning(
        "Montants en dollars — convertissez en euros avant validation comptable si besoin."
      );
    }
    if (!options?.silent) setBusyFileId(file.id);
    try {
      await importComptaDriveDepense({
        fileId: file.id,
        fileName: file.name,
        webViewLink: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
        date: draft.date,
        categorie: draft.categorie,
        tiers,
        ttc,
        tva,
        ht,
      });
      if (!options?.silent) {
        toast.success(
          isBankStatement ? `Relevé archivé : ${file.name}` : `Dépense importée : ${file.name}`
        );
      }
      markFileImported(file.id, "depenses");
      return true;
    } catch (e) {
      if (!options?.silent) {
        toast.error(e instanceof Error ? e.message : "Import dépense échoué");
      }
      return false;
    } finally {
      if (!options?.silent) setBusyFileId(null);
    }
  };

  const readyEncFiles =
    scan?.encaissementsFiles.filter(
      (f) => !f.alreadyImported && encDrafts[f.id]?.status === "ready"
    ) ?? [];
  const readyDepFiles =
    scan?.depensesFiles.filter(
      (f) => !f.alreadyImported && depDrafts[f.id]?.status === "ready"
    ) ?? [];
  const selectedEncCount = readyEncFiles.filter((f) => selectedEnc[f.id]).length;
  const selectedDepCount = readyDepFiles.filter((f) => selectedDep[f.id]).length;

  const importSelectedEncaissements = async () => {
    const files = readyEncFiles.filter((f) => selectedEnc[f.id]);
    if (files.length === 0) {
      toast.error("Aucun encaissement sélectionné");
      return;
    }
    setBatchImporting(true);
    let ok = 0;
    let fail = 0;
    for (const file of files) {
      const draft = encDrafts[file.id];
      if (!draft) continue;
      const success = await importEncaissement(file, draft, { silent: true });
      if (success) ok += 1;
      else fail += 1;
    }
    setBatchImporting(false);
    if (ok > 0) await onImported();
    if (fail === 0) {
      toast.success(`${ok} encaissement${ok > 1 ? "s" : ""} importé${ok > 1 ? "s" : ""}`);
    } else {
      toast.warning(`${ok} importé(s), ${fail} échec(s)`);
    }
  };

  const importSelectedDepenses = async () => {
    const files = readyDepFiles.filter((f) => selectedDep[f.id]);
    if (files.length === 0) {
      toast.error("Aucune dépense sélectionnée");
      return;
    }
    const hasUsd = files.some((f) => {
      const d = depDrafts[f.id];
      return d?.currency === "USD" && d.documentKind !== "bank_statement";
    });
    if (hasUsd) {
      toast.warning(
        "La sélection contient des montants USD — vérifiez la conversion en euros si besoin."
      );
    }
    setBatchImporting(true);
    let ok = 0;
    let fail = 0;
    for (const file of files) {
      const draft = depDrafts[file.id];
      if (!draft) continue;
      const success = await importDepense(file, draft, { silent: true });
      if (success) ok += 1;
      else fail += 1;
    }
    setBatchImporting(false);
    if (ok > 0) await onImported();
    if (fail === 0) {
      toast.success(`${ok} dépense${ok > 1 ? "s" : ""} importée${ok > 1 ? "s" : ""}`);
    } else {
      toast.warning(`${ok} importée(s), ${fail} échec(s)`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,72rem)] max-w-[72rem] flex-col gap-0 overflow-hidden p-0 sm:max-w-[72rem]">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Synchroniser Google Drive</DialogTitle>
          <DialogDescription>
            Extraction automatique à l&apos;ouverture (encaissements et dépenses), revue inline
            puis import.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Scan Drive en cours…
            </div>
          ) : scan ? (
            <Tabs defaultValue="encaissements">
              <TabsList>
                <TabsTrigger value="encaissements">
                  Encaissements ({scan.encaissementsFiles.length})
                </TabsTrigger>
                <TabsTrigger value="depenses">
                  Dépenses ({scan.depensesFiles.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="encaissements" className="mt-4 space-y-4">
                {extracting && extractProgress ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyse PDF {extractProgress.done}/{extractProgress.total}…
                  </p>
                ) : null}
                {!scan.encaissementsFolderId ? (
                  <p className="text-sm text-muted-foreground">
                    Dossier introuvable : {scan.encaissementsFolderName}
                  </p>
                ) : scan.encaissementsFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun PDF dans ce dossier.</p>
                ) : (
                  <>
                    <SelectionToolbar
                      selectedCount={selectedEncCount}
                      readyCount={readyEncFiles.length}
                      batchBusy={batchImporting || extracting}
                      onSelectAll={() => {
                        const next: Record<string, boolean> = {};
                        for (const f of readyEncFiles) next[f.id] = true;
                        setSelectedEnc(next);
                      }}
                      onDeselectAll={() => setSelectedEnc({})}
                      onImportSelected={() => void importSelectedEncaissements()}
                      importLabel="Importer la sélection"
                    />
                    {scan.encaissementsFiles.map((file) => (
                      <EncaissementFileRow
                        key={file.id}
                        file={file}
                        draft={encDrafts[file.id]}
                        busy={busyFileId === file.id || batchImporting}
                        selected={Boolean(selectedEnc[file.id])}
                        onSelectedChange={(checked) =>
                          setSelectedEnc((prev) => ({ ...prev, [file.id]: checked }))
                        }
                        onDraftChange={(patch) => updateEncDraft(file.id, patch)}
                        onImport={async (draft) => {
                          const ok = await importEncaissement(file, draft);
                          if (ok) await onImported();
                        }}
                        onRetry={() =>
                          void extractEncaissementFile(file, batchGenRef.current)
                        }
                      />
                    ))}
                  </>
                )}
              </TabsContent>

              <TabsContent value="depenses" className="mt-4 space-y-4">
                {extracting && extractProgress ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyse PDF {extractProgress.done}/{extractProgress.total}…
                  </p>
                ) : null}
                {!scan.depensesFolderId ? (
                  <p className="text-sm text-muted-foreground">
                    Dossier introuvable : {scan.depensesFolderName}
                  </p>
                ) : scan.depensesFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun PDF dans ce dossier.</p>
                ) : (
                  <>
                    <SelectionToolbar
                      selectedCount={selectedDepCount}
                      readyCount={readyDepFiles.length}
                      batchBusy={batchImporting || extracting}
                      onSelectAll={() => {
                        const next: Record<string, boolean> = {};
                        for (const f of readyDepFiles) next[f.id] = true;
                        setSelectedDep(next);
                      }}
                      onDeselectAll={() => setSelectedDep({})}
                      onImportSelected={() => void importSelectedDepenses()}
                      importLabel="Importer la sélection"
                    />
                    {scan.depensesFiles.map((file) => (
                      <DepenseFileRow
                        key={file.id}
                        file={file}
                        draft={depDrafts[file.id]}
                        busy={busyFileId === file.id || batchImporting}
                        selected={Boolean(selectedDep[file.id])}
                        onSelectedChange={(checked) =>
                          setSelectedDep((prev) => ({ ...prev, [file.id]: checked }))
                        }
                        onDraftChange={(patch) => updateDepDraft(file.id, patch)}
                        onImport={async (draft) => {
                          const ok = await importDepense(file, draft);
                          if (ok) await onImported();
                        }}
                        onRetry={() => void extractDepenseFile(file, batchGenRef.current)}
                      />
                    ))}
                  </>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Impossible de charger Drive. Vérifiez la connexion Google (scope Drive) et
              l&apos;ID dossier racine.
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadScan()}
            disabled={loading || extracting || batchImporting}
          >
            Actualiser
          </Button>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DepenseFileRow({
  file,
  draft,
  busy,
  selected,
  onSelectedChange,
  onDraftChange,
  onImport,
  onRetry,
}: {
  file: ComptaDriveFileStatus;
  draft?: DepDraft;
  busy: boolean;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  onDraftChange: (patch: Partial<DepDraft>) => void;
  onImport: (draft: DepDraft) => void | Promise<void>;
  onRetry: () => void;
}) {
  if (file.alreadyImported) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border p-3 opacity-80">
        <div>
          <p className="text-sm font-medium">{file.name}</p>
          <Badge variant="secondary" className="mt-1">
            Déjà importé
          </Badge>
        </div>
        {file.webViewLink ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void openComptaDriveLink(file.webViewLink!)}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    );
  }

  const ttc = parseFloat(draft?.ttc ?? "0") || 0;
  const tva = parseFloat(draft?.tva ?? "0") || 0;
  const ht = parseFloat(draft?.ht ?? "0") || computeDepenseHt(ttc, tva);
  const isBankStatement =
    draft?.documentKind === "bank_statement" || draft?.categorie === "Relevé de compte";
  const isUsd = draft?.currency === "USD" && !isBankStatement;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {draft?.status === "ready" ? (
            <Checkbox
              checked={selected}
              disabled={busy}
              className="mt-1"
              aria-label={`Sélectionner ${file.name}`}
              onCheckedChange={(value) => onSelectedChange(value === true)}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={file.name}>
              {file.name}
            </p>
            {draft?.status === "ready" ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {isBankStatement ? (
                  <Badge variant="secondary">Relevé bancaire</Badge>
                ) : isUsd ? (
                  <>
                    <Badge variant="outline" className="border-amber-500 text-amber-700">
                      USD
                    </Badge>
                    <Badge
                      variant={
                        draft.confidence === "high"
                          ? "default"
                          : draft.confidence === "medium"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      Confiance {draft.confidence}
                    </Badge>
                  </>
                ) : (
                  <Badge
                    variant={
                      draft.confidence === "high"
                        ? "default"
                        : draft.confidence === "medium"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    Confiance {draft.confidence}
                  </Badge>
                )}
              </div>
            ) : null}
          </div>
        </div>
        {file.webViewLink ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void openComptaDriveLink(file.webViewLink!)}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {!draft || draft.status === "loading" ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Extraction en cours…
        </div>
      ) : draft.status === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{draft.error ?? "Erreur extraction"}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Réessayer
          </Button>
        </div>
      ) : (
        <>
          {isBankStatement ? (
            <p className="rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Extrait de compte — pas une facture. Les montants des lignes (GitHub, Sonar, etc.)
              ne sont pas extraits ici : archivez le PDF ou saisissez une dépense séparément.
            </p>
          ) : null}
          {isUsd ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
              Montants en <strong>USD</strong> extraits du PDF ({draft.ttc} $ TTC) — la compta est
              en euros : convertissez manuellement avant import ou corrigez les champs ci-dessous.
            </p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1 md:col-span-2">
              <Label>{isBankStatement ? "Compte / banque" : "Tiers"}</Label>
              <Input
                value={draft.tiers}
                placeholder={isBankStatement ? "La Banque Postale" : undefined}
                onChange={(e) => onDraftChange({ tiers: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={draft.date}
                onChange={(e) => onDraftChange({ date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Catégorie</Label>
              <Select
                value={draft.categorie || undefined}
                onValueChange={(value) => onDraftChange({ categorie: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {COMPTA_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isUsd ? "TTC (USD)" : "TTC (€)"}</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.ttc}
                disabled={isBankStatement}
                onChange={(e) => onDraftChange({ ttc: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{isUsd ? "TVA (USD)" : "TVA (€)"}</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.tva}
                disabled={isBankStatement}
                onChange={(e) => onDraftChange({ tva: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{isUsd ? "HT (USD)" : "HT (€)"}</Label>
              <Input type="number" step="0.01" value={draft.ht} readOnly disabled={isBankStatement} />
            </div>
            {!isBankStatement ? (
              <div className="flex flex-col justify-end md:col-span-2">
                <p className="text-sm text-muted-foreground">
                  {isUsd
                    ? `HT ${draft.ht} $ — TTC ${draft.ttc} $ (à convertir en €)`
                    : `HT ${formatComptaMoney(ht)} — TTC ${formatComptaMoney(ttc)}`}
                </p>
              </div>
            ) : null}
          </div>
          <Button type="button" size="sm" disabled={busy} onClick={() => onImport(draft)}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isBankStatement ? "Archiver le relevé" : "Importer"}
          </Button>
        </>
      )}
    </div>
  );
}

function EncaissementFileRow({
  file,
  draft,
  busy,
  selected,
  onSelectedChange,
  onDraftChange,
  onImport,
  onRetry,
}: {
  file: ComptaDriveFileStatus;
  draft?: EncDraft;
  busy: boolean;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  onDraftChange: (patch: Partial<EncDraft>) => void;
  onImport: (draft: EncDraft) => void | Promise<void>;
  onRetry: () => void;
}) {
  if (file.alreadyImported) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border p-3 opacity-80">
        <div>
          <p className="text-sm font-medium">{file.name}</p>
          <Badge variant="secondary" className="mt-1">
            Déjà importé
          </Badge>
        </div>
        {file.webViewLink ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void openComptaDriveLink(file.webViewLink!)}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    );
  }

  const exonere = parseFloat(draft?.exonere ?? "0") || 0;
  const ht = parseFloat(draft?.ht ?? "0") || 0;
  const tva = parseFloat(draft?.tva ?? "0") || 0;
  const don = parseFloat(draft?.don ?? "0") || 0;
  const { ttc, total } = computeEncaissementTotals(exonere, ht, tva, don);

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {draft?.status === "ready" ? (
            <Checkbox
              checked={selected}
              disabled={busy}
              className="mt-1"
              aria-label={`Sélectionner ${file.name}`}
              onCheckedChange={(value) => onSelectedChange(value === true)}
            />
          ) : null}
          <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          {draft?.status === "ready" ? (
            <Badge
              variant={
                draft.confidence === "high"
                  ? "default"
                  : draft.confidence === "medium"
                    ? "secondary"
                    : "outline"
              }
              className="mt-1"
            >
              Confiance {draft.confidence}
            </Badge>
          ) : null}
          </div>
        </div>
        {file.webViewLink ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void openComptaDriveLink(file.webViewLink!)}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {!draft || draft.status === "loading" ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Extraction en cours…
        </div>
      ) : draft.status === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{draft.error ?? "Erreur extraction"}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Réessayer
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1 md:col-span-2 xl:col-span-2">
              <Label>Client</Label>
              <Input
                value={draft.client}
                onChange={(e) => onDraftChange({ client: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={draft.date}
                onChange={(e) => onDraftChange({ date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Exonéré (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.exonere}
                onChange={(e) => onDraftChange({ exonere: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>HT (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.ht}
                onChange={(e) => onDraftChange({ ht: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>TVA (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.tva}
                onChange={(e) => onDraftChange({ tva: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Don (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.don}
                onChange={(e) => onDraftChange({ don: e.target.value })}
              />
            </div>
            <div className="flex flex-col justify-end md:col-span-2 xl:col-span-2">
              <p className="text-sm text-muted-foreground">
                TTC {formatComptaMoney(ttc)} — Total reçu {formatComptaMoney(total)}
              </p>
            </div>
          </div>
          <Button type="button" size="sm" disabled={busy} onClick={() => onImport(draft)}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Importer
          </Button>
        </>
      )}
    </div>
  );
}
