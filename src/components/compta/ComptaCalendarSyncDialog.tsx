import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  importComptaCalendarTrip,
  scanComptaCalendarMonth,
  type ComptaCalendarTripProposal,
} from "@/lib/api/tauri-compta-sync";
import { type ComptaConfig } from "@/lib/api/tauri-compta";
import {
  computeDrivingDistanceKm,
  computeIndemniteKm,
  resetComptaDistanceCache,
} from "@/lib/compta/compta-distance";
import { formatComptaMoney } from "@/lib/compta/compta-money";
import { formatComptaDateFr } from "@/lib/compta/compta-month";
import {
  geocodeTargetFromCity,
  locationNeedsCityHint,
  resolveComptaImportDestination,
} from "@/lib/compta/compta-location-hint";
import { toast } from "sonner";

interface ComptaCalendarSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
  config: ComptaConfig;
  onImported: () => Promise<void>;
}

type TripDraft = {
  km: number | null;
  indemnite: number | null;
  calcBusy: boolean;
  calcError?: boolean;
  cityHint: string;
};

const EMPTY_DRAFT: TripDraft = {
  km: null,
  indemnite: null,
  calcBusy: false,
  cityHint: "",
};

const CITY_RECALC_DEBOUNCE_MS = 700;
const MIN_CITY_LENGTH = 3;

function TripSelectionToolbar({
  selectedCount,
  readyCount,
  batchBusy,
  onSelectAll,
  onDeselectAll,
  onImportSelected,
}: {
  selectedCount: number;
  readyCount: number;
  batchBusy: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onImportSelected: () => void;
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
        Importer la sélection ({selectedCount})
      </Button>
    </div>
  );
}

export function ComptaCalendarSyncDialog({
  open,
  onOpenChange,
  year,
  month,
  config,
  onImported,
}: ComptaCalendarSyncDialogProps) {
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [calcProgress, setCalcProgress] = useState<{ done: number; total: number } | null>(null);
  const [proposals, setProposals] = useState<ComptaCalendarTripProposal[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TripDraft>>({});
  const [selectedTrips, setSelectedTrips] = useState<Record<string, boolean>>({});
  const [importingId, setImportingId] = useState<string | null>(null);
  const [batchImporting, setBatchImporting] = useState(false);
  const batchGenRef = useRef(0);
  const cityRecalcTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const patchDraft = useCallback((eventId: string, patch: Partial<TripDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [eventId]: { ...(prev[eventId] ?? EMPTY_DRAFT), ...patch },
    }));
  }, []);

  const computeTripDraft = useCallback(
    async (
      proposal: ComptaCalendarTripProposal,
      batchGen: number,
      options?: {
        promptOnFail?: boolean;
        notifySuccess?: boolean;
        cityHint?: string;
        cityOnly?: boolean;
      }
    ): Promise<boolean> => {
      if (batchGen !== batchGenRef.current) return false;

      if (!config.adresseDepart.trim()) {
        toast.error("Renseignez l'adresse de départ dans la configuration");
        return false;
      }

      let destination: string;

      if (options?.cityOnly) {
        const city = geocodeTargetFromCity(options.cityHint ?? "");
        if (city.length < MIN_CITY_LENGTH) return false;
        destination = city;
      } else {
        destination = proposal.location;
      }

      patchDraft(proposal.eventId, { calcBusy: true, calcError: false });

      try {
        const oneWay = await computeDrivingDistanceKm(config.adresseDepart, destination);
        if (batchGen !== batchGenRef.current) return false;

        const result = computeIndemniteKm(oneWay, config.indemniteKm);
        patchDraft(proposal.eventId, {
          km: result.roundTripKm,
          indemnite: result.indemnite,
          calcBusy: false,
          calcError: false,
        });
        setSelectedTrips((prev) => ({ ...prev, [proposal.eventId]: true }));
        if (options?.notifySuccess) toast.success("Distance calculée");
        return true;
      } catch {
        if (batchGen !== batchGenRef.current) return false;

        if (
          !options?.cityOnly &&
          locationNeedsCityHint(proposal.location) &&
          !options?.promptOnFail
        ) {
          patchDraft(proposal.eventId, { calcBusy: false, calcError: true });
          return false;
        }

        if (options?.promptOnFail) {
          const manual = window.prompt(
            "Impossible de calculer automatiquement.\nEntrez la distance aller simple en km :"
          );
          if (manual && !Number.isNaN(parseFloat(manual))) {
            const result = computeIndemniteKm(parseFloat(manual), config.indemniteKm);
            patchDraft(proposal.eventId, {
              km: result.roundTripKm,
              indemnite: result.indemnite,
              calcBusy: false,
              calcError: false,
            });
            setSelectedTrips((prev) => ({ ...prev, [proposal.eventId]: true }));
            return true;
          }
        }

        patchDraft(proposal.eventId, { calcBusy: false, calcError: true });
        if (options?.promptOnFail) toast.error("Calcul de distance échoué");
        return false;
      }
    },
    [config.adresseDepart, config.indemniteKm, patchDraft]
  );

  const scheduleCityRecalc = useCallback(
    (proposal: ComptaCalendarTripProposal, cityHint: string) => {
      const eventId = proposal.eventId;
      const existing = cityRecalcTimersRef.current[eventId];
      if (existing) clearTimeout(existing);

      const city = geocodeTargetFromCity(cityHint);
      if (city.length < MIN_CITY_LENGTH) return;

      cityRecalcTimersRef.current[eventId] = setTimeout(() => {
        void computeTripDraft(proposal, batchGenRef.current, {
          cityHint: city,
          cityOnly: true,
        });
      }, CITY_RECALC_DEBOUNCE_MS);
    },
    [computeTripDraft]
  );

  const autoCalculateTrips = useCallback(
    async (items: ComptaCalendarTripProposal[], batchGen: number) => {
      const pending = items.filter((p) => !p.alreadyImported);
      if (pending.length === 0) return;
      if (!config.adresseDepart.trim()) {
        toast.error("Renseignez l'adresse de départ dans la configuration");
        return;
      }

      setCalculating(true);
      setCalcProgress({ done: 0, total: pending.length });

      for (let i = 0; i < pending.length; i++) {
        if (batchGen !== batchGenRef.current) break;
        const proposal = pending[i]!;
        await computeTripDraft(proposal, batchGen);
        if (batchGen !== batchGenRef.current) break;
        setCalcProgress({ done: i + 1, total: pending.length });
      }

      if (batchGen === batchGenRef.current) {
        setCalculating(false);
        setCalcProgress(null);
      }
    },
    [computeTripDraft, config.adresseDepart]
  );

  const loadProposals = useCallback(async () => {
    batchGenRef.current += 1;
    const batchGen = batchGenRef.current;
    await resetComptaDistanceCache();

    for (const timer of Object.values(cityRecalcTimersRef.current)) {
      clearTimeout(timer);
    }
    cityRecalcTimersRef.current = {};

    setLoading(true);
    setCalculating(false);
    setCalcProgress(null);
    setDrafts({});
    setSelectedTrips({});

    try {
      const items = await scanComptaCalendarMonth(year, month);
      if (batchGen !== batchGenRef.current) return;

      setProposals(items);
      setLoading(false);
      await autoCalculateTrips(items, batchGen);
    } catch (e) {
      if (batchGen !== batchGenRef.current) return;
      toast.error(e instanceof Error ? e.message : "Erreur scan Agenda");
      setProposals([]);
      setLoading(false);
    }
  }, [year, month, autoCalculateTrips]);

  useEffect(() => {
    if (!open) {
      batchGenRef.current += 1;
      return;
    }
    void loadProposals();
  }, [open, loadProposals]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(cityRecalcTimersRef.current)) {
        clearTimeout(timer);
      }
    };
  }, []);

  const importTrip = async (
    proposal: ComptaCalendarTripProposal,
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    if (!config.adresseDepart.trim()) {
      if (!options?.silent) {
        toast.error("Renseignez l'adresse de départ dans la configuration Comptabilité");
      }
      return false;
    }
    const draft = drafts[proposal.eventId] ?? EMPTY_DRAFT;
    if (draft.km == null || draft.indemnite == null) {
      if (!options?.silent) {
        toast.error("Distance non calculée — saisissez les km ou relancez le calcul");
      }
      return false;
    }
    if (!options?.silent) setImportingId(proposal.eventId);
    try {
      await importComptaCalendarTrip({
        eventId: proposal.eventId,
        date: proposal.date,
        destination: resolveComptaImportDestination(proposal.location, draft.cityHint),
        objet: proposal.summary,
        km: draft.km,
        indemnite: draft.indemnite,
      });
      if (!options?.silent) toast.success(`Déplacement importé : ${proposal.summary}`);
      setProposals((prev) =>
        prev.map((p) =>
          p.eventId === proposal.eventId ? { ...p, alreadyImported: true } : p
        )
      );
      setSelectedTrips((prev) => {
        if (!(proposal.eventId in prev)) return prev;
        const next = { ...prev };
        delete next[proposal.eventId];
        return next;
      });
      return true;
    } catch (e) {
      if (!options?.silent) {
        toast.error(e instanceof Error ? e.message : "Import déplacement échoué");
      }
      return false;
    } finally {
      if (!options?.silent) setImportingId(null);
    }
  };

  const pending = proposals.filter((p) => !p.alreadyImported);
  const readyTrips = pending.filter((p) => {
    const d = drafts[p.eventId];
    return d?.km != null && d.indemnite != null && !d.calcBusy;
  });
  const selectedTripCount = readyTrips.filter((p) => selectedTrips[p.eventId]).length;
  const addressMissing = !config.adresseDepart.trim();

  const importSelectedTrips = async () => {
    if (addressMissing) {
      toast.error("Renseignez l'adresse de départ avant d'importer");
      return;
    }
    const toImport = readyTrips.filter((p) => selectedTrips[p.eventId]);
    if (toImport.length === 0) {
      toast.error("Aucun déplacement sélectionné");
      return;
    }
    setBatchImporting(true);
    let ok = 0;
    let fail = 0;
    for (const proposal of toImport) {
      const success = await importTrip(proposal, { silent: true });
      if (success) ok += 1;
      else fail += 1;
    }
    setBatchImporting(false);
    if (ok > 0) await onImported();
    if (fail === 0) {
      toast.success(`${ok} déplacement${ok > 1 ? "s" : ""} importé${ok > 1 ? "s" : ""}`);
    } else {
      toast.warning(`${ok} importé(s), ${fail} échec(s)`);
    }
  };

  const rowBusy = batchImporting || calculating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,52rem)] max-w-[52rem] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Synchroniser Google Agenda</DialogTitle>
          <DialogDescription>
            RDV sur place avec adresse postale (rue ou code postal). Exclus : Zoom, Teams, visio,
            numéros de téléphone et liens de réunion.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {addressMissing ? (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Renseignez l&apos;adresse de départ dans Configuration (ou page Comptabilité) pour calculer les km et importer les déplacements.
            </p>
          ) : null}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Lecture de l&apos;agenda…
            </div>
          ) : proposals.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun RDV importable pour ce mois.
            </p>
          ) : (
            <div className="space-y-3">
              {calculating && calcProgress ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calcul km {calcProgress.done}/{calcProgress.total}…
                </p>
              ) : null}
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tous les RDV repérés sont déjà importés.
                </p>
              ) : (
                <TripSelectionToolbar
                  selectedCount={selectedTripCount}
                  readyCount={readyTrips.length}
                  batchBusy={rowBusy}
                  onSelectAll={() => {
                    const next: Record<string, boolean> = {};
                    for (const p of readyTrips) next[p.eventId] = true;
                    setSelectedTrips(next);
                  }}
                  onDeselectAll={() => setSelectedTrips({})}
                  onImportSelected={() => void importSelectedTrips()}
                />
              )}
              {proposals.map((proposal) => {
                const draft = drafts[proposal.eventId] ?? EMPTY_DRAFT;
                const showCityFallback =
                  draft.calcError ||
                  locationNeedsCityHint(proposal.location) ||
                  draft.cityHint.length > 0;
                const canSelect =
                  !addressMissing &&
                  !proposal.alreadyImported &&
                  draft.km != null &&
                  draft.indemnite != null &&
                  !draft.calcBusy;

                return (
                  <div key={proposal.eventId} className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        {canSelect ? (
                          <Checkbox
                            checked={Boolean(selectedTrips[proposal.eventId])}
                            disabled={rowBusy || importingId === proposal.eventId}
                            className="mt-1"
                            aria-label={`Sélectionner ${proposal.summary}`}
                            onCheckedChange={(value) =>
                              setSelectedTrips((prev) => ({
                                ...prev,
                                [proposal.eventId]: value === true,
                              }))
                            }
                          />
                        ) : null}
                        <div>
                          <p className="text-sm font-medium">{proposal.summary}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatComptaDateFr(proposal.date)}
                          </p>
                          <p className="mt-1 flex items-start gap-1 text-sm">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            {proposal.location}
                          </p>
                        </div>
                      </div>
                      {proposal.alreadyImported ? (
                        <Badge variant="secondary">Importé</Badge>
                      ) : draft.calcBusy ? (
                        <Badge variant="outline">Calcul…</Badge>
                      ) : draft.calcError ? (
                        <Badge variant="destructive">Km manuel</Badge>
                      ) : draft.km != null ? (
                        <Badge variant="secondary">Km OK</Badge>
                      ) : null}
                    </div>

                    {!proposal.alreadyImported ? (
                      <div className="space-y-2">
                        {showCityFallback ? (
                          <div className="flex flex-wrap items-end gap-2 rounded-md bg-muted/40 p-2">
                            <div className="space-y-1">
                              <Label htmlFor={`city-${proposal.eventId}`}>Ville</Label>
                              <Input
                                id={`city-${proposal.eventId}`}
                                className="w-48"
                                placeholder="ex. La Grande-Motte"
                                value={draft.cityHint}
                                disabled={draft.calcBusy || calculating || batchImporting}
                                onChange={(e) => {
                                  const cityHint = e.target.value;
                                  patchDraft(proposal.eventId, { cityHint });
                                  scheduleCityRecalc(proposal, cityHint);
                                }}
                              />
                            </div>
                            <p className="pb-2 text-xs text-muted-foreground">
                              Repli sur la ville — calcul auto dès la saisie.
                            </p>
                          </div>
                        ) : null}

                        {draft.km != null && draft.indemnite != null ? (
                          <div className="flex flex-wrap gap-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
                            <span>
                              <strong>{draft.km.toFixed(1)} km</strong> aller-retour
                            </span>
                            <span className="font-semibold text-blue-700">
                              Indemnité {formatComptaMoney(draft.indemnite)}
                            </span>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-end gap-2">
                          <div className="space-y-1">
                            <Label>Km A/R</Label>
                            <Input
                              className="w-24"
                              type="number"
                              step="0.1"
                              value={draft.km ?? ""}
                              disabled={batchImporting}
                              onChange={(e) => {
                                const km = parseFloat(e.target.value) || null;
                                patchDraft(proposal.eventId, { km });
                                if (km != null) {
                                  setSelectedTrips((prev) => ({
                                    ...prev,
                                    [proposal.eventId]: prev[proposal.eventId] ?? true,
                                  }));
                                }
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Indemnité</Label>
                            <Input
                              className="w-28"
                              type="number"
                              step="0.01"
                              value={draft.indemnite ?? ""}
                              disabled={batchImporting}
                              onChange={(e) => {
                                const indemnite = parseFloat(e.target.value) || null;
                                patchDraft(proposal.eventId, { indemnite });
                                if (indemnite != null) {
                                  setSelectedTrips((prev) => ({
                                    ...prev,
                                    [proposal.eventId]: prev[proposal.eventId] ?? true,
                                  }));
                                }
                              }}
                            />
                          </div>
                          {draft.indemnite != null ? (
                            <span className="pb-2 text-sm text-muted-foreground">
                              {formatComptaMoney(draft.indemnite)}
                            </span>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={draft.calcBusy || calculating || batchImporting}
                            onClick={() => {
                              if (draft.cityHint.trim().length >= MIN_CITY_LENGTH) {
                                void computeTripDraft(proposal, batchGenRef.current, {
                                  cityHint: draft.cityHint,
                                  cityOnly: true,
                                  promptOnFail: true,
                                  notifySuccess: true,
                                });
                                return;
                              }
                              void computeTripDraft(proposal, batchGenRef.current, {
                                promptOnFail: true,
                                notifySuccess: true,
                              });
                            }}
                          >
                            {draft.calcBusy ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            Recalculer
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              addressMissing ||
                              importingId === proposal.eventId ||
                              batchImporting ||
                              draft.km == null ||
                              draft.indemnite == null
                            }
                            onClick={async () => {
                              const ok = await importTrip(proposal);
                              if (ok) await onImported();
                            }}
                          >
                            {importingId === proposal.eventId ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            Importer
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadProposals()}
            disabled={loading || calculating || batchImporting}
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
