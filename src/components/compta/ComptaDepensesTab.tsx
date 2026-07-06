import { useMemo, useState } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { openComptaDriveLink } from "@/lib/compta/compta-drive";
import { toast } from "sonner";

interface ComptaDepensesTabProps {
  depenses: ComptaDepense[];
  onChanged: () => Promise<void>;
}

export function ComptaDepensesTab({ depenses, onChanged }: ComptaDepensesTabProps) {
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return depenses;
    return depenses.filter(
      (d) =>
        d.tiers.toLowerCase().includes(q) ||
        d.categorie.toLowerCase().includes(q)
    );
  }, [depenses, search]);

  const resetForm = () => {
    setEditingId(null);
    setDate(todayDateInput());
    setCategorie("");
    setTiers("");
    setTtc("");
    setTva("0");
    setLienDrive("");
  };

  const loadEdit = (d: ComptaDepense) => {
    setEditingId(d.id);
    setDate(d.date);
    setCategorie(d.categorie);
    setTiers(d.tiers);
    setTtc(String(d.ttc));
    setTva(String(d.tva));
    setLienDrive(d.lienDrive ?? "");
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {editingId != null ? "Modifier la dépense" : "Nouvelle dépense"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
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
                  {tiersSuggestions.map((t) => (
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
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {editingId != null ? "Enregistrer" : "Ajouter la dépense"}
              </Button>
              {editingId != null ? (
                <Button type="button" variant="ghost" onClick={resetForm}>
                  Annuler
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

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
            <Card key={d.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <div className="text-sm text-muted-foreground w-24 shrink-0">
                  {formatComptaDateFr(d.date)}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <p className="font-medium">{d.tiers}</p>
                  <p className="text-sm text-muted-foreground">{d.categorie}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-destructive">-{formatComptaMoney(d.ttc)}</p>
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
                  <Button type="button" variant="ghost" size="icon" onClick={() => setDeleteId(d.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

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
