import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import { getEtiquetteQueueItemKey } from "@/lib/etiquettes/etiquette-queue-item-key";

type EtiquetteEnvoisSelectionBarProps = {
  items: EtiquetteEmailQueueItem[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  removeLabel: string;
  onRemoveSelection: () => void;
  removeDisabled?: boolean;
  selectDisabled?: boolean;
  trailing?: React.ReactNode;
  selectAllLabel?: string;
};

export function EtiquetteEnvoisSelectionBar({
  items,
  selectedIds,
  onSelectedIdsChange,
  removeLabel,
  onRemoveSelection,
  removeDisabled = false,
  selectDisabled = false,
  trailing,
  selectAllLabel = "Tout sélectionner",
}: EtiquetteEnvoisSelectionBarProps) {
  const selectedCount = items.filter((i) =>
    selectedIds.has(getEtiquetteQueueItemKey(i))
  ).length;
  const allSelected = items.length > 0 && selectedCount === items.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Checkbox
        checked={allSelected}
        disabled={selectDisabled || items.length === 0}
        onCheckedChange={(v) => {
          if (v === true) {
            onSelectedIdsChange(new Set(items.map((i) => getEtiquetteQueueItemKey(i))));
          } else {
            onSelectedIdsChange(new Set());
          }
        }}
      />
      <span className="text-sm text-muted-foreground">{selectAllLabel}</span>
      {trailing}
      <Button
        size="sm"
        variant="outline"
        className="ml-auto"
        disabled={selectedCount === 0 || removeDisabled}
        onClick={onRemoveSelection}
      >
        {removeLabel} ({selectedCount})
      </Button>
    </div>
  );
}
