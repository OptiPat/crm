import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Users, Download, Tag } from "lucide-react";
import {
  getAllSegmentsWithCount,
  deleteSegment,
  type SegmentWithCount,
} from "@/lib/api/tauri-segments";
import type { EtiquetteWithCount } from "@/lib/api/tauri-etiquettes";
import { exportSegmentToCsv } from "@/lib/export/segment-export";
import { SegmentForm } from "@/components/etiquettes/SegmentForm";
import { formatSegmentRuleHint } from "@/lib/etiquettes/etiquette-card-summary";
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

interface SegmentsSectionProps {
  etiquettes?: EtiquetteWithCount[];
}

export function SegmentsSection({ etiquettes = [] }: SegmentsSectionProps) {
  const [segments, setSegments] = useState<SegmentWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SegmentWithCount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SegmentWithCount | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);

  const linkedBySegment = useMemo(() => {
    const map = new Map<number, EtiquetteWithCount[]>();
    for (const e of etiquettes) {
      if (e.segment_id == null) continue;
      const list = map.get(e.segment_id) ?? [];
      list.push(e);
      map.set(e.segment_id, list);
    }
    return map;
  }, [etiquettes]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSegments(await getAllSegmentsWithCount());
    } catch {
      toast.error("Impossible de charger les groupes de contacts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = async (segment: SegmentWithCount) => {
    setExportingId(segment.id);
    try {
      const count = await exportSegmentToCsv(segment.id, segment.nom);
      toast.success(
        count > 0
          ? `${count} contact${count !== 1 ? "s" : ""} exporté${count !== 1 ? "s" : ""}`
          : "Aucun contact dans ce groupe"
      );
    } catch (e) {
      toast.error(`Échec de l'export : ${String(e)}`);
    } finally {
      setExportingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSegment(deleteTarget.id);
      toast.success("Groupe de contacts supprimé");
      await load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDeleteTarget(null);
    }
  };

  const deleteLinked = deleteTarget ? (linkedBySegment.get(deleteTarget.id) ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <p className="font-medium text-foreground">Exemple</p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          Groupe « Clients sans contact depuis 1 an » : le CRM compte les contacts concernés.
          Vous pouvez lier ce groupe à une ou plusieurs étiquettes, ou exporter la liste en CSV.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Groupes de contacts</h2>
          <p className="text-sm text-muted-foreground">
            Une règle « qui est concerné », réutilisable sur plusieurs étiquettes.
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
          Nouveau groupe
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : segments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun groupe. Les groupes système (alertes suivi) sont créés au démarrage.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {segments.map((s) => {
            const linked = linkedBySegment.get(s.id) ?? [];
            const ruleHint = formatSegmentRuleHint(s.rule_json);
            return (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    {s.nom}
                    {s.is_system && (
                      <span
                        className="text-[10px] font-normal text-muted-foreground"
                        title="Modifiable, non supprimable"
                      >
                        (système)
                      </span>
                    )}
                  </CardTitle>
                  {s.description && (
                    <CardDescription className="text-xs">{s.description}</CardDescription>
                  )}
                  <p className="text-xs text-muted-foreground pt-1 line-clamp-2" title={ruleHint}>
                    {ruleHint}
                  </p>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2 pt-0">
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      {s.contact_count} contact{s.contact_count !== 1 ? "s" : ""}
                      {!s.actif && " · inactif"}
                    </span>
                    {linked.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Tag className="h-3.5 w-3.5 shrink-0" />
                        {linked.length} étiquette{linked.length > 1 ? "s liées" : " liée"}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Exporter les contacts (CSV/Excel)"
                      disabled={exportingId === s.id || s.contact_count === 0}
                      onClick={() => void handleExport(s)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Modifier"
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
                        title="Supprimer"
                        onClick={() => setDeleteTarget(s)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Les étiquettes liées n&apos;utiliseront plus ce groupe de contacts.</p>
                {deleteLinked.length > 0 && (
                  <ul className="list-disc pl-4 text-foreground/90">
                    {deleteLinked.map((e) => (
                      <li key={e.id}>{e.nom}</li>
                    ))}
                  </ul>
                )}
              </div>
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
