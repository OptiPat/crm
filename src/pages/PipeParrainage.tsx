import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ParrainagePipeBoard } from "@/components/parrainage-pipe/ParrainagePipeBoard";
import { ParrainagePipeDetailPanel } from "@/components/parrainage-pipe/ParrainagePipeDetailPanel";
import {
  ParrainagePipeCreateDialog,
  ParrainagePipeStageDialog,
} from "@/components/parrainage-pipe/ParrainagePipeDialogs";
import {
  getParrainageFunnelCounts,
  listParrainagePipes,
  setParrainagePipeStage,
  type ParrainagePipeRecord,
} from "@/lib/api/tauri-parrainage-pipe";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeParrainagePipeChanged } from "@/lib/parrainage-pipe/parrainage-pipe-events";
import {
  consumeParrainagePipeFocusId,
  PARRAINAGE_PIPE_FOCUS_EVENT,
} from "@/lib/navigation/parrainage-pipe-navigation";
import {
  currentFiscalYearLabel,
  listSelectableFiscalYearLabels,
} from "@/lib/pipe/remuneration-fiscal-year";
import {
  PARRAINAGE_PIPE_STAGE_LABELS,
  stageNeedsInvitationType,
  type ParrainageInvitationType,
  type ParrainagePipeStage,
} from "@/lib/parrainage-pipe/parrainage-pipe-types";
import { toast } from "sonner";
import {
  BoardContactSearch,
  BoardContactSearchEmpty,
} from "@/components/pipe/BoardContactSearch";
import { filterByContactSearch } from "@/lib/pipe/pipe-contact-search";
import { userErrorMessage } from "@/lib/api/invoke-error";

export function PipeParrainage() {
  const exerciceOptions = useMemo(() => listSelectableFiscalYearLabels(), []);
  const defaultExercice = useMemo(() => currentFiscalYearLabel(), []);

  const [exerciceLabel, setExerciceLabel] = useState(defaultExercice);
  const [pipes, setPipes] = useState<ParrainagePipeRecord[]>([]);
  const [counts, setCounts] = useState({ sms_envoyes: 0, confirmations: 0, presences: 0, parrainages: 0 });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const loadGenerationRef = useRef(0);
  const [selected, setSelected] = useState<ParrainagePipeRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [stageDialog, setStageDialog] = useState<{
    pipe: ParrainagePipeRecord;
    stage: ParrainagePipeStage;
  } | null>(null);
  const pendingFocusRef = useRef<number | null>(consumeParrainagePipeFocusId());
  const [scrollToPipeId, setScrollToPipeId] = useState<number | null>(pendingFocusRef.current);

  useEffect(() => {
    const onFocus = (event: Event) => {
      const detail = (event as CustomEvent<{ pipeId: number | null }>).detail;
      if (detail?.pipeId != null) {
        // Une recherche active pourrait masquer la carte ciblée.
        setSearch("");
        setScrollToPipeId(detail.pipeId);
      }
    };
    window.addEventListener(PARRAINAGE_PIPE_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(PARRAINAGE_PIPE_FOCUS_EVENT, onFocus);
  }, []);

  const loadData = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    try {
      const [pipeRows, funnelCounts] = await Promise.all([
        listParrainagePipes(exerciceLabel),
        getParrainageFunnelCounts(exerciceLabel),
      ]);
      if (generation !== loadGenerationRef.current) return;
      setPipes(pipeRows);
      setCounts(funnelCounts);
      setLoaded(true);
      setSelected((prev) => (prev ? pipeRows.find((p) => p.id === prev.id) ?? null : null));
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      toast.error(userErrorMessage(error, "Impossible de charger les parrainages"));
    } finally {
      if (generation === loadGenerationRef.current) setLoading(false);
    }
  }, [exerciceLabel]);

  const searchedPipes = useMemo(() => filterByContactSearch(pipes, search), [pipes, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const unsubPipe = subscribeParrainagePipeChanged(() => void loadData());
    const unsubContacts = subscribeContactsChanged(() => void loadData());
    return () => {
      unsubPipe();
      unsubContacts();
    };
  }, [loadData]);

  const handleStageChange = async (
    pipe: ParrainagePipeRecord,
    stage: ParrainagePipeStage,
    invitationType?: ParrainageInvitationType
  ) => {
    if (stageNeedsInvitationType(stage) && !pipe.invitation_type && !invitationType) {
      setStageDialog({ pipe, stage });
      return;
    }
    try {
      const updated = await setParrainagePipeStage(pipe.id, stage, {
        invitationType: invitationType ?? (pipe.invitation_type as ParrainageInvitationType) ?? null,
      });
      setSelected(updated);
      toast.success(`Étape : ${PARRAINAGE_PIPE_STAGE_LABELS[stage]}`);
      await loadData();
    } catch (error) {
      toast.error(userErrorMessage(error, "Impossible de changer l'étape"));
    }
  };

  const funnelCards = [
    { label: "SMS envoyés", current: counts.sms_envoyes },
    { label: "« Oui, je viens »", current: counts.confirmations },
    {
      label: "Présents",
      title: "Présents à la Journée Découverte (JD) ou à la Présentation d'opportunité (PO)",
      current: counts.presences,
    },
    { label: "Inscrits", current: counts.parrainages },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="size-4" />
            Exercice
            <select
              value={exerciceLabel}
              onChange={(e) => setExerciceLabel(e.target.value)}
              className="rounded-md border border-border/70 bg-background px-2 py-1 text-sm text-foreground"
            >
              {exerciceOptions.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            {funnelCards.map((card) => (
              <div
                key={card.label}
                title={"title" in card ? card.title : undefined}
                className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-1 text-xs"
              >
                <span className="text-muted-foreground">{card.label} : </span>
                <span className="font-semibold tabular-nums">{card.current}</span>
              </div>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1.5" />
          Ajouter un contact
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
        {selected ? (
          <ParrainagePipeDetailPanel
            pipe={selected}
            onBack={() => setSelected(null)}
            onUpdated={(pipe) => {
              setSelected(pipe);
              void loadData();
            }}
            onDeleted={() => {
              setSelected(null);
              void loadData();
            }}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
            {loading && !loaded ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Chargement…
              </div>
            ) : (
              <>
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
                  <BoardContactSearch
                    value={search}
                    onChange={setSearch}
                    resultCount={searchedPipes.length}
                    className="flex-1"
                  />
                  {loading ? (
                    <span className="text-xs text-muted-foreground" aria-live="polite">
                      Actualisation…
                    </span>
                  ) : null}
                </div>
                {searchedPipes.length === 0 && pipes.length > 0 ? (
                  <BoardContactSearchEmpty query={search} onClear={() => setSearch("")} />
                ) : (
                  <ParrainagePipeBoard
                    pipes={searchedPipes}
                    selectedId={null}
                    scrollToPipeId={scrollToPipeId}
                    onSelect={setSelected}
                    onRequestStageChange={(pipe, stage) => void handleStageChange(pipe, stage)}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      <ParrainagePipeCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        exerciceLabel={exerciceLabel}
        onCreated={() => void loadData()}
      />

      <ParrainagePipeStageDialog
        open={stageDialog != null}
        onOpenChange={(open) => !open && setStageDialog(null)}
        targetStageLabel={
          stageDialog ? PARRAINAGE_PIPE_STAGE_LABELS[stageDialog.stage] : ""
        }
        currentInvitationType={stageDialog?.pipe.invitation_type}
        onConfirm={(invitationType) => {
          if (!stageDialog) return;
          void handleStageChange(stageDialog.pipe, stageDialog.stage, invitationType);
          setStageDialog(null);
        }}
      />
    </div>
  );
}
