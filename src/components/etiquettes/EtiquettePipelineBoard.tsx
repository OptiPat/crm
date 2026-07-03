import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getEtiquettePipelineBoard,
  setContactPipelineStatus,
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUS_ORDER,
  type EtiquettePipelineContact,
  type PipelineStatus,
} from "@/lib/api/tauri-pipeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardDrillDownOpenContact } from "@/lib/dashboard/dashboard-drill-down";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";

export function EtiquettePipelineBoard({
  etiquetteId,
  onOpenContact,
}: {
  etiquetteId: number;
  onOpenContact?: DashboardDrillDownOpenContact;
}) {
  const [contacts, setContacts] = useState<EtiquettePipelineContact[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const board = await getEtiquettePipelineBoard(etiquetteId);
      setContacts(board.contacts);
    } catch (e) {
      console.error(e);
      toast.error("Erreur chargement pipeline");
    } finally {
      setLoading(false);
    }
  }, [etiquetteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const contactIds = useMemo(
    () => contacts.map((c) => c.contact_id),
    [contacts]
  );

  const byStatus = useMemo(() => {
    const map = new Map<PipelineStatus, EtiquettePipelineContact[]>();
    for (const s of PIPELINE_STATUS_ORDER) map.set(s, []);
    for (const c of contacts) {
      const status = PIPELINE_STATUS_ORDER.includes(c.pipeline_status as PipelineStatus)
        ? (c.pipeline_status as PipelineStatus)
        : "A_TRAITER";
      map.get(status)!.push(c);
    }
    return map;
  }, [contacts]);

  const advance = async (contact: EtiquettePipelineContact) => {
    const idx = PIPELINE_STATUS_ORDER.indexOf(contact.pipeline_status as PipelineStatus);
    if (idx < 0 || idx >= PIPELINE_STATUS_ORDER.length - 1) return;
    const next = PIPELINE_STATUS_ORDER[idx + 1];
    try {
      await setContactPipelineStatus(contact.contact_etiquette_id, next);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">Chargement pipeline…</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {PIPELINE_STATUS_ORDER.map((status) => {
        const list = byStatus.get(status) ?? [];
        return (
          <div key={status} className="rounded-xl border bg-muted/20 p-3 min-h-[120px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{PIPELINE_STATUS_LABELS[status]}</span>
              <Badge variant="secondary">{list.length}</Badge>
            </div>
            <div className="space-y-2">
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                list.map((c) => (
                  <div
                    key={c.contact_etiquette_id}
                    className={cn(
                      "rounded-lg border bg-card p-2 text-sm",
                      "flex items-center justify-between gap-2"
                    )}
                  >
                    <button
                      type="button"
                      className="text-left font-medium hover:underline truncate"
                      onClick={() => onOpenContact?.(c.contact_id, contactIds)}
                    >
                      {c.contact_prenom} {c.contact_nom}
                    </button>
                    {status !== "TERMINE" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        title="Étape suivante"
                        onClick={() => void advance(c)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
