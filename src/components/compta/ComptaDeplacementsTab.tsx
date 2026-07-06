import { useMemo, useState } from "react";
import { Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createComptaDeplacement,
  deleteComptaDeplacement,
  updateComptaDeplacement,
  type ComptaConfig,
  type ComptaDeplacement,
  type NewComptaDeplacement,
} from "@/lib/api/tauri-compta";
import {
  computeDrivingDistanceKm,
  computeIndemniteKm,
} from "@/lib/compta/compta-distance";
import { formatComptaMoney } from "@/lib/compta/compta-money";
import { formatComptaDateFr, todayDateInput } from "@/lib/compta/compta-month";
import { parseComptaSortValue, sortComptaDeplacements } from "@/lib/compta/compta-list-sort";
import {
  comptaJournalTypeBadgeClass,
  comptaJournalTypeLabel,
  comptaTypeListCardClass,
} from "@/lib/compta/compta-journal";
import { ComptaListSortSelect } from "@/components/compta/ComptaListSortSelect";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DEPLACEMENT_SORT_OPTIONS = [
  { value: "date-desc", label: "Date (récent)" },
  { value: "date-asc", label: "Date (ancien)" },
  { value: "destination-asc", label: "Destination A→Z" },
  { value: "indemnite-desc", label: "Indemnité ↓" },
] as const;

interface ComptaDeplacementsTabProps {
  config: ComptaConfig;
  deplacements: ComptaDeplacement[];
  onChanged: () => Promise<void>;
}

export function ComptaDeplacementsTab({
  config,
  deplacements,
  onChanged,
}: ComptaDeplacementsTabProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [sortValue, setSortValue] = useState("date-desc");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [date, setDate] = useState(todayDateInput());
  const [destination, setDestination] = useState("");
  const [objet, setObjet] = useState("");
  const [km, setKm] = useState<number | null>(null);
  const [indemnite, setIndemnite] = useState<number | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q
      ? deplacements
      : deplacements.filter(
          (d) =>
            d.destination.toLowerCase().includes(q) ||
            d.objet.toLowerCase().includes(q)
        );
    const { key, dir } = parseComptaSortValue(sortValue);
    return sortComptaDeplacements(base, key as "date" | "destination" | "indemnite", dir);
  }, [deplacements, search, sortValue]);

  const monthTotals = useMemo(
    () =>
      deplacements.reduce(
        (acc, d) => ({
          km: acc.km + d.km,
          indemnite: acc.indemnite + d.indemnite,
        }),
        { km: 0, indemnite: 0 }
      ),
    [deplacements]
  );

  const resetForm = () => {
    setEditingId(null);
    setDate(todayDateInput());
    setDestination("");
    setObjet("");
    setKm(null);
    setIndemnite(null);
  };

  const openNewForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const loadEdit = (d: ComptaDeplacement) => {
    setEditingId(d.id);
    setDate(d.date);
    setDestination(d.destination);
    setObjet(d.objet);
    setKm(d.km);
    setIndemnite(d.indemnite);
    setFormOpen(true);
  };

  const duplicateDeplacement = (d: ComptaDeplacement) => {
    setEditingId(null);
    setDate(d.date);
    setDestination(d.destination);
    setObjet(d.objet);
    setKm(d.km);
    setIndemnite(d.indemnite);
    setFormOpen(true);
  };

  const handleCalculate = async () => {
    if (!config.adresseDepart.trim()) {
      toast.error("Renseignez l'adresse de départ dans la configuration");
      return;
    }
    if (!destination.trim()) {
      toast.error("Entrez une adresse de destination");
      return;
    }
    setCalcBusy(true);
    try {
      const oneWay = await computeDrivingDistanceKm(config.adresseDepart, destination);
      const result = computeIndemniteKm(oneWay, config.indemniteKm);
      setKm(result.roundTripKm);
      setIndemnite(result.indemnite);
      toast.success("Distance calculée");
    } catch {
      const manual = window.prompt(
        "Impossible de calculer automatiquement.\nEntrez la distance aller simple en km :"
      );
      if (manual && !Number.isNaN(parseFloat(manual))) {
        const result = computeIndemniteKm(parseFloat(manual), config.indemniteKm);
        setKm(result.roundTripKm);
        setIndemnite(result.indemnite);
      } else {
        toast.error("Calcul de distance échoué");
      }
    } finally {
      setCalcBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (km == null || indemnite == null) {
      toast.error("Calculez d'abord la distance");
      return;
    }
    const payload: NewComptaDeplacement = {
      date,
      destination: destination.trim(),
      objet: objet.trim(),
      km,
      indemnite,
    };
    setBusy(true);
    try {
      if (editingId != null) {
        await updateComptaDeplacement(editingId, payload);
        toast.success("Déplacement modifié");
      } else {
        await createComptaDeplacement(payload);
        toast.success("Déplacement ajouté");
      }
      resetForm();
      setFormOpen(false);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    setBusy(true);
    try {
      await deleteComptaDeplacement(deleteId);
      toast.success("Déplacement supprimé");
      if (editingId === deleteId) resetForm();
      setDeleteId(null);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" onClick={openNewForm}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau déplacement
        </Button>
        <ComptaListSortSelect
          value={sortValue}
          onValueChange={setSortValue}
          options={[...DEPLACEMENT_SORT_OPTIONS]}
        />
      </div>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {editingId != null ? "Modifier le déplacement" : "Nouveau déplacement"}
            </SheetTitle>
          </SheetHeader>
          <form className="mt-6 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="depl-date">Date</Label>
                <Input id="depl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="depl-dest">Destination</Label>
                <Input
                  id="depl-dest"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Adresse complète"
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="depl-objet">Objet du déplacement</Label>
                <Input id="depl-objet" value={objet} onChange={(e) => setObjet(e.target.value)} required />
              </div>
            </div>
            <Button type="button" variant="secondary" disabled={calcBusy} onClick={() => void handleCalculate()}>
              {calcBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Calculer la distance
            </Button>
            {km != null && indemnite != null ? (
              <div className="flex flex-wrap gap-6 rounded-lg border p-3 text-sm">
                <span>
                  Distance : <strong>{km.toFixed(1)} km</strong> (aller-retour)
                </span>
                <span>
                  Indemnité : <strong>{formatComptaMoney(indemnite)}</strong>
                </span>
              </div>
            ) : null}
            <SheetFooter className="gap-2 sm:justify-start">
              <Button type="submit" disabled={busy || km == null}>
                {editingId != null ? "Enregistrer" : "Ajouter le déplacement"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  resetForm();
                  setFormOpen(false);
                }}
              >
                Annuler
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Input placeholder="Rechercher un déplacement…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Aucun déplacement pour ce mois</p>
        ) : (
          filtered.map((d) => (
            <Card key={d.id} className={cn(comptaTypeListCardClass("deplacement"))}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <div className="text-sm text-muted-foreground w-24 shrink-0">
                  {formatComptaDateFr(d.date)}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(comptaJournalTypeBadgeClass("deplacement"))}
                    >
                      {comptaJournalTypeLabel("deplacement")}
                    </Badge>
                    <p className="font-medium">{d.destination}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{d.objet}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-blue-600">+{formatComptaMoney(d.indemnite)}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.km.toFixed(1)} km × {config.indemniteKm} €
                  </p>
                </div>
                <div className="flex gap-1 ml-auto">
                  <Button type="button" variant="ghost" size="icon" onClick={() => loadEdit(d)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => duplicateDeplacement(d)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setDeleteId(d.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {deplacements.length > 0 ? (
        <Card className="border-t-2 bg-muted/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm font-medium">
            <span>
              Totaux du mois ({deplacements.length} ligne
              {deplacements.length > 1 ? "s" : ""})
            </span>
            <div className="flex flex-wrap gap-4 tabular-nums">
              <span>{monthTotals.km.toFixed(1)} km</span>
              <span className="text-blue-600">
                Indemnités {formatComptaMoney(monthTotals.indemnite)}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce déplacement ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
