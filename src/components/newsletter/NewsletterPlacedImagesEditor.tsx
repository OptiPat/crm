import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GeneratedNewsletterContent, NewsletterPlacedImage } from "@/lib/api/tauri-newsletter";
import {
  buildPlacementOptions,
  parsePlacementKey,
  placementKey,
  placementLabel,
} from "@/lib/newsletter/newsletter-images";
import { newNewsletterImageId, pickNewsletterImageDataUrl } from "@/lib/newsletter/newsletter-image-import";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type NewsletterPlacedImagesEditorProps = {
  draft: GeneratedNewsletterContent;
  onChange: (next: GeneratedNewsletterContent) => void;
};

export function NewsletterPlacedImagesEditor({
  draft,
  onChange,
}: NewsletterPlacedImagesEditorProps) {
  const [importing, setImporting] = useState(false);
  const images = draft.images ?? [];
  const sectionCount = draft.sections.length;
  const placementOptions = buildPlacementOptions(sectionCount);

  const updateImages = (next: NewsletterPlacedImage[]) => {
    onChange({ ...draft, images: next, headerImageUrl: undefined });
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await pickNewsletterImageDataUrl();
      if (!result) return;
      if (result.tooLarge) {
        toast.error("Image trop lourde (max ~800 Ko embarqués dans l'email)");
        return;
      }
      updateImages([
        ...images,
        {
          id: newNewsletterImageId(),
          dataUrl: result.dataUrl,
          placement: { type: "after_intro" },
        },
      ]);
      toast.success("Image ajoutée — choisissez sa position");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import image impossible");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3 bg-muted/10">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">Images</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={importing}
          onClick={() => void handleImport()}
        >
          {importing ?
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          : <ImagePlus className="h-4 w-4 mr-1" />}
          Importer
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Importez depuis votre PC, puis placez chaque image où vous voulez dans le mail.
      </p>
      {images.length === 0 ?
        <p className="text-xs text-muted-foreground italic">Aucune image.</p>
      : <ul className="space-y-3">
          {images.map((image, index) => (
            <li key={image.id} className="flex gap-3 items-start rounded-md border p-2 bg-background">
              <img
                src={image.dataUrl}
                alt=""
                className="w-16 h-16 object-cover rounded border shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-2">
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  value={placementKey(image.placement)}
                  onChange={(e) => {
                    const next = [...images];
                    next[index] = {
                      ...image,
                      placement: parsePlacementKey(e.target.value, sectionCount),
                    };
                    updateImages(next);
                  }}
                >
                  {placementOptions.map((placement) => {
                    const key = placementKey(placement);
                    return (
                      <option key={key} value={key}>
                        {placementLabel(placement, sectionCount)}
                      </option>
                    );
                  })}
                </select>
                <Input
                  className="h-8 text-xs"
                  placeholder="Texte alternatif (optionnel)"
                  value={image.alt ?? ""}
                  onChange={(e) => {
                    const next = [...images];
                    next[index] = { ...image, alt: e.target.value };
                    updateImages(next);
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8"
                onClick={() => updateImages(images.filter((_, i) => i !== index))}
                aria-label="Supprimer l'image"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      }
    </div>
  );
}
