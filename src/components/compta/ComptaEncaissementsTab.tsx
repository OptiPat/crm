import { useMemo, useState } from "react";
import { Copy, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ComptaDriveLinkField } from "@/components/compta/ComptaDriveLinkField";
import { ComptaListSortSelect } from "@/components/compta/ComptaListSortSelect";
import {
  createComptaEncaissement,
  deleteComptaEncaissement,
  updateComptaEncaissement,
  type ComptaEncaissement,
  type NewComptaEncaissement,
} from "@/lib/api/tauri-compta";
import {
  computeEncaissementTotals,
  formatComptaMoney,
} from "@/lib/compta/compta-money";
import { formatComptaDateFr, todayDateInput } from "@/lib/compta/compta-month";
import { parseComptaSortValue, sortComptaEncaissements } from "@/lib/compta/compta-list-sort";
import {
  comptaJournalTypeBadgeClass,
  comptaJournalTypeLabel,
  comptaTypeListCardClass,
} from "@/lib/compta/compta-journal";
import { openComptaDriveLink } from "@/lib/compta/compta-drive";
import { useComptaNameSuggestions } from "@/hooks/useComptaNameSuggestions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ENCAISSEMENT_SORT_OPTIONS = [
  { value: "date-desc", label: "Date (récent)" },
  { value: "date-asc", label: "Date (ancien)" },
  { value: "client-asc", label: "Client A→Z" },
  { value: "total-desc", label: "Montant reçu ↓" },
] as const;

interface ComptaEncaissementsTabProps {
  encaissements: ComptaEncaissement[];
  onChanged: () => Promise<void>;
}

export function ComptaEncaissementsTab({
  encaissements,
  onChanged,
}: ComptaEncaissementsTabProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [sortValue, setSortValue] = useState("date-desc");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [client, setClient] = useState("");
  const [date, setDate] = useState(todayDateInput());
  const [exonere, setExonere] = useState("0");
  const [ht, setHt] = useState("");
  const [tva, setTva] = useState("");
  const [don, setDon] = useState("0");
  const [lienDrive, setLienDrive] = useState("");
  const [busy, setBusy] = useState(false);

  const exonereN = parseFloat(exonere) || 0;
  const htN = parseFloat(ht) || 0;
  const tvaN = parseFloat(tva) || 0;
  const donN = parseFloat(don) || 0;
  const { ttc, total } = computeEncaissementTotals(exonereN, htN, tvaN, donN);

  const clientSuggestions = useMemo(
    () => [...new Set(encaissements.map((e) => e.client).filter(Boolean))],
    [encaissements]
  );
  const nameSuggestions = useComptaNameSuggestions(clientSuggestions);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q
      ? encaissements
      : encaissements.filter((e) => e.client.toLowerCase().includes(q));
    const { key, dir } = parseComptaSortValue(sortValue);
    return sortComptaEncaissements(base, key as "date" | "client" | "total", dir);
  }, [encaissements, search, sortValue]);

  const monthTotals = useMemo(
    () =>
      encaissements.reduce(
        (acc, e) => ({
          ht: acc.ht + e.ht,
          tva: acc.tva + e.tva,
          total: acc.total + e.total,
          don: acc.don + e.don,
        }),
        { ht: 0, tva: 0, total: 0, don: 0 }
      ),
    [encaissements]
  );

  const resetForm = () => {
    setEditingId(null);
    setClient("");
    setDate(todayDateInput());
    setExonere("0");
    setHt("");
    setTva("");
    setDon("0");
    setLienDrive("");
  };

  const openNewForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const loadEdit = (e: ComptaEncaissement) => {
    setEditingId(e.id);
    setClient(e.client);
    setDate(e.date);
    setExonere(String(e.exonere));
    setHt(String(e.ht));
    setTva(String(e.tva));
    setDon(String(e.don));
    setLienDrive(e.lienDrive ?? "");
    setFormOpen(true);
  };

  const duplicateEncaissement = (e: ComptaEncaissement) => {
    setEditingId(null);
    setClient(e.client);
    setDate(e.date);
    setExonere(String(e.exonere));
    setHt(String(e.ht));
    setTva(String(e.tva));
    setDon(String(e.don));
    setLienDrive(e.lienDrive ?? "");
    setFormOpen(true);
  };

  const buildPayload = (): NewComptaEncaissement => ({
    client: client.trim(),
    date,
    exonere: exonereN,
    ht: htN,
    tva: tvaN,
    ttc,
    total,
    don: donN,
    isPartenaire: false,
    lienDrive: lienDrive.trim() || null,
  });

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!client.trim() || !ht) {
      toast.error("Remplissez les champs obligatoires");
      return;
    }
    setBusy(true);
    try {
      const payload = buildPayload();
      if (editingId != null) {
        await updateComptaEncaissement(editingId, payload);
        toast.success("Encaissement modifié");
      } else {
        await createComptaEncaissement(payload);
        toast.success("Encaissement ajouté");
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
      await deleteComptaEncaissement(deleteId);
      toast.success("Encaissement supprimé");
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
          Nouvel encaissement
        </Button>
        <ComptaListSortSelect
          value={sortValue}
          onValueChange={setSortValue}
          options={[...ENCAISSEMENT_SORT_OPTIONS]}
        />
      </div>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {editingId != null ? "Modifier l'encaissement" : "Nouvel encaissement"}
            </SheetTitle>
          </SheetHeader>
          <form className="mt-6 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="enc-client">Nom du client</Label>
                <Input
                  id="enc-client"
                  list="compta-clients-list"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  required
                />
                <datalist id="compta-clients-list">
                  {nameSuggestions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label htmlFor="enc-date">Date du paiement</Label>
                <Input id="enc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="enc-exo">Montant exonéré (€)</Label>
                <Input id="enc-exo" type="number" step="0.01" min="0" value={exonere} onChange={(e) => setExonere(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="enc-ht">Montant HT (€)</Label>
                <Input id="enc-ht" type="number" step="0.01" min="0" value={ht} onChange={(e) => setHt(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="enc-tva">Montant TVA (€)</Label>
                <Input id="enc-tva" type="number" step="0.01" min="0" value={tva} onChange={(e) => setTva(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Total TTC</Label>
                <p className="text-lg font-semibold">{formatComptaMoney(ttc)}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="enc-don">Montant don (€)</Label>
                <Input id="enc-don" type="number" step="0.01" min="0" value={don} onChange={(e) => setDon(e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Total reçu (après don)</Label>
                <p className="text-lg font-semibold text-emerald-600">{formatComptaMoney(total)}</p>
              </div>
            </div>
            <ComptaDriveLinkField
              id="enc-drive"
              label="Facture Google Drive"
              value={lienDrive}
              onChange={setLienDrive}
            />
            <SheetFooter className="gap-2 sm:justify-start">
              <Button type="submit" disabled={busy}>
                {editingId != null ? "Enregistrer" : "Ajouter l'encaissement"}
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

      <Input placeholder="Rechercher un encaissement…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Aucun encaissement pour ce mois</p>
        ) : (
          filtered.map((e) => (
            <Card key={e.id} className={cn(comptaTypeListCardClass("encaissement"))}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <div className="text-sm text-muted-foreground w-24 shrink-0">
                  {formatComptaDateFr(e.date)}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(comptaJournalTypeBadgeClass("encaissement"))}
                    >
                      {comptaJournalTypeLabel("encaissement")}
                    </Badge>
                    <p className="font-medium">{e.client}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    HT {formatComptaMoney(e.ht)} · TVA {formatComptaMoney(e.tva)}
                    {e.exonere > 0 ? ` · Exo ${formatComptaMoney(e.exonere)}` : ""}
                    {e.don > 0 ? ` · Don ${formatComptaMoney(e.don)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-emerald-600">+{formatComptaMoney(e.total)}</p>
                  <p className="text-xs text-muted-foreground">après don</p>
                </div>
                <div className="flex gap-1 ml-auto">
                  {e.lienDrive ? (
                    <Button type="button" variant="ghost" size="icon" onClick={() => void openComptaDriveLink(e.lienDrive!)}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="icon" onClick={() => loadEdit(e)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => duplicateEncaissement(e)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setDeleteId(e.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {encaissements.length > 0 ? (
        <Card className="border-t-2 bg-muted/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm font-medium">
            <span>
              Totaux du mois ({encaissements.length} ligne
              {encaissements.length > 1 ? "s" : ""})
            </span>
            <div className="flex flex-wrap gap-4 tabular-nums">
              <span>HT {formatComptaMoney(monthTotals.ht)}</span>
              <span>TVA {formatComptaMoney(monthTotals.tva)}</span>
              {monthTotals.don > 0 ? (
                <span>Don {formatComptaMoney(monthTotals.don)}</span>
              ) : null}
              <span className="text-emerald-600">
                Reçu {formatComptaMoney(monthTotals.total)}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet encaissement ?</AlertDialogTitle>
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
