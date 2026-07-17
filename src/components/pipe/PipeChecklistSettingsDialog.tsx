import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  cloneDefaultPipeChecklistTemplates,
  createPipeChecklistTemplateItemId,
  loadPipeChecklistTemplates,
  PIPE_CHECKLIST_PROFILE_SCOPE_LABELS,
  PIPE_CHECKLIST_STAGES,
  savePipeChecklistTemplates,
  type PipeChecklistProfileScope,
  type PipeChecklistStage,
  type PipeChecklistTemplateItem,
  type PipeChecklistTemplates,
} from "@/lib/pipe/pipe-checklist-template";

interface PipeChecklistSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

function stageTitle(stage: PipeChecklistStage): string {
  return stage === "R1" ? "Documents R1" : "Documents R2";
}

function stageDescription(stage: PipeChecklistStage): string {
  if (stage === "R1") {
    return "Pièces à collecter avant le RDV R1. Les lignes conditionnelles s'affichent selon le profil (salarié, chef d'entreprise, retraite).";
  }
  return "Pièces à collecter avant le RDV R2 — à configurer avant mise en service.";
}

export function PipeChecklistSettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: PipeChecklistSettingsDialogProps) {
  const [draft, setDraft] = useState<PipeChecklistTemplates>(
    cloneDefaultPipeChecklistTemplates()
  );
  const [activeStage, setActiveStage] = useState<PipeChecklistStage>("R1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadPipeChecklistTemplates().then(setDraft);
    setActiveStage("R1");
  }, [open]);

  const updateItem = (
    stage: PipeChecklistStage,
    index: number,
    patch: Partial<PipeChecklistTemplateItem>
  ) => {
    setDraft((prev) => {
      const items = [...prev[stage]];
      items[index] = { ...items[index], ...patch };
      return { ...prev, [stage]: items };
    });
  };

  const removeItem = (stage: PipeChecklistStage, index: number) => {
    setDraft((prev) => ({
      ...prev,
      [stage]: prev[stage].filter((_, i) => i !== index),
    }));
  };

  const addItem = (stage: PipeChecklistStage) => {
    setDraft((prev) => ({
      ...prev,
      [stage]: [
        ...prev[stage],
        {
          id: createPipeChecklistTemplateItemId(),
          label: "",
          profiles: ["base"],
        },
      ],
    }));
  };

  const handleSave = async () => {
    for (const stage of PIPE_CHECKLIST_STAGES) {
      const invalid = draft[stage].find((item) => !item.label.trim());
      if (invalid) {
        toast.error(`Renseignez le libellé de chaque pièce (${stageTitle(stage)})`);
        setActiveStage(stage);
        return;
      }
    }

    setSaving(true);
    try {
      await savePipeChecklistTemplates(draft);
      toast.success("Listes de documents enregistrées");
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleResetStage = (stage: PipeChecklistStage) => {
    setDraft((prev) => ({
      ...prev,
      [stage]: cloneDefaultPipeChecklistTemplates()[stage].map((item) => ({ ...item })),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Checklists documents</DialogTitle>
          <DialogDescription>
            Configurez les pièces demandées aux clients pour chaque étape. Partagé sur cette
            installation.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeStage}
          onValueChange={(value) => setActiveStage(value as PipeChecklistStage)}
          className="flex-1 min-h-0 flex flex-col"
        >
          <TabsList className="grid w-full grid-cols-2">
            {PIPE_CHECKLIST_STAGES.map((stage) => (
              <TabsTrigger key={stage} value={stage}>
                {stage}
              </TabsTrigger>
            ))}
          </TabsList>

          {PIPE_CHECKLIST_STAGES.map((stage) => (
            <TabsContent
              key={stage}
              value={stage}
              className="flex-1 min-h-0 overflow-y-auto space-y-3 mt-3"
            >
              <p className="text-xs text-muted-foreground">{stageDescription(stage)}</p>

              {draft[stage].length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
                  Aucune pièce configurée.
                </p>
              ) : (
                <ul className="space-y-3">
                  {draft[stage].map((item, index) => (
                    <li
                      key={item.id}
                      className="rounded-lg border bg-muted/20 p-3 space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Libellé</Label>
                            <Input
                              value={item.label}
                              placeholder="Ex. Dernier avis d'imposition"
                              onChange={(event) =>
                                updateItem(stage, index, { label: event.target.value })
                              }
                            />
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Affichage</Label>
                              <Select
                                value={item.profiles[0] ?? "base"}
                                onValueChange={(value) =>
                                  updateItem(stage, index, {
                                    profiles: [value as PipeChecklistProfileScope],
                                  })
                                }
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {(
                                    Object.entries(
                                      PIPE_CHECKLIST_PROFILE_SCOPE_LABELS
                                    ) as [PipeChecklistProfileScope, string][]
                                  ).map(([scope, label]) => (
                                    <SelectItem key={scope} value={scope}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {stage === "R1" && item.profiles.includes("base") ? (
                              <div className="space-y-1.5">
                                <Label className="text-xs">Précision (optionnel)</Label>
                                <Input
                                  value={item.hint ?? ""}
                                  placeholder="Ex. Livrets, assurance-vie…"
                                  onChange={(event) =>
                                    updateItem(stage, index, {
                                      hint: event.target.value || undefined,
                                    })
                                  }
                                />
                              </div>
                            ) : null}
                          </div>
                          {stage === "R1" &&
                          item.profiles.includes("base") &&
                          item.id === "amortissement_prets" ? (
                            <p className="text-[11px] text-muted-foreground">
                              Option « Pas de crédit » activée pour cette ligne.
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(stage, index)}
                          aria-label="Supprimer la pièce"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => addItem(stage)}
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter une pièce
              </Button>

              <div className="pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => handleResetStage(stage)}
                >
                  Réinitialiser {stage}
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0 shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
