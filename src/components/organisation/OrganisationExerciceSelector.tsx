import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildOrganisationExerciceOptions,
  ORGANISATION_CURRENT_EXERCICE,
  type OrganisationExerciceSelection,
} from "@/lib/organisation/organisation-volume-history";

type OrganisationExerciceSelectorProps = {
  closedLabels: string[];
  value: OrganisationExerciceSelection;
  onValueChange: (value: OrganisationExerciceSelection) => void;
  className?: string;
  /** Libellé du trigger (ex. « Exercice 2025-2026 ») — le menu garde les libellés d'options. */
  displayTriggerLabel?: string;
};

export function OrganisationExerciceSelector({
  closedLabels,
  value,
  onValueChange,
  className,
  displayTriggerLabel,
}: OrganisationExerciceSelectorProps) {
  const options = buildOrganisationExerciceOptions(closedLabels);

  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as OrganisationExerciceSelection)}
    >
      <SelectTrigger className={className ?? "w-[220px] h-9 text-sm"}>
        {displayTriggerLabel ? (
          <span className="truncate">{displayTriggerLabel}</span>
        ) : (
          <SelectValue placeholder="Exercice" />
        )}
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { ORGANISATION_CURRENT_EXERCICE };
