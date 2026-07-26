import { useEffect, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  defaultStatistiquesBenchmarkSettings,
  loadStatistiquesBenchmarkSettings,
  saveStatistiquesBenchmarkSettings,
} from "@/lib/statistiques/statistiques-benchmark-settings";
import {
  formatFilleulVolumeDisplay,
  formatFilleulVolumeField,
  parseFilleulVolumeField,
} from "@/lib/organisation/organisation-branch-volumes";
import { cn } from "@/lib/utils";

type StatistiquesBenchmarkSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function BenchmarkSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/70 bg-muted/20 p-4 sm:p-5 space-y-4",
        className
      )}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function StatistiquesBenchmarkSettingsDialog({
  open,
  onOpenChange,
}: StatistiquesBenchmarkSettingsDialogProps) {
  const [referenceEuros, setReferenceEuros] = useState("");
  const [activeConsultantRatePercent, setActiveConsultantRatePercent] = useState("");
  const [sponsorRatePercent, setSponsorRatePercent] = useState("");
  const [parrainagesPerParraineur, setParrainagesPerParraineur] = useState("");
  const [netGrowthPercent, setNetGrowthPercent] = useState("");
  const [vaaDurationMonths, setVaaDurationMonths] = useState("");
  const [habilitationDurationMonths, setHabilitationDurationMonths] = useState("");
  const [nearPercent, setNearPercent] = useState("80");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const settings = loadStatistiquesBenchmarkSettings();
    setReferenceEuros(formatFilleulVolumeField(settings.groupActiveConsultantVolumeEuros));
    setActiveConsultantRatePercent(
      String(settings.groupActiveConsultantRatePercent).replace(".", ",")
    );
    setSponsorRatePercent(String(settings.groupSponsorRatePercent).replace(".", ","));
    setParrainagesPerParraineur(
      String(settings.groupParrainagesPerParraineur).replace(".", ",")
    );
    setNetGrowthPercent(String(settings.groupNetGrowthPercent).replace(".", ","));
    setVaaDurationMonths(String(settings.groupVaaDurationMonths).replace(".", ","));
    setHabilitationDurationMonths(
      String(settings.groupHabilitationDurationMonths).replace(".", ",")
    );
    setNearPercent(String(Math.round(settings.nearGroupBenchmarkRatio * 100)));
    setError(null);
  }, [open]);

  const handleReset = () => {
    const defaults = defaultStatistiquesBenchmarkSettings();
    setReferenceEuros(formatFilleulVolumeField(defaults.groupActiveConsultantVolumeEuros));
    setActiveConsultantRatePercent(
      String(defaults.groupActiveConsultantRatePercent).replace(".", ",")
    );
    setSponsorRatePercent(String(defaults.groupSponsorRatePercent).replace(".", ","));
    setParrainagesPerParraineur(
      String(defaults.groupParrainagesPerParraineur).replace(".", ",")
    );
    setNetGrowthPercent(String(defaults.groupNetGrowthPercent).replace(".", ","));
    setVaaDurationMonths(String(defaults.groupVaaDurationMonths).replace(".", ","));
    setHabilitationDurationMonths(
      String(defaults.groupHabilitationDurationMonths).replace(".", ",")
    );
    setNearPercent(String(Math.round(defaults.nearGroupBenchmarkRatio * 100)));
    setError(null);
  };

  const handleSave = () => {
    const parsedReference = parseFilleulVolumeField(referenceEuros.replace(/\s/g, ""));
    if (parsedReference == null || parsedReference <= 0) {
      setError("Saisissez un montant de référence strictement positif.");
      return;
    }
    const activeRateRaw = activeConsultantRatePercent.trim();
    const parsedActiveConsultantRate =
      activeRateRaw === ""
        ? defaultStatistiquesBenchmarkSettings().groupActiveConsultantRatePercent
        : Number.parseFloat(activeRateRaw.replace(",", "."));
    if (
      !Number.isFinite(parsedActiveConsultantRate) ||
      parsedActiveConsultantRate <= 0 ||
      parsedActiveConsultantRate > 100
    ) {
      setError("Le taux d'actifs de référence doit être entre 0 et 100 %.");
      return;
    }
    const parsedSponsorRate = Number.parseFloat(sponsorRatePercent.trim().replace(",", "."));
    if (!Number.isFinite(parsedSponsorRate) || parsedSponsorRate <= 0 || parsedSponsorRate > 100) {
      setError("Le taux de parraineurs de référence doit être entre 0 et 100 %.");
      return;
    }
    const parsedParrainagesPerParraineur = Number.parseFloat(
      parrainagesPerParraineur.trim().replace(",", ".")
    );
    if (!Number.isFinite(parsedParrainagesPerParraineur) || parsedParrainagesPerParraineur <= 0) {
      setError("La référence parrainages / parraineur doit être strictement positive.");
      return;
    }
    const parsedNetGrowthPercent = Number.parseFloat(netGrowthPercent.trim().replace(",", "."));
    if (!Number.isFinite(parsedNetGrowthPercent) || parsedNetGrowthPercent <= 0) {
      setError("La référence croissance nette doit être strictement positive (%).");
      return;
    }
    const parsedVaaDuration = Number.parseFloat(vaaDurationMonths.trim().replace(",", "."));
    if (!Number.isFinite(parsedVaaDuration) || parsedVaaDuration <= 0) {
      setError("Le délai VAA/VA de référence doit être strictement positif (en mois).");
      return;
    }
    const parsedHabilitationDuration = Number.parseFloat(
      habilitationDurationMonths.trim().replace(",", ".")
    );
    if (!Number.isFinite(parsedHabilitationDuration) || parsedHabilitationDuration <= 0) {
      setError("Le délai habilitation de référence doit être strictement positif (en mois).");
      return;
    }
    const pct = Number.parseInt(nearPercent.trim(), 10);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      setError("Le seuil « proche » doit être entre 1 et 99 %.");
      return;
    }
    saveStatistiquesBenchmarkSettings({
      groupActiveConsultantVolumeEuros: parsedReference,
      groupActiveConsultantRatePercent: parsedActiveConsultantRate,
      groupSponsorRatePercent: parsedSponsorRate,
      groupParrainagesPerParraineur: parsedParrainagesPerParraineur,
      groupNetGrowthPercent: parsedNetGrowthPercent,
      groupVaaDurationMonths: parsedVaaDuration,
      groupHabilitationDurationMonths: parsedHabilitationDuration,
      nearGroupBenchmarkRatio: pct / 100,
    });
    onOpenChange(false);
  };

  const previewReference = parseFilleulVolumeField(referenceEuros.replace(/\s/g, ""));
  const previewActiveConsultantRate = Number.parseFloat(
    activeConsultantRatePercent.trim().replace(",", ".")
  );
  const previewSponsorRate = Number.parseFloat(sponsorRatePercent.trim().replace(",", "."));
  const previewParrainagesPerParraineur = Number.parseFloat(
    parrainagesPerParraineur.trim().replace(",", ".")
  );
  const previewNetGrowthPercent = Number.parseFloat(netGrowthPercent.trim().replace(",", "."));
  const previewVaaDuration = Number.parseFloat(vaaDurationMonths.trim().replace(",", "."));
  const previewHabilitationDuration = Number.parseFloat(
    habilitationDurationMonths.trim().replace(",", ".")
  );
  const previewPct = Number.parseInt(nearPercent.trim(), 10);
  const previewFloor =
    previewReference != null &&
    previewReference > 0 &&
    Number.isFinite(previewPct) &&
    previewPct > 0 &&
    previewPct < 100
      ? previewReference * (previewPct / 100)
      : null;
  const previewSponsorFloor =
    Number.isFinite(previewSponsorRate) &&
    previewSponsorRate > 0 &&
    Number.isFinite(previewPct) &&
    previewPct > 0 &&
    previewPct < 100
      ? previewSponsorRate * (previewPct / 100)
      : null;
  const previewActiveConsultantRateFloor =
    Number.isFinite(previewActiveConsultantRate) &&
    previewActiveConsultantRate > 0 &&
    Number.isFinite(previewPct) &&
    previewPct > 0 &&
    previewPct < 100
      ? previewActiveConsultantRate * (previewPct / 100)
      : null;
  const previewParrainagesPerParraineurFloor =
    Number.isFinite(previewParrainagesPerParraineur) &&
    previewParrainagesPerParraineur > 0 &&
    Number.isFinite(previewPct) &&
    previewPct > 0 &&
    previewPct < 100
      ? previewParrainagesPerParraineur * (previewPct / 100)
      : null;
  const previewNetGrowthFloor =
    Number.isFinite(previewNetGrowthPercent) &&
    previewNetGrowthPercent > 0 &&
    Number.isFinite(previewPct) &&
    previewPct > 0 &&
    previewPct < 100
      ? previewNetGrowthPercent * (previewPct / 100)
      : null;
  const previewVaaCeiling =
    Number.isFinite(previewVaaDuration) &&
    previewVaaDuration > 0 &&
    Number.isFinite(previewPct) &&
    previewPct > 0 &&
    previewPct < 100
      ? previewVaaDuration / (previewPct / 100)
      : null;
  const previewHabilitationCeiling =
    Number.isFinite(previewHabilitationDuration) &&
    previewHabilitationDuration > 0 &&
    Number.isFinite(previewPct) &&
    previewPct > 0 &&
    previewPct < 100
      ? previewHabilitationDuration / (previewPct / 100)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,44rem)] w-[min(100vw-2rem,42rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 space-y-2 border-b border-border/60 px-5 py-4 sm:px-6 sm:py-5">
          <DialogTitle className="font-serif text-xl">Références statistiques</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Seuils de comparaison avec le groupe — utilisés pour les couleurs des indicateurs.
            D&apos;autres références pourront être ajoutées ici au fil du temps.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          <div className="space-y-5">
            <BenchmarkSection
              title="Organisation filleuls"
              description="Panneaux volume, taux d'actifs, taux de parraineurs, parrainages / parraineur, croissance nette, délai VAA/VA et délai habilitation — comparaison à la moyenne groupe."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="stat-benchmark-reference">
                    Volume moyen consultant actif — référence groupe (€)
                  </Label>
                  <Input
                    id="stat-benchmark-reference"
                    inputMode="decimal"
                    placeholder="547 000"
                    className="h-10"
                    value={referenceEuros}
                    onChange={(event) => {
                      setReferenceEuros(event.target.value);
                      setError(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Moyenne nationale sur l&apos;exercice en cours (volume propre, consultants actifs
                    ≥ 1 €).
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="stat-benchmark-active-rate">
                    Taux d&apos;actifs — référence groupe (%)
                  </Label>
                  <Input
                    id="stat-benchmark-active-rate"
                    inputMode="decimal"
                    placeholder="30"
                    className="h-10"
                    value={activeConsultantRatePercent}
                    onChange={(event) => {
                      setActiveConsultantRatePercent(event.target.value);
                      setError(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Part des consultants présents sur l&apos;exercice avec au moins 1 € de volume
                    propre (défaut 30 % — modifiable).
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="stat-benchmark-sponsor-rate">
                    Taux de parraineurs — référence groupe (%)
                  </Label>
                  <Input
                    id="stat-benchmark-sponsor-rate"
                    inputMode="decimal"
                    placeholder="26,5"
                    className="h-10"
                    value={sponsorRatePercent}
                    onChange={(event) => {
                      setSponsorRatePercent(event.target.value);
                      setError(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Moyenne nationale : part des consultants réseau (présents sur l&apos;exercice)
                    ayant parrainé au moins une personne affiliée durant la période.
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="stat-benchmark-parrainages-per-parraineur">
                    Parrainages / parraineur — référence groupe
                  </Label>
                  <Input
                    id="stat-benchmark-parrainages-per-parraineur"
                    inputMode="decimal"
                    placeholder="1,9"
                    className="h-10"
                    value={parrainagesPerParraineur}
                    onChange={(event) => {
                      setParrainagesPerParraineur(event.target.value);
                      setError(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Moyenne nationale : nombre de filleuls parrainés par consultant parraineur sur
                    l&apos;exercice (affiliations durant la période).
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="stat-benchmark-net-growth">
                    Croissance nette — référence groupe (% vs exercice précédent)
                  </Label>
                  <Input
                    id="stat-benchmark-net-growth"
                    inputMode="decimal"
                    placeholder="30"
                    className="h-10"
                    value={netGrowthPercent}
                    onChange={(event) => {
                      setNetGrowthPercent(event.target.value);
                      setError(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Moyenne nationale : variation en % du nombre de consultants présents
                    sur l&apos;exercice par rapport à l&apos;exercice précédent.
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="stat-benchmark-vaa-duration">
                    Délai avant 1er VAA ou VA — référence groupe (mois)
                  </Label>
                  <Input
                    id="stat-benchmark-vaa-duration"
                    inputMode="decimal"
                    placeholder="14,62"
                    className="h-10"
                    value={vaaDurationMonths}
                    onChange={(event) => {
                      setVaaDurationMonths(event.target.value);
                      setError(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Moyenne nationale : mois entre inscription et premier VAA ou VA (consultants
                    avec date renseignée). Un délai plus court est favorable.
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="stat-benchmark-habilitation-duration">
                    Délai 1ère habilitation — référence groupe (mois)
                  </Label>
                  <Input
                    id="stat-benchmark-habilitation-duration"
                    inputMode="decimal"
                    placeholder="8,7"
                    className="h-10"
                    value={habilitationDurationMonths}
                    onChange={(event) => {
                      setHabilitationDurationMonths(event.target.value);
                      setError(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Moyenne nationale : mois entre inscription et première habilitation (MIOBSP, MIA
                    ou Agent Lié — la plus proche de l&apos;inscription). Un délai plus court est
                    favorable.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stat-benchmark-near">Seuil « proche » (% de la référence)</Label>
                  <Input
                    id="stat-benchmark-near"
                    inputMode="numeric"
                    placeholder="80"
                    className="h-10"
                    value={nearPercent}
                    onChange={(event) => {
                      setNearPercent(event.target.value);
                      setError(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Orange entre ce seuil et la référence · rouge en dessous · vert au-dessus.
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-muted-foreground">Aperçu des seuils</Label>
                  <div className="rounded-lg border border-border/60 bg-background px-3 py-2.5 text-xs text-muted-foreground space-y-1.5 min-h-[2.5rem]">
                    {previewReference != null && previewReference > 0 ? (
                      <>
                        <p>
                          Volume — réf. :{" "}
                          <span className="font-medium text-foreground tabular-nums">
                            {formatFilleulVolumeDisplay(previewReference)}
                          </span>
                          {previewFloor != null ? (
                            <>
                              {" · "}
                              zone orange{" "}
                              <span className="font-medium text-foreground tabular-nums">
                                {formatFilleulVolumeDisplay(previewFloor)}
                              </span>
                              {" → "}
                              {formatFilleulVolumeDisplay(previewReference)}
                            </>
                          ) : null}
                        </p>
                        {Number.isFinite(previewActiveConsultantRate) &&
                        previewActiveConsultantRate > 0 ? (
                          <p>
                            Taux d&apos;actifs — réf. :{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {previewActiveConsultantRate.toString().replace(".", ",")} %
                            </span>
                            {previewActiveConsultantRateFloor != null ? (
                              <>
                                {" · "}
                                zone orange{" "}
                                <span className="font-medium text-foreground tabular-nums">
                                  {previewActiveConsultantRateFloor.toFixed(1).replace(".", ",")} %
                                </span>
                                {" → "}
                                {previewActiveConsultantRate.toString().replace(".", ",")} %
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        {Number.isFinite(previewSponsorRate) && previewSponsorRate > 0 ? (
                          <p>
                            Taux de parraineurs — réf. :{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {previewSponsorRate.toString().replace(".", ",")} %
                            </span>
                            {previewSponsorFloor != null ? (
                              <>
                                {" · "}
                                zone orange{" "}
                                <span className="font-medium text-foreground tabular-nums">
                                  {previewSponsorFloor.toFixed(1).replace(".", ",")} %
                                </span>
                                {" → "}
                                {previewSponsorRate.toString().replace(".", ",")} %
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        {Number.isFinite(previewParrainagesPerParraineur) &&
                        previewParrainagesPerParraineur > 0 ? (
                          <p>
                            Parrainages / parraineur — réf. :{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {previewParrainagesPerParraineur.toLocaleString("fr-FR", {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}
                            </span>
                            {previewParrainagesPerParraineurFloor != null ? (
                              <>
                                {" · "}
                                zone orange{" "}
                                <span className="font-medium text-foreground tabular-nums">
                                  {previewParrainagesPerParraineurFloor.toLocaleString("fr-FR", {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  })}
                                </span>
                                {" → "}
                                {previewParrainagesPerParraineur.toLocaleString("fr-FR", {
                                  minimumFractionDigits: 1,
                                  maximumFractionDigits: 1,
                                })}
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        {Number.isFinite(previewNetGrowthPercent) && previewNetGrowthPercent > 0 ? (
                          <p>
                            Croissance nette — réf. :{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              +{previewNetGrowthPercent.toString().replace(".", ",")} %
                            </span>
                            {previewNetGrowthFloor != null ? (
                              <>
                                {" · "}
                                zone orange{" "}
                                <span className="font-medium text-foreground tabular-nums">
                                  +{previewNetGrowthFloor.toFixed(1).replace(".", ",")} %
                                </span>
                                {" → "}
                                +{previewNetGrowthPercent.toString().replace(".", ",")} %
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        {Number.isFinite(previewVaaDuration) && previewVaaDuration > 0 ? (
                          <p>
                            Délai VAA/VA — réf. :{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {previewVaaDuration.toLocaleString("fr-FR", {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })}{" "}
                              mois
                            </span>
                            {previewVaaCeiling != null ? (
                              <>
                                {" · "}
                                zone orange{" "}
                                <span className="font-medium text-foreground tabular-nums">
                                  {previewVaaDuration.toLocaleString("fr-FR", {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                                {" → "}
                                {previewVaaCeiling.toLocaleString("fr-FR", {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })}{" "}
                                mois
                              </>
                            ) : null}
                          </p>
                        ) : null}
                        {Number.isFinite(previewHabilitationDuration) &&
                        previewHabilitationDuration > 0 ? (
                          <p>
                            Habilitation — réf. :{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {previewHabilitationDuration.toLocaleString("fr-FR", {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })}{" "}
                              mois
                            </span>
                            {previewHabilitationCeiling != null ? (
                              <>
                                {" · "}
                                zone orange{" "}
                                <span className="font-medium text-foreground tabular-nums">
                                  {previewHabilitationDuration.toLocaleString("fr-FR", {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                                {" → "}
                                {previewHabilitationCeiling.toLocaleString("fr-FR", {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })}{" "}
                                mois
                              </>
                            ) : null}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p>Saisissez une référence pour prévisualiser les seuils.</p>
                    )}
                  </div>
                </div>
              </div>
            </BenchmarkSection>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 px-5 py-4 sm:px-6 sm:py-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mr-auto gap-1.5"
            onClick={handleReset}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Valeurs par défaut
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={handleSave}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
