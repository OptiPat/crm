import { useCallback, useEffect, useState } from "react";
import {
  listPlacementOperationsForPipe,
  PLACEMENT_OPERATIONS_CHANGED_EVENT,
  type PlacementOperation,
} from "@/lib/api/tauri-box-placement";
import {
  placementOperationStatusAccent,
  placementOperationStatusLabel,
  placementOperationTypeLabel,
} from "@/lib/placement/placement-operations-ui";

export function PipePlacementOperations({ pipeId }: { pipeId: number }) {
  const [operations, setOperations] = useState<PlacementOperation[]>([]);

  const reload = useCallback(async () => {
    try {
      const rows = await listPlacementOperationsForPipe(pipeId);
      setOperations(rows);
    } catch {
      setOperations([]);
    }
  }, [pipeId]);

  useEffect(() => {
    void reload();
    const onChanged = () => {
      void reload();
    };
    window.addEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
  }, [reload]);

  const openOps = operations.filter(
    (op) => op.status === "PENDING" || op.status === "NON_CONFORME"
  );
  if (openOps.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Réponse partenaire Stellium</p>
      <ul className="space-y-1.5">
        {openOps.map((op) => (
          <li
            key={op.id}
            className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${placementOperationStatusAccent(op.status)}`}
          >
            <span className="font-medium">
              {placementOperationTypeLabel(op.operation_type)}
            </span>
            <span className="text-xs">{placementOperationStatusLabel(op.status)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
