import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  GeneratedNewsletterContent,
  NewsletterRichBlock,
  NewsletterRichBlockType,
} from "@/lib/api/tauri-newsletter";
import {
  emptyRichBlock,
  RICH_BLOCK_OPTIONS,
} from "@/lib/newsletter/newsletter-blocks";
import {
  buildPlacementOptions,
  parsePlacementKey,
  placementKey,
  placementLabel,
} from "@/lib/newsletter/newsletter-images";
import { Layers, Plus, Trash2 } from "lucide-react";
import { NewsletterRichTextField } from "@/components/newsletter/NewsletterRichTextField";

type NewsletterRichBlocksEditorProps = {
  draft: GeneratedNewsletterContent;
  onChange: (next: GeneratedNewsletterContent) => void;
};

export function NewsletterRichBlocksEditor({
  draft,
  onChange,
}: NewsletterRichBlocksEditorProps) {
  const blocks = draft.blocks ?? [];
  const sectionCount = draft.sections.length;
  const placementOptions = buildPlacementOptions(sectionCount);

  const updateBlocks = (next: NewsletterRichBlock[]) => {
    onChange({ ...draft, blocks: next.length > 0 ? next : undefined });
  };

  const updateBlock = (index: number, patch: Partial<NewsletterRichBlock>) => {
    const next = blocks.map((block, i) => (i === index ? { ...block, ...patch } : block));
    updateBlocks(next);
  };

  const addBlock = (type: NewsletterRichBlockType) => {
    updateBlocks([...blocks, emptyRichBlock(type)]);
  };

  return (
    <div className="space-y-3 rounded-lg border p-3 bg-muted/10">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-sm flex items-center gap-1">
          <Layers className="h-4 w-4" />
          Blocs enrichis
        </Label>
        <div className="flex flex-wrap gap-1">
          {RICH_BLOCK_OPTIONS.map((opt) => (
            <Button
              key={opt.id}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => addBlock(opt.id)}
            >
              <Plus className="h-3 w-3 mr-1" />
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Citation, chiffre clé, encart ou séparateur — placez chaque bloc où vous voulez dans le
        mail.
      </p>
      {blocks.length === 0 ?
        <p className="text-xs text-muted-foreground italic">Aucun bloc enrichi.</p>
      : <ul className="space-y-3">
          {blocks.map((block, index) => {
            const typeMeta = RICH_BLOCK_OPTIONS.find((o) => o.id === block.type);
            return (
              <li
                key={block.id}
                className="rounded-md border p-3 bg-background space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {typeMeta?.label ?? block.type}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => updateBlocks(blocks.filter((_, i) => i !== index))}
                    aria-label="Supprimer le bloc"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  value={placementKey(block.placement)}
                  onChange={(e) =>
                    updateBlock(index, {
                      placement: parsePlacementKey(e.target.value, sectionCount),
                    })
                  }
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
                {block.type === "quote" && (
                  <>
                    <NewsletterRichTextField
                      id={`nl-block-quote-${block.id}`}
                      label="Texte de la citation"
                      value={block.text ?? ""}
                      onChange={(text) => updateBlock(index, { text })}
                      minHeight="100px"
                      placeholder="Texte de la citation"
                    />
                    <Input
                      className="text-sm"
                      placeholder="Source (optionnel)"
                      value={block.attribution ?? ""}
                      onChange={(e) => updateBlock(index, { attribution: e.target.value })}
                    />
                  </>
                )}
                {block.type === "stat" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      className="text-sm"
                      placeholder="Ex. 9 %"
                      value={block.value ?? ""}
                      onChange={(e) => updateBlock(index, { value: e.target.value })}
                    />
                    <Input
                      className="text-sm"
                      placeholder="Libellé (ex. Rendement 2025)"
                      value={block.label ?? ""}
                      onChange={(e) => updateBlock(index, { label: e.target.value })}
                    />
                  </div>
                )}
                {block.type === "takeaway" && (
                  <>
                    <Input
                      className="text-sm"
                      placeholder="Titre encart (défaut : À retenir)"
                      value={block.title ?? ""}
                      onChange={(e) => updateBlock(index, { title: e.target.value })}
                    />
                    <NewsletterRichTextField
                      id={`nl-block-takeaway-${block.id}`}
                      label="Points essentiels"
                      value={block.text ?? ""}
                      onChange={(text) => updateBlock(index, { text })}
                      minHeight="100px"
                      placeholder="Points essentiels"
                    />
                  </>
                )}
                {block.type === "divider" && (
                  <p className="text-xs text-muted-foreground italic">
                    Séparateur visuel — aucun texte à saisir.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      }
    </div>
  );
}
