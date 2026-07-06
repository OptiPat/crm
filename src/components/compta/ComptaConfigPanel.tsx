import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveComptaConfig, type ComptaConfig } from "@/lib/api/tauri-compta";
import { comptaDriveFolderName } from "@/lib/compta/compta-month";
import { toast } from "sonner";

interface ComptaConfigPanelProps {
  config: ComptaConfig;
  year: number;
  month: number;
  onSaved: (config: ComptaConfig) => void;
}

export function ComptaConfigPanel({
  config,
  year,
  month,
  onSaved,
}: ComptaConfigPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const syncDraft = () => setDraft(config);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveComptaConfig(draft);
      onSaved(draft);
      toast.success("Configuration comptabilité enregistrée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-base font-medium">Configuration</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!open) syncDraft();
            setOpen((v) => !v);
          }}
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {open ? "Masquer" : "Afficher"}
        </Button>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="compta-adresse">Adresse de départ (km)</Label>
              <Input
                id="compta-adresse"
                value={draft.adresseDepart}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, adresseDepart: e.target.value }))
                }
                placeholder="Adresse complète"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="compta-km">Barème km (€)</Label>
              <Input
                id="compta-km"
                type="number"
                step="0.001"
                min="0"
                value={draft.indemniteKm}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    indemniteKm: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="compta-ors">Clé OpenRouteService (optionnel)</Label>
              <Input
                id="compta-ors"
                type="password"
                value={draft.orsApiKey ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, orsApiKey: e.target.value || null }))
                }
                placeholder="Réservé — calcul km via OSRM par défaut"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="compta-drive-root">Dossier racine Google Drive (ID)</Label>
              <Input
                id="compta-drive-root"
                value={draft.driveRootFolderId}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, driveRootFolderId: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Dossiers attendus ce mois :{" "}
                <span className="font-medium">{comptaDriveFolderName(year, month, "Encaissements")}</span>
                {" · "}
                <span className="font-medium">{comptaDriveFolderName(year, month, "Dépenses")}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Sync Drive : reconnectez Google dans Paramètres → Email si l&apos;accès Drive est
                refusé (nouveau scope requis).
              </p>
            </div>
          </div>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            Enregistrer
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
