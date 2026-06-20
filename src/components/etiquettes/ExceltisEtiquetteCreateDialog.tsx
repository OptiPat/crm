import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EXCELITIS_GAMME_OPTIONS,
  EXCELITIS_MONTH_OPTIONS,
  ensureExceltisEtiquette,
  formatExceltisEtiquetteNom,
  getExceltisMillesimeProposals,
  type ExceltisGamme,
} from "@/lib/etiquettes/exceltis";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { toast } from "sonner";

function buildYearOptions(referenceYear: number): number[] {
  return Array.from({ length: 5 }, (_, i) => referenceYear - 2 + i);
}

interface ExceltisEtiquetteCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ExceltisEtiquetteCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: ExceltisEtiquetteCreateDialogProps) {
  const defaultMillesime = getExceltisMillesimeProposals()[0];
  const [gamme, setGamme] = useState<ExceltisGamme>("Rendement");
  const [month, setMonth] = useState(defaultMillesime?.month ?? 1);
  const [year, setYear] = useState(defaultMillesime?.year ?? new Date().getFullYear());
  const [submitting, setSubmitting] = useState(false);

  const yearOptions = useMemo(() => buildYearOptions(new Date().getFullYear()), []);
  const previewNom = formatExceltisEtiquetteNom(gamme, month, year);
  const millesimeProposals = useMemo(() => getExceltisMillesimeProposals(), []);

  useEffect(() => {
    if (!open) return;
    const next = getExceltisMillesimeProposals()[0];
    setGamme("Rendement");
    setMonth(next?.month ?? 1);
    setYear(next?.year ?? new Date().getFullYear());
    setSubmitting(false);
  }, [open]);

  const applyProposal = (proposalMonth: number, proposalYear: number) => {
    setMonth(proposalMonth);
    setYear(proposalYear);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { nom, created } = await ensureExceltisEtiquette(gamme, month, year);
      notifyEtiquettesChanged();
      if (created) {
        toast.success(`Étiquette « ${nom} » créée`);
      } else {
        toast.info(`L'étiquette « ${nom} » existe déjà`);
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error creating Exceltis etiquette:", error);
      toast.error("Erreur lors de la création de l'étiquette Exceltis");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Créer une étiquette Exceltis</DialogTitle>
          <DialogDescription>
            Choisissez la gamme et le millésime. Le nom est généré automatiquement pour le
            rapprochement avec les mails Stellium.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Gamme Exceltis</Label>
            <div className="flex flex-wrap gap-2">
              {EXCELITIS_GAMME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    gamme === opt.value
                      ? "border-amber-500 bg-amber-100 text-amber-950"
                      : "border-input bg-background hover:bg-muted"
                  }`}
                  onClick={() => setGamme(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Raccourcis millésime</Label>
            <div className="flex flex-wrap gap-2">
              {millesimeProposals.map((opt) => {
                const active = month === opt.month && year === opt.year;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input bg-background hover:bg-muted"
                    }`}
                    onClick={() => applyProposal(opt.month, opt.year)}
                  >
                    {opt.label}
                    <span className="text-muted-foreground ml-1">(M+{opt.offset})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="exceltis-month">Mois</Label>
              <Select
                value={String(month)}
                onValueChange={(value) => setMonth(Number(value))}
              >
                <SelectTrigger id="exceltis-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXCELITIS_MONTH_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exceltis-year">Année</Label>
              <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
                <SelectTrigger id="exceltis-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Nom généré</p>
            <p className="text-sm font-medium text-foreground">{previewNom}</p>
            <p className="text-xs text-muted-foreground">
              Campagne email inactive à la création — activée à la réception du mail Stellium
              « Remboursement Exceltis ».
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Création…" : "Créer l'étiquette"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
