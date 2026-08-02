import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Star, Trash2, Upload } from "lucide-react";
import {
  listArbitrageFicheTemplates,
  removeArbitrageFicheTemplate,
  setDefaultArbitrageFicheTemplate,
  type ArbitrageFicheProductKind,
  type ArbitrageFicheTemplate,
} from "@/lib/api/tauri-arbitrage-fiche";
import { pickAndInstallArbitrageFicheTemplate } from "@/lib/pdf/arbitrage-fiche-conseil/arbitrage-fiche-template";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ArbitrageFicheTemplatesManagerProps = {
  productKind: ArbitrageFicheProductKind;
  title: string;
  embedded?: boolean;
};

export function ArbitrageFicheTemplatesManager({
  productKind,
  title,
  embedded = false,
}: ArbitrageFicheTemplatesManagerProps) {
  const [templates, setTemplates] = useState<ArbitrageFicheTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await listArbitrageFicheTemplates(productKind));
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [productKind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleInstall = async () => {
    setUploading(true);
    try {
      const created = await pickAndInstallArbitrageFicheTemplate(productKind);
      if (created) {
        await refresh();
        toast.success(`Modèle « ${created.label} » enregistré`);
      }
    } catch (error) {
      console.error(error);
      toast.error(`Impossible d'enregistrer le modèle : ${String(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      await setDefaultArbitrageFicheTemplate(templateId, productKind);
      await refresh();
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    }
  };

  const handleRemove = async (template: ArbitrageFicheTemplate) => {
    try {
      await removeArbitrageFicheTemplate(template.id, productKind);
      await refresh();
      toast.success("Modèle supprimé");
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    }
  };

  return (
    <div
      className={cn(
        "space-y-4",
        embedded && "rounded-xl border border-border/80 bg-background p-4 shadow-sm"
      )}
    >
      <div className="flex items-start gap-3">
        {!embedded ? null : loading || uploading ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground mt-0.5" />
        ) : (
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Préparez votre PDF pré-rempli, puis ajoutez-le ici (nom = nom du fichier). À la
            génération : nom, prénom et n° de contrat du client.
          </p>
        </div>
      </div>

      {templates.length > 0 ? (
        <ul className="space-y-2">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{template.label}</span>
              {template.isDefault ? (
                <span className="text-xs text-amber-700 dark:text-amber-400 shrink-0">
                  Par défaut
                </span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title="Définir par défaut"
                  onClick={() => void handleSetDefault(template.id)}
                >
                  <Star className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive"
                title="Supprimer"
                onClick={() => void handleRemove(template)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Aucun modèle {productKind} — requis pour le bouton « Fiche » sur les tâches arbitrage{" "}
          {productKind}.
        </p>
      )}

      <div className={cn(templates.length > 0 && "border-t border-border/60 pt-3")}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading || loading}
          onClick={() => void handleInstall()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-1.5" />
          )}
          Ajouter un modèle PDF…
        </Button>
      </div>
    </div>
  );
}
