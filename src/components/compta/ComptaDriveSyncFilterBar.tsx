import { Button } from "@/components/ui/button";
import {
  COMPTA_DRIVE_SYNC_FILTERS,
  type ComptaDriveSyncFilter,
} from "@/lib/compta/compta-drive-sync-filter";

interface ComptaDriveSyncFilterBarProps {
  value: ComptaDriveSyncFilter;
  onChange: (value: ComptaDriveSyncFilter) => void;
}

export function ComptaDriveSyncFilterBar({ value, onChange }: ComptaDriveSyncFilterBarProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {COMPTA_DRIVE_SYNC_FILTERS.map((filter) => (
        <Button
          key={filter.id}
          type="button"
          size="sm"
          variant={value === filter.id ? "secondary" : "ghost"}
          onClick={() => onChange(filter.id)}
        >
          {filter.label}
        </Button>
      ))}
    </div>
  );
}
