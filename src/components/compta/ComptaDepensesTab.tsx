import { useMemo, useState } from "react";
import { Copy, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { ComptaDriveLinkField } from "@/components/compta/ComptaDriveLinkField";
import { ComptaListSortSelect } from "@/components/compta/ComptaListSortSelect";
import {
  createComptaDepense,
  deleteComptaDepense,
  updateComptaDepense,
  type ComptaDepense,
  type NewComptaDepense,
} from "@/lib/api/tauri-compta";
import { COMPTA_CATEGORIES, COMPTA_TVA_RATES } from "@/lib/compta/compta-constants";
import {
  computeDepenseHt,
  computeTvaFromTtc,
  formatComptaMoney,
} from "@/lib/compta/compta-money";
import { formatComptaDateFr, todayDateInput } from "@/lib/compta/compta-month";
import { parseComptaSortValue, sortComptaDepenses } from "@/lib/compta/compta-list-sort";
import {
  comptaJournalTypeBadgeClass,
  comptaJournalTypeLabel,
  comptaTypeListCardClass,
} from "@/lib/compta/compta-journal";
import { openComptaDriveLink } from "@/lib/compta/compta-drive";
import { useComptaNameSuggestions } from "@/hooks/useComptaNameSuggestions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DEPENSE_SORT_OPTIONS = [
  { value: "date-desc", label: "Date (récent)" },
  { value: "date-asc", label: "Date (ancien)" },
  { value: "tiers-asc", label: "Tiers A→Z" },
  { value: "ttc-desc", label: "Montant TTC ↓" },
] as const;

interface ComptaDepensesTabProps {
  depenses: ComptaDepense[];
  onChanged: () => Promise<void>;
}

export function ComptaDepensesTab({ depenses, onChanged }: ComptaDepensesTabProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [sortValue, setSortValue] = useState("date-desc");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [date, setDate] = useState(todayDateInput());
  const [categorie, setCategorie] = useState("");
  const [tiers, setTiers] = useState("");
  const [ttc, setTtc] = useState("");
  const [tva, setTva] = useState("0");
  const [lienDrive, setLienDrive] = useState("");
  const [busy, setBusy] = useState(false);

  const ht = computeDepenseHt(parseFloat(ttc) || 0, parseFloat(tva) || 0);

  const tiersSuggestions = useMemo(
    () => [...new Set(depenses.map((d) => d.tiers).filter(Boolean))],
    [depenses]
  );
  const nameSuggestions = useComptaNameSuggestions(tiersSuggestions);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q
      ? depenses
      : depenses.filter(
          (d) =>
            d.tiers.toLowerCase().includes(q) ||
            d.categorie.toLowerCase().includes(q)
        );
    const { key, dir } = parseComptaSortValue(sortValue);
    return sortComptaDepenses(base, key as "date" | "tiers" | "ttc", dir);
  }, [depenses, search, sortValue]);

  const monthTotals = useMemo(
    () =>
      depenses.reduce(
        (acc, d) => ({
          ht: acc.ht + d.ht,
          tva: acc.tva + d.tva,
          ttc: acc.ttc + d.ttc,
        }),
        { ht: 0, tva: 0, ttc: 0 }
      ),
    [depenses]
  );

  const resetForm = () => {
    setEditingId(null);
    setDate(todayDateInput());
    setCategorie("");
    setTiers("");
    setTtc("");
    setTva("0");
    setLienDrive("");
  };

  const openNewForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const loadEdit = (d: ComptaDepense) => {
    setEditingId(d.id);
    setDate(d.date);
    setCategorie(d.categorie);
    setTiers(d.tiers);
    setTtc(String(d.ttc));
    setTva(String(d.tva));
    setLienDrive(d.lienDrive ?? "");
    setFormOpen(true);
  };

  const duplicateDepense = (d: ComptaDepense) => {
    setEditingId(null);
    setDate(d.date);
    setCategorie(d.categorie);
    setTiers(d.tiers);
    setTtc(String(d.ttc));
    setTva(String(d.tva));
    setLienDrive(d.lienDrive ?? "");
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categorie || !tiers || !ttc) {
      toast.error("Remplissez les champs obligatoires");
      return;
    }
    const payload: NewComptaDepense = {
      date,
      categorie,
      tiers: tiers.trim(),
      ttc: parseFloat(ttc),
      tva: parseFloat(tva) || 0,
      ht,
      lienDrive: lienDrive.trim() || null,
    };
    setBusy(true);
    try {
      if (editingId != null) {
        await updateComptaDepense(editingId, payload);
        toast.success("Dépense modifiée");
      } else {
        await createComptaDepense(payload);
        toast.success("Dépense ajoutée");
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
      await deleteComptaDepense(deleteId);
      toast.success("Dépense supprimée");
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
          Nouvelle dépense
        </Button>
        <ComptaListSortSelect
          value={sortValue}
          onValueChange={setSortValue}
          options={[...DEPENSE_SORT_OPTIONS]}
        />
      </div>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {editingId != null ? "Modifier la dépense" : "Nouvelle dépense"}
            </SheetTitle>
          </SheetHeader>
          <form className="mt-6 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dep-date">Date</Label>
                <Input id="dep-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select value={categorie} onValueChange={setCategorie} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner…" />
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
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="dep-tiers">Tiers</Label>
                <Input
                  id="dep-tiers"
                  list="compta-tiers-list"
                  value={tiers}
                  onChange={(e) => setTiers(e.target.value)}
                  placeholder="Nom du fournisseur"
                  required
                />
                <datalist id="compta-tiers-list">
                  {nameSuggestions.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dep-ttc">Montant TTC (€)</Label>
                <Input
                  id="dep-ttc"
                  type="number"
                  step="0.01"
                  min="0"
                  value={ttc}
                  onChange={(e) => setTtc(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dep-tva">Montant TVA (€)</Label>
                <Input
                  id="dep-tva"
                  type="number"
                  step="0.01"
                  min="0"
                  value={tva}
                  onChange={(e) => setTva(e.target.value)}
                />
                <div className="flex flex-wrap gap-1">
                  {COMPTA_TVA_RATES.map((rate) => (
                    <Button
                      key={rate}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        const ttcVal = parseFloat(ttc) || 0;
                        setTva(String(computeTvaFromTtc(ttcVal, rate)));
                      }}
                    >
                      {rate}%
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Montant HT</Label>
                <p className="text-lg font-semibold">{formatComptaMoney(ht)}</p>
              </div>
            </div>
            <ComptaDriveLinkField
              id="dep-drive"
              label="Justificatif Google Drive"
              value={lienDrive}
              onChange={setLienDrive}
            />
            <SheetFooter className="gap-2 sm:justify-start">
              <Button type="submit" disabled={busy}>
                {editingId != null ? "Enregistrer" : "Ajouter la dépense"}
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

      <Input
        placeholder="Rechercher une dépense…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Aucune dépense pour ce mois</p>
        ) : (
          filtered.map((d) => (
            <Card key={d.id} className={cn(comptaTypeListCardClass("depense"))}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <div className="text-sm text-muted-foreground w-24 shrink-0">
                  {formatComptaDateFr(d.date)}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(comptaJournalTypeBadgeClass("depense"))}
                    >
                      {comptaJournalTypeLabel("depense")}
                    </Badge>
                    <p className="font-medium">{d.tiers}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{d.categorie}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-red-600">-{formatComptaMoney(d.ttc)}</p>
                  <p className="text-xs text-muted-foreground">TVA {formatComptaMoney(d.tva)}</p>
                </div>
                <div className="flex gap-1 ml-auto">
                  {d.lienDrive ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void openComptaDriveLink(d.lienDrive!)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="icon" onClick={() => loadEdit(d)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => duplicateDepense(d)}>
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

      {depenses.length > 0 ? (
        <Card className="border-t-2 bg-muted/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm font-medium">
            <span>Totaux du mois ({depenses.length} ligne{depenses.length > 1 ? "s" : ""})</span>
            <div className="flex flex-wrap gap-4 tabular-nums">
              <span>HT {formatComptaMoney(monthTotals.ht)}</span>
              <span>TVA {formatComptaMoney(monthTotals.tva)}</span>
              <span className="text-red-600">TTC {formatComptaMoney(monthTotals.ttc)}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette dépense ?</AlertDialogTitle>
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
