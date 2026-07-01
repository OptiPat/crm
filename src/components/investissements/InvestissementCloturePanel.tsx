import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  closeInvestissement,
  reopenInvestissement,
  type Investissement,
} from "@/lib/api/tauri-investissements";
import { dateFieldToIso, todayLocal } from "@/lib/contacts/contact-form-utils";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import {
  isInvestissementActifEncours,
  isInvestissementCloture,
} from "@/lib/investissements/investissement-statut";
import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";

export function InvestissementCloturePanel({
  investissement,
  onChanged,
}: {
  investissement: Investissement;
  onChanged?: (updated: Investissement) => void;
}) {
  const [dateCloture, setDateCloture] = useState(todayLocal());
  const [saving, setSaving] = useState(false);
  const isActif = isInvestissementActifEncours(investissement);
  const isCloture = isInvestissementCloture(investissement);

  useEffect(() => {
    if (isActif) {
      setDateCloture(todayLocal());
    }
  }, [investissement.id, isActif]);

  const handleClose = async () => {
    setSaving(true);
    try {
      const updated = await closeInvestissement(investissement.id, {
        date_cloture: dateFieldToIso(dateCloture),
      });
      toast.success(
        "Investissement clôturé — sorti de l'encours. Suivi client en pause si plus d'encours actif."
      );
      onChanged?.(updated);
    } catch (error) {
      console.error(error);
      toast.error("Impossible de clôturer l'investissement");
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    if (
      !window.confirm(
        `Rouvrir « ${investissement.nom_produit} » et le remettre dans l'encours ?`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const updated = await reopenInvestissement(investissement.id);
      toast.success("Investissement rouvert — suivi client réactivé si nécessaire");
      onChanged?.(updated);
    } catch (error) {
      console.error(error);
      toast.error("Impossible de rouvrir l'investissement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium">Sortie d&apos;encours</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Clôturer retire le placement de votre encours actuel tout en conservant
          l&apos;historique dans vos statistiques de vente. Si c&apos;était le
          dernier encours actif du client, son suivi passe automatiquement en
          pause.
        </p>
      </div>

      {isActif && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="space-y-2 flex-1">
            <Label htmlFor="date-cloture">Date de clôture</Label>
            <Input
              id="date-cloture"
              type="date"
              value={dateCloture}
              onChange={(e) => setDateCloture(e.target.value)}
              disabled={saving}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2 shrink-0"
            onClick={() => void handleClose()}
            disabled={saving}
          >
            <Archive className="h-4 w-4" />
            Clôturer
          </Button>
        </div>
      )}

      {isCloture && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-medium text-muted-foreground">Clôturé</span>
            {investissement.date_cloture != null && (
              <span> — {formatCalendarDateFr(investissement.date_cloture)}</span>
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            className="gap-2 shrink-0 text-emerald-700 hover:text-emerald-800"
            onClick={() => void handleReopen()}
            disabled={saving}
          >
            <ArchiveRestore className="h-4 w-4" />
            Rouvrir
          </Button>
        </div>
      )}
    </div>
  );
}
