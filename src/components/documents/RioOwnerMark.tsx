import type { ExtractedData, RioCoupleOwnerHint } from "@/lib/pdf/types";
import { rioOwnerDisplayLabel } from "@/lib/documents/rio-owner-label";

const HINTS: RioCoupleOwnerHint[] = ["person1", "person2", "foyer"];

export function RioOwnerMark({
  data,
  hint,
  onChange,
}: {
  data: ExtractedData;
  hint?: RioCoupleOwnerHint;
  onChange?: (hint: RioCoupleOwnerHint) => void;
}) {
  if (!data.isCouple) return null;
  const label = rioOwnerDisplayLabel(data, hint);
  if (!onChange) {
    if (!label) return null;
    return (
      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded shrink-0">
        {label}
      </span>
    );
  }
  return (
    <select
      aria-label="Détenteur"
      value={hint ?? ""}
      onChange={(event) => onChange(event.target.value as RioCoupleOwnerHint)}
      className="h-7 max-w-[14rem] text-xs border rounded px-2 bg-background"
    >
      <option value="" disabled>
        Détenteur…
      </option>
      {HINTS.map((value) => (
        <option key={value} value={value}>
          {rioOwnerDisplayLabel(data, value)}
        </option>
      ))}
    </select>
  );
}
