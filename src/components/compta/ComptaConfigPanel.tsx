import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  defaultOpen?: boolean;
  onSaved: (config: ComptaConfig) => void;
}

export function ComptaConfigPanel({
  config,
  year,
  month,
  defaultOpen = false,
  onSaved,
}: ComptaConfigPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const syncDraft = () => setDraft(config);
  const adresseOk = config.adresseDepart.trim().length > 0;
  const driveRootOk = config.driveRootFolderId.trim().length > 0;

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
      <CardHeader className="flex flex-row items-center justify-between gap-3 py-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <CardTitle className="text-base font-medium">Configuration</CardTitle>
          {adresseOk ? (
            <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-800">
              <CheckCircle2 className="h-3 w-3" />
              Adresse OK
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-3 w-3" />
              Adresse requise (Agenda / km)
            </Badge>
          )}
          {!driveRootOk ? (
            <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-3 w-3" />
              Drive à configurer
            </Badge>
          ) : null}
        </div>
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
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="compta-drive-root">Dossier racine Google Drive (ID)</Label>
              <Input
                id="compta-drive-root"
                value={draft.driveRootFolderId}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, driveRootFolderId: e.target.value }))
                }
                placeholder="Coller l'ID du dossier racine ComptaZen"
              />
              {!draft.driveRootFolderId.trim() ? (
                <p className="text-xs text-amber-800 rounded-md border border-amber-200 bg-amber-50 p-2">
                  Requis pour la sync Drive : ouvrez le dossier racine dans Google Drive, copiez
                  l&apos;identifiant depuis l&apos;URL (
                  <span className="font-mono">drive.google.com/drive/folders/…</span>
                  ), puis enregistrez.
                </p>
              ) : null}
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
