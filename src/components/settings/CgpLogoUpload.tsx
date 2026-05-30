import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { pickAndStoreCgpLogo, removeStoredCgpLogo } from "@/lib/api/tauri-cgp-logo";
import { loadCgpLogoDataUrl } from "@/lib/settings/cgp-logo-preview";
import { useCgpLogoPreview } from "@/hooks/useCgpLogoPreview";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CgpLogoUploadProps = {
  logoPath: string | undefined | null;
  onLogoPathChange: (path: string) => void;
  onLogoRemoved: () => void;
  fallbackInitials: string;
};

export function CgpLogoUpload({
  logoPath,
  onLogoPathChange,
  onLogoRemoved,
  fallbackInitials,
}: CgpLogoUploadProps) {
  const { src: previewSrc, loading: previewLoading } = useCgpLogoPreview(logoPath);
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const displaySrc = localPreview ?? previewSrc;

  useEffect(() => {
    setLocalPreview(null);
  }, [logoPath]);

  const handlePick = async () => {
    setUploading(true);
    try {
      const path = await pickAndStoreCgpLogo();
      if (path) {
        onLogoPathChange(path);
        const dataUrl = await loadCgpLogoDataUrl(path);
        setLocalPreview(dataUrl);
        toast.success("Logo ajouté — enregistrez le profil pour conserver.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Impossible d'ajouter le logo");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    try {
      await removeStoredCgpLogo(logoPath);
      onLogoRemoved();
      setLocalPreview(null);
      toast.message("Logo retiré — enregistrez le profil.");
    } catch {
      toast.error("Impossible de supprimer le logo");
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-start gap-4">
      <div
        className={cn(
          "relative h-24 w-24 shrink-0 rounded-2xl border-2 overflow-hidden flex items-center justify-center",
          displaySrc ? "border-border bg-white shadow-sm" : "border-dashed border-border bg-muted/40"
        )}
      >
        {uploading || previewLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : displaySrc ? (
          <img
            src={displaySrc}
            alt="Logo du cabinet"
            className="max-h-full max-w-full object-contain p-2"
          />
        ) : (
          <span className="text-2xl font-serif font-bold text-muted-foreground">{fallbackInitials}</span>
        )}
      </div>
      <div className="space-y-2 flex-1">
        <p className="text-sm font-medium">Logo entreprise</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          PNG ou JPG recommandé (fond transparent si possible). Affiché dans le bandeau profil sur fond blanc ;
          pour les emails, préférez l&apos;import de signature Gmail.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => void handlePick()}>
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4 mr-1.5" />
            )}
            {displaySrc ? "Changer le logo" : "Ajouter un logo"}
          </Button>
          {displaySrc && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleRemove()}>
              <Trash2 className="h-4 w-4 mr-1.5" />
              Retirer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
