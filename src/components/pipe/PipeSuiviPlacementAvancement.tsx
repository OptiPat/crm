import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PipePlacementStepper } from "@/components/pipe/PipePlacementStepper";
import {
  listPlacementOperationsForPipe,
  markPlacementPartnerResent,
  notifyPlacementOperationsChanged,
  PLACEMENT_OPERATIONS_CHANGED_EVENT,
  type PlacementOperation,
} from "@/lib/api/tauri-box-placement";
import {
  placementOperationCanMarkPartnerResent,
  placementOperationShowsStepper,
} from "@/lib/placement/placement-operation-stepper";
import { placementOperationIsDeclaredInWorkflow } from "@/lib/placement/placement-operations-ui";
import { toast } from "sonner";

export function PipeSuiviPlacementAvancement({ pipeId }: { pipeId: number }) {
  const [operations, setOperations] = useState<PlacementOperation[]>([]);
  const [resentingId, setResentingId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await listPlacementOperationsForPipe(pipeId);
      setOperations(
        rows.filter(
          (op) =>
            placementOperationShowsStepper(op) &&
            (op.status === "NON_CONFORME" || placementOperationIsDeclaredInWorkflow(op))
        )
      );
    } catch {
      setOperations([]);
    }
  }, [pipeId]);

  useEffect(() => {
    void reload();
    const debounceRef = { id: null as number | null };
    const onChanged = () => {
      if (debounceRef.id != null) window.clearTimeout(debounceRef.id);
      debounceRef.id = window.setTimeout(() => {
        debounceRef.id = null;
        void reload();
      }, 150);
    };
    window.addEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
      if (debounceRef.id != null) window.clearTimeout(debounceRef.id);
    };
  }, [reload]);

  const handlePartnerResent = async (operation: PlacementOperation) => {
    setResentingId(operation.id);
    try {
      await markPlacementPartnerResent(operation.id);
      notifyPlacementOperationsChanged();
      toast.success("Renvoi partenaire enregistré — en attente de la réponse Stellium");
      await reload();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setResentingId(null);
    }
  };

  if (operations.length === 0) return null;

  return (
    <div className="space-y-4">
      {operations.map((op, index) => {
        const canResent = placementOperationCanMarkPartnerResent(op);
        return (
          <div key={op.id} className="space-y-2">
            <PipePlacementStepper operation={op} hideTitle={index > 0} />
            {canResent ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={resentingId === op.id}
                onClick={() => void handlePartnerResent(op)}
              >
                <Send className="h-3.5 w-3.5" />
                {resentingId === op.id ? "Enregistrement…" : "Renvoyé chez Stellium"}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
