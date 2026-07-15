import { useCallback, useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import {
  REMUNERATION_TPC_OPTIONS,
  type RemunerationTpcPercent,
} from "@/lib/pipe/remuneration-calc";
import {
  currentFiscalYearLabel,
  listSelectableFiscalYearLabels,
} from "@/lib/pipe/remuneration-fiscal-year";
import {
  getRemunerationCifEnabled,
  getTpcForFiscalYear,
  setRemunerationCifEnabled,
  setTpcForFiscalYear,
} from "@/lib/pipe/remuneration-settings";
import { toast } from "sonner";

export function ParametresRemunerationSection() {
  const [fiscalYear, setFiscalYear] = useState(() => currentFiscalYearLabel());
  const [tpc, setTpc] = useState<RemunerationTpcPercent | null>(null);
  const [cifEnabled, setCifEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async (year: string) => {
    setLoading(true);
    try {
      const [storedTpc, cif] = await Promise.all([
        getTpcForFiscalYear(year),
        getRemunerationCifEnabled(),
      ]);
      setTpc(storedTpc);
      setCifEnabled(cif);
    } catch (err) {
      console.error(err);
      toast.error("Impossible de charger les réglages rémunération");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(fiscalYear);
  }, [fiscalYear, reload]);

  const saveTpc = async (value: string) => {
    const parsed = Number(value.replace(",", "."));
    if (!REMUNERATION_TPC_OPTIONS.includes(parsed as RemunerationTpcPercent)) return;
    setSaving(true);
    try {
      await setTpcForFiscalYear(fiscalYear, parsed as RemunerationTpcPercent);
      setTpc(parsed as RemunerationTpcPercent);
      toast.success(`TPC ${parsed} % enregistré pour ${fiscalYear}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleCif = async (checked: boolean) => {
    setSaving(true);
    try {
      await setRemunerationCifEnabled(checked);
      setCifEnabled(checked);
      toast.success(checked ? "Mode CIF activé" : "Mode CIF désactivé");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPanel
      title="Rémunération"
      description="TPC par année fiscale (01/08 → 31/07) et statut CIF pour le calcul PV."
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="space-y-6 max-w-md">
          <div className="space-y-2">
            <Label>Année fiscale</Label>
            <Select value={fiscalYear} onValueChange={setFiscalYear} disabled={saving}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {listSelectableFiscalYearLabels().map((year) => (
                  <SelectItem key={year} value={year}>
                    {year} (01/08 → 31/07)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>TPC — taux personnel de commission</Label>
            <Select
              value={tpc != null ? String(tpc) : ""}
              onValueChange={(v) => void saveTpc(v)}
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir un taux" />
              </SelectTrigger>
              <SelectContent>
                {REMUNERATION_TPC_OPTIONS.map((rate) => (
                  <SelectItem key={rate} value={String(rate)}>
                    {rate} %
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Appliqué à tous les investissements clos durant cette année fiscale.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Checkbox
              id="remuneration-cif"
              checked={cifEnabled}
              disabled={saving}
              onCheckedChange={(v) => void toggleCif(v === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="remuneration-cif" className="cursor-pointer">
                Je suis CIF
              </Label>
              <p className="text-xs text-muted-foreground leading-snug">
                PV 0,5 (au lieu de 0,4) pour SCPI, FIP, FCPI, FCPR… — réglage permanent.
              </p>
            </div>
          </div>
        </div>
      )}
    </SettingsPanel>
  );
}
