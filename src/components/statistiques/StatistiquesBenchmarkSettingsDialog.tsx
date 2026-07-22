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
  const [nearPercent, setNearPercent] = useState("80");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const settings = loadStatistiquesBenchmarkSettings();
    setReferenceEuros(formatFilleulVolumeField(settings.groupActiveConsultantVolumeEuros));
    setNearPercent(String(Math.round(settings.nearGroupBenchmarkRatio * 100)));
    setError(null);
  }, [open]);

  const handleReset = () => {
    const defaults = defaultStatistiquesBenchmarkSettings();
    setReferenceEuros(formatFilleulVolumeField(defaults.groupActiveConsultantVolumeEuros));
    setNearPercent(String(Math.round(defaults.nearGroupBenchmarkRatio * 100)));
    setError(null);
  };

  const handleSave = () => {
    const parsedReference = parseFilleulVolumeField(referenceEuros.replace(/\s/g, ""));
    if (parsedReference == null || parsedReference <= 0) {
      setError("Saisissez un montant de référence strictement positif.");
      return;
    }
    const pct = Number.parseInt(nearPercent.trim(), 10);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      setError("Le seuil « proche » doit être entre 1 et 99 %.");
      return;
    }
    saveStatistiquesBenchmarkSettings({
      groupActiveConsultantVolumeEuros: parsedReference,
      nearGroupBenchmarkRatio: pct / 100,
    });
    onOpenChange(false);
  };

  const previewReference = parseFilleulVolumeField(referenceEuros.replace(/\s/g, ""));
  const previewPct = Number.parseInt(nearPercent.trim(), 10);
  const previewFloor =
    previewReference != null &&
    previewReference > 0 &&
    Number.isFinite(previewPct) &&
    previewPct > 0 &&
    previewPct < 100
      ? previewReference * (previewPct / 100)
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
              description="Panneau « Volume moyen / consultant actif » — comparaison à la moyenne groupe."
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

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Aperçu des seuils</Label>
                  <div className="rounded-lg border border-border/60 bg-background px-3 py-2.5 text-xs text-muted-foreground space-y-1.5 min-h-[2.5rem]">
                    {previewReference != null && previewReference > 0 ? (
                      <>
                        <p>
                          Référence :{" "}
                          <span className="font-medium text-foreground tabular-nums">
                            {formatFilleulVolumeDisplay(previewReference)}
                          </span>
                        </p>
                        {previewFloor != null ? (
                          <p>
                            Zone orange :{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {formatFilleulVolumeDisplay(previewFloor)}
                            </span>
                            {" → "}
                            {formatFilleulVolumeDisplay(previewReference)}
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
