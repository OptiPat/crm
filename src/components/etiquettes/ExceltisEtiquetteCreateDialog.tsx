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
import { Input } from "@/components/ui/input";
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
  findExceltisEtiquetteInList,
  formatExceltisEtiquetteNom,
  getExceltisMillesimeProposals,
  resolveCreatableExceltisMillesime,
  type ExceltisGamme,
} from "@/lib/etiquettes/exceltis";
import { getAllEtiquettes, type Etiquette } from "@/lib/api/tauri-etiquettes";
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
  const millesimeProposals = useMemo(() => getExceltisMillesimeProposals(), []);
  const [catalogueEtiquettes, setCatalogueEtiquettes] = useState<Etiquette[]>([]);
  const [catalogueStatus, setCatalogueStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [gamme, setGamme] = useState<ExceltisGamme>("Rendement");
  const [month, setMonth] = useState(millesimeProposals[0]?.month ?? 1);
  const [year, setYear] = useState(millesimeProposals[0]?.year ?? new Date().getFullYear());
  const [rendementCible, setRendementCible] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const yearOptions = useMemo(() => buildYearOptions(new Date().getFullYear()), []);
  const previewNom = formatExceltisEtiquetteNom(gamme, month, year);
  const existingEtiquette = useMemo(
    () => findExceltisEtiquetteInList(gamme, month, year, catalogueEtiquettes),
    [gamme, month, year, catalogueEtiquettes]
  );
  const selectionAlreadyExists = existingEtiquette != null;
  const creatableProposal = useMemo(
    () => resolveCreatableExceltisMillesime(gamme, catalogueEtiquettes),
    [gamme, catalogueEtiquettes]
  );
  const allMillesimesExist = creatableProposal == null;

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setSubmitting(false);
    setRendementCible("");
    setCatalogueStatus("loading");
    setCatalogueEtiquettes([]);

    void getAllEtiquettes()
      .then((etiquettes) => {
        if (cancelled) {
          return;
        }
        setCatalogueEtiquettes(etiquettes);
        setCatalogueStatus("ready");
        const initialGamme: ExceltisGamme = "Rendement";
        const firstCreatable = resolveCreatableExceltisMillesime(initialGamme, etiquettes);
        setGamme(initialGamme);
        if (firstCreatable) {
          setMonth(firstCreatable.month);
          setYear(firstCreatable.year);
        } else {
          const fallback = getExceltisMillesimeProposals()[0];
          setMonth(fallback?.month ?? 1);
          setYear(fallback?.year ?? new Date().getFullYear());
        }
      })
      .catch((error) => {
        console.error("Error loading Exceltis catalogue:", error);
        if (!cancelled) {
          setCatalogueEtiquettes([]);
          setCatalogueStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleGammeChange = (nextGamme: ExceltisGamme) => {
    setGamme(nextGamme);
    const firstCreatable = resolveCreatableExceltisMillesime(nextGamme, catalogueEtiquettes);
    if (firstCreatable) {
      setMonth(firstCreatable.month);
      setYear(firstCreatable.year);
    }
  };

  const applyProposal = (proposalMonth: number, proposalYear: number) => {
    setMonth(proposalMonth);
    setYear(proposalYear);
  };

  const handleSubmit = async () => {
    if (catalogueStatus !== "ready") {
      toast.error("Catalogue des étiquettes non chargé — réessayez dans un instant");
      return;
    }
    if (selectionAlreadyExists) {
      toast.info(`L'étiquette « ${previewNom} » existe déjà`);
      return;
    }

    setSubmitting(true);
    try {
      const { nom, created, clonedFrom } = await ensureExceltisEtiquette(
        gamme,
        month,
        year,
        undefined,
        rendementCible
      );
      notifyEtiquettesChanged();
      if (created) {
        toast.success(
          clonedFrom
            ? `Étiquette « ${nom} » créée (paramétrage repris de « ${clonedFrom} »)`
            : `Étiquette « ${nom} » créée`
        );
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
            Choisissez la gamme et un millésime pas encore créé. Le nom est généré
            automatiquement pour le rapprochement avec les mails Stellium.
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
                  onClick={() => handleGammeChange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Raccourcis millésime {gamme}
            </Label>
            <div className="flex flex-wrap gap-2">
              {millesimeProposals.map((opt) => {
                const active = month === opt.month && year === opt.year;
                const exists = findExceltisEtiquetteInList(
                  gamme,
                  opt.month,
                  opt.year,
                  catalogueEtiquettes
                );
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={exists != null}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      exists
                        ? "border-muted bg-muted/60 text-muted-foreground cursor-not-allowed opacity-70"
                        : active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input bg-background hover:bg-muted"
                    }`}
                    onClick={() => applyProposal(opt.month, opt.year)}
                  >
                    {opt.label}
                    <span className="text-muted-foreground ml-1">(M+{opt.offset})</span>
                    {exists && (
                      <span className="block text-[10px] text-muted-foreground">Existe</span>
                    )}
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

          {!selectionAlreadyExists && (
            <div className="space-y-2">
              <Label htmlFor="exceltis-rendement-create">Rendement cible (optionnel)</Label>
              <Input
                id="exceltis-rendement-create"
                value={rendementCible}
                onChange={(e) => setRendementCible(e.target.value)}
                placeholder="ex. 9 %/an"
              />
              <p className="text-xs text-muted-foreground">
                Utilisé dans le mail via{" "}
                <code className="text-[11px] bg-muted px-1 rounded">
                  {"{{rendement_exceltis}}"}
                </code>
              </p>
            </div>
          )}

          <div
            className={`rounded-md border px-3 py-2.5 space-y-1 ${
              selectionAlreadyExists
                ? "border-muted bg-muted/40"
                : "border-amber-200/80 bg-amber-50/50"
            }`}
          >
            <p className="text-xs font-medium text-muted-foreground">Nom généré</p>
            <p className="text-sm font-medium text-foreground">{previewNom}</p>
            {selectionAlreadyExists ? (
              <p className="text-xs text-muted-foreground">
                Cette étiquette existe déjà dans le catalogue — choisissez un autre millésime
                ou une autre gamme.
              </p>
            ) : allMillesimesExist ? (
              <p className="text-xs text-muted-foreground">
                Les millésimes M+1 à M+3 existent déjà pour {gamme}. Utilisez mois/année
                manuellement ou une autre gamme.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Campagne et tâche reprises de la dernière étiquette Exceltis de la gamme
                (modèle mail, pipeline, titre de tâche adapté au millésime). Déclenchement
                effectif au mail Stellium « Remboursement Exceltis ».
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={
              submitting ||
              selectionAlreadyExists ||
              catalogueStatus !== "ready"
            }
          >
            {submitting
              ? "Création…"
              : catalogueStatus === "loading"
                ? "Chargement…"
                : catalogueStatus === "error"
                  ? "Catalogue indisponible"
                  : selectionAlreadyExists
                    ? "Déjà créée"
                    : "Créer l'étiquette"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
