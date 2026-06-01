import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import {
  getAllSegmentsWithCount,
  deleteSegment,
  type SegmentWithCount,
} from "@/lib/api/tauri-segments";
import { SegmentForm } from "@/components/etiquettes/SegmentForm";
import { toast } from "sonner";
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

export function SegmentsSection() {
  const [segments, setSegments] = useState<SegmentWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SegmentWithCount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SegmentWithCount | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSegments(await getAllSegmentsWithCount());
    } catch {
      toast.error("Impossible de charger les segments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSegment(deleteTarget.id);
      toast.success("Segment supprimé");
      await load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Segments réutilisables</h2>
          <p className="text-sm text-muted-foreground">
            Définissez une fois qui est concerné, puis liez le segment à des étiquettes ou filtres.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Segment
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : segments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun segment. Les segments système (alertes suivi) sont créés au démarrage.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {segments.map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {s.nom}
                  {s.is_system && (
                    <span className="text-[10px] font-normal text-muted-foreground">(système)</span>
                  )}
                </CardTitle>
                {s.description && (
                  <CardDescription className="text-xs">{s.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2 pt-0">
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {s.contact_count} contact{s.contact_count !== 1 ? "s" : ""}
                  {!s.actif && " · inactif"}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditing(s);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!s.is_system && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(s)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SegmentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        segment={editing}
        onSuccess={() => void load()}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleteTarget?.nom} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les étiquettes liées n&apos;utiliseront plus ce segment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
