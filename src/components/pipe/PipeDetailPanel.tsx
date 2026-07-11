import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { deletePipe } from "@/lib/api/tauri-pipe";
import { formatPipeContactLabel, isPipeType, pipeTypeUsesStage } from "@/lib/pipe/pipe-types";
import { PipeTypeBadge } from "@/components/pipe/PipeTypeBadge";
import { PipeStageBadge } from "@/components/pipe/PipeStageBadge";
import { PipeStageStepper } from "@/components/pipe/PipeStageStepper";
import { PipeProspectionContactSection } from "@/components/pipe/PipeProspectionContactSection";
import { PipeTimelineSection } from "@/components/pipe/PipeTimelineSection";
import { toast } from "sonner";

interface PipeDetailPanelProps {
  pipe: PipeRecord;
  onEdit: () => void;
  onDeleted: () => void;
}

export function PipeDetailPanel({ pipe, onEdit, onDeleted }: PipeDetailPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePipe(pipe.id);
      toast.success("Pipe supprimé");
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDeleting(false);
    }
  };

  const showStageStepper =
    isPipeType(pipe.pipe_type) && pipeTypeUsesStage(pipe.pipe_type) && pipe.stage;

  const showProspectionFields =
    isPipeType(pipe.pipe_type) &&
    pipeTypeUsesStage(pipe.pipe_type) &&
    pipe.stage === "PROSPECTION";

  const prospectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showProspectionFields) return;
    const frame = requestAnimationFrame(() => {
      prospectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [showProspectionFields, pipe.id, pipe.stage]);

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="border-b px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <PipeTypeBadge pipeType={pipe.pipe_type} />
              <PipeStageBadge stage={pipe.stage} />
            </div>
            <h2 className="text-lg font-semibold leading-tight">{pipe.titre}</h2>
            <p className="text-sm text-muted-foreground">
              {formatPipeContactLabel(pipe)}
              {pipe.parent_titre ? ` · rattaché à ${pipe.parent_titre}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="outline" size="icon" onClick={onEdit} aria-label="Modifier">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setConfirmDelete(true)}
              aria-label="Supprimer"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {showStageStepper && (
            <PipeStageStepper pipeId={pipe.id} currentStage={pipe.stage} />
          )}

          {showProspectionFields && (
            <div ref={prospectionRef} id="pipe-prospection-section">
              <PipeProspectionContactSection contactId={pipe.contact_id} />
            </div>
          )}

          {pipe.notes && (
            <div>
              <p className="text-sm font-medium mb-1">Notes</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{pipe.notes}</p>
            </div>
          )}

          <PipeTimelineSection pipeId={pipe.id} />
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce pipe ?</AlertDialogTitle>
            <AlertDialogDescription>
              Action définitive. Supprimez d&apos;abord les éléments rattachés en dessous.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
