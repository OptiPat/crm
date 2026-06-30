import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsPanel, SettingsRow } from "@/components/settings/parametres-ui";
import { ImagePlus, Loader2, Palette, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getAppBranding,
  notifyAppBrandingChanged,
  pickAndStoreAppLogo,
  removeStoredAppLogo,
  saveAppBranding,
  type AppLogoMode,
} from "@/lib/api/tauri-app-branding";
import { DEFAULT_APP_DISPLAY_NAME } from "@/lib/app-branding";
import { resolveAppLogoSrc } from "@/lib/app-branding-resolve";
import { cn } from "@/lib/utils";

type FormState = {
  displayName: string;
  logoMode: AppLogoMode;
  customLogoPath: string | null;
};

function formSnapshot(form: FormState): string {
  return JSON.stringify(form);
}

export function ParametresAppBrandingSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    displayName: DEFAULT_APP_DISPLAY_NAME,
    logoMode: "default",
    customLogoPath: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const branding = await getAppBranding();
      const next: FormState = {
        displayName: branding.displayName,
        logoMode: branding.logoMode,
        customLogoPath:
          branding.logoMode === "custom" ? branding.logoPath : null,
      };
      setForm(next);
      setSavedSnapshot(formSnapshot(next));
      const src = await resolveAppLogoSrc(
        branding.logoMode === "custom" ? branding.logoPath : branding.logoPath
      );
      setPreviewSrc(src);
    } catch (error) {
      console.error(error);
      toast.error("Impossible de charger l'identité de l'application");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (form.logoMode === "default") {
        setPreviewSrc("/app-logo.png");
        return;
      }
      if (form.logoMode === "cabinet") {
        const branding = await getAppBranding().catch(() => null);
        if (cancelled) return;
        if (branding?.logoPath) {
          setPreviewSrc(await resolveAppLogoSrc(branding.logoPath));
        } else {
          setPreviewSrc(null);
        }
        return;
      }
      if (form.customLogoPath) {
        const src = await resolveAppLogoSrc(form.customLogoPath);
        if (!cancelled) setPreviewSrc(src);
      } else if (!cancelled) {
        setPreviewSrc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.logoMode, form.customLogoPath]);

  const isDirty = useMemo(
    () => savedSnapshot !== "" && formSnapshot(form) !== savedSnapshot,
    [form, savedSnapshot]
  );

  const handlePickLogo = async () => {
    setUploading(true);
    try {
      const path = await pickAndStoreAppLogo();
      if (path) {
        setForm((prev) => ({
          ...prev,
          logoMode: "custom",
          customLogoPath: path,
        }));
        toast.success("Logo ajouté — enregistrez pour appliquer.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Impossible d'ajouter le logo");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveCustomLogo = async () => {
    try {
      await removeStoredAppLogo(form.customLogoPath);
      setForm((prev) => ({
        ...prev,
        customLogoPath: null,
        logoMode: prev.logoMode === "custom" ? "default" : prev.logoMode,
      }));
      toast.message("Logo retiré — enregistrez pour appliquer.");
    } catch {
      toast.error("Impossible de supprimer le logo");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveAppBranding({
        displayName: form.displayName.trim() || DEFAULT_APP_DISPLAY_NAME,
        logoMode: form.logoMode,
        logoPath: form.logoMode === "custom" ? form.customLogoPath : null,
      });
      const next: FormState = {
        displayName: saved.displayName,
        logoMode: saved.logoMode,
        customLogoPath: saved.logoMode === "custom" ? saved.logoPath : null,
      };
      setForm(next);
      setSavedSnapshot(formSnapshot(next));
      notifyAppBrandingChanged();
      toast.success("Identité de l'application enregistrée");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Enregistrement impossible";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SettingsPanel title="Identité de l'application" description="Chargement…">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      </SettingsPanel>
    );
  }

  return (
    <SettingsPanel
      title="Identité de l'application"
      description="Nom et logo affichés à la connexion, dans le menu, la barre des tâches et le titre de la fenêtre."
      action={
        isDirty ? (
          <Button size="sm" disabled={saving} onClick={() => void handleSave()}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Enregistrement…
              </>
            ) : (
              "Enregistrer"
            )}
          </Button>
        ) : null
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div
            className={cn(
              "relative h-20 w-20 shrink-0 rounded-2xl border-2 overflow-hidden flex items-center justify-center",
              previewSrc
                ? "border-border bg-white shadow-sm"
                : "border-dashed border-border bg-muted/40"
            )}
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : previewSrc ? (
              <img
                src={previewSrc}
                alt=""
                className="max-h-full max-w-full object-contain p-2"
              />
            ) : (
              <Palette className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium">Aperçu</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Le nom et le logo s&apos;appliquent aussi à la barre des tâches et, si un raccourci
              « CRM W.Y.S » existe sur le bureau ou dans le menu Démarrer, à son icône. Réappliqué
              automatiquement à chaque lancement (y compris après une mise à jour). Le nom de
              l&apos;installateur et le fichier .exe restent « CRM W.Y.S ».
            </p>
          </div>
        </div>

        <SettingsRow
          label="Nom affiché"
          hint="Écran de connexion, menu latéral, titre de la fenêtre"
          htmlFor="app-display-name"
        >
          <Input
            id="app-display-name"
            placeholder={DEFAULT_APP_DISPLAY_NAME}
            value={form.displayName}
            maxLength={80}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, displayName: e.target.value }))
            }
          />
        </SettingsRow>

        <SettingsRow label="Logo" hint="Écran de connexion et menu latéral" htmlFor="app-logo-mode">
          <Select
            value={form.logoMode}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, logoMode: value as AppLogoMode }))
            }
          >
            <SelectTrigger id="app-logo-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Logo par défaut (CRM W.Y.S)</SelectItem>
              <SelectItem value="cabinet">Logo du cabinet (Profil)</SelectItem>
              <SelectItem value="custom">Logo dédié à l&apos;application</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        {form.logoMode === "custom" && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || saving}
              onClick={() => void handlePickLogo()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4 mr-1.5" />
              )}
              {form.customLogoPath ? "Changer le logo" : "Choisir une image"}
            </Button>
            {form.customLogoPath && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleRemoveCustomLogo()}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Retirer
              </Button>
            )}
          </div>
        )}
      </div>
    </SettingsPanel>
  );
}
