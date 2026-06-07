import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createInvestissementVersement,
  deleteInvestissementVersement,
  getVersementsByInvestissement,
  type InvestissementVersement,
} from "@/lib/api/tauri-investissement-versements";
import { dateFieldToIso, todayLocal } from "@/lib/contacts/contact-form-utils";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { Loader2, PlusCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function InvestissementVersementsPanel({
  investissementId,
  onUpdated,
}: {
  investissementId: number;
  onUpdated?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [versements, setVersements] = useState<InvestissementVersement[]>([]);
  const [montant, setMontant] = useState("");
  const [dateVersement, setDateVersement] = useState(todayLocal());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setVersements(await getVersementsByInvestissement(investissementId));
    } catch (error) {
      console.error(error);
      toast.error("Impossible de charger les versements complémentaires");
    } finally {
      setLoading(false);
    }
  }, [investissementId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    const parsed = parseFloat(montant.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Saisissez un montant valide");
      return;
    }
    setSaving(true);
    try {
      await createInvestissementVersement({
        investissement_id: investissementId,
        montant: Math.round(parsed * 100),
        date_versement: dateFieldToIso(dateVersement),
      });
      toast.success("Versement complémentaire enregistré");
      setMontant("");
      setDateVersement(todayLocal());
      await load();
      onUpdated?.();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Erreur lors de l'enregistrement"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer ce versement complémentaire ?")) return;
    try {
      await deleteInvestissementVersement(id);
      toast.success("Versement supprimé");
      await load();
      onUpdated?.();
    } catch (error) {
      console.error(error);
      toast.error("Impossible de supprimer");
    }
  };

  const totalCentimes = versements.reduce((sum, v) => sum + v.montant, 0);

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-start gap-2">
        <PlusCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">Versements complémentaires</p>
          <p className="text-xs text-muted-foreground">
            Apports ponctuels datés — augmentent l&apos;encours et les signatures de l&apos;année.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`versement-montant-${investissementId}`}>Montant (€)</Label>
          <Input
            id={`versement-montant-${investissementId}`}
            type="number"
            step="0.01"
            min="0"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="Ex: 5000"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAdd();
              }
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`versement-date-${investissementId}`}>Date du versement</Label>
          <Input
            id={`versement-date-${investissementId}`}
            type="date"
            value={dateVersement}
            onChange={(e) => setDateVersement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAdd();
              }
            }}
          />
        </div>
        <Button type="button" disabled={saving} onClick={() => void handleAdd()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ajouter"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : versements.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun versement complémentaire enregistré.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Total complémentaire : {formatEuroCentimes(totalCentimes)}
          </p>
          <ul className="space-y-1.5 max-h-36 overflow-y-auto rounded-md border border-border/60 p-2">
            {[...versements].reverse().map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-2 text-sm py-0.5"
              >
                <span className="tabular-nums">
                  {formatEuroCentimes(v.montant)}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {formatCalendarDateFr(v.date_versement)}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => void handleDelete(v.id)}
                  aria-label="Supprimer ce versement"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
