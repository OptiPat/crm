import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Plus, Trash2, ChevronDown } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChecklistSettingsBufferedInput,
  ChecklistSettingsBufferedTextarea,
  flushChecklistSettingsBufferedState,
} from "@/components/pipe/ChecklistSettingsBufferedField";
import { cn } from "@/lib/utils";
import { PipeR3ImmoChecklistEmailPreviewPanel } from "@/components/pipe/PipeR3ImmoChecklistEmailPreviewPanel";
import { PipeR1ChecklistEmailPreviewPanel } from "@/components/pipe/PipeR1ChecklistEmailPreviewPanel";
import { PipeR3ChecklistEmailPreviewPanel } from "@/components/pipe/PipeR3ChecklistEmailPreviewPanel";
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
  type R1ChecklistProfile,
} from "@/lib/pipe/pipe-checklist-template";
import {
  cloneDefaultR3ImmoChecklistTemplate,
  createR3ImmoChecklistItemId,
  loadR3ImmoChecklistTemplate,
  R3_IMMO_CHECKLIST_SECTIONS,
  R3_IMMO_VISIBILITY_RULE_LABELS,
  saveR3ImmoChecklistTemplate,
  type R3ImmoChecklistItemDef,
  type R3ImmoChecklistTemplate,
  type R3ImmoVisibilityRule,
} from "@/lib/pipe/r3-immo-checklist-template";

interface PipeChecklistSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

type ChecklistSettingsTab = PipeChecklistStage | "R3_IMMO";

const CHECKLIST_SETTINGS_TABS: { value: ChecklistSettingsTab; label: string }[] = [
  { value: "R1", label: "R1" },
  { value: "R2", label: "R2" },
  { value: "R3", label: "R3 Placements" },
  { value: "R3_IMMO", label: "R3 Immo" },
];

function stageTitle(stage: PipeChecklistStage): string {
  if (stage === "R1") return "Documents R1";
  if (stage === "R3") return "Documents R3 — Placements";
  return "Documents R2";
}

function stageDescription(stage: PipeChecklistStage): string {
  if (stage === "R1") {
    return "Pièces à collecter avant le RDV R1. Les lignes conditionnelles s'affichent selon le profil (salarié, chef d'entreprise, retraite). Alimente la variable {{liste_documents_r1_html}} dans le modèle email RDV.";
  }
  if (stage === "R3") {
    return "Pièces placements pour le RDV R3 (DER, RIO, QPI signés, identité, domicile, RIB). Alimente la variable {{liste_documents_r3_html}} dans le modèle email RDV.";
  }
  return "Pièces à collecter avant le RDV R2 — à configurer avant mise en service.";
}

function sectionOptions(template: R3ImmoChecklistTemplate): string[] {
  const fromItems = [...new Set(template.items.map((item) => item.section))];
  const merged = [...template.sections, ...fromItems, ...R3_IMMO_CHECKLIST_SECTIONS];
  return [...new Set(merged.filter(Boolean))];
}

function r1ItemHintPlaceholder(item: PipeChecklistTemplateItem): string {
  if (item.id === "estimation_retraite") {
    return "1. RDV sur info-retraite.fr\n2. Onglet « Mon estimation retraite » > …\n3. Télécharger le PDF.";
  }
  if (item.id === "releves_situation") {
    return "Livrets, Assurance-vie, PER, PEE/PERCO, comptes titres…";
  }
  return "Précision affichée dans le mail (optionnel)";
}

const PipeChecklistStageItemRow = memo(function PipeChecklistStageItemRow({
  stage,
  item,
  index,
  syncKey,
  onUpdate,
  onRemove,
}: {
  stage: PipeChecklistStage;
  item: PipeChecklistTemplateItem;
  index: number;
  syncKey: number;
  onUpdate: (
    stage: PipeChecklistStage,
    index: number,
    patch: Partial<PipeChecklistTemplateItem>
  ) => void;
  onRemove: (stage: PipeChecklistStage, index: number) => void;
}) {
  return (
    <li className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2 min-w-0">
          <div className="space-y-1.5">
            <Label className="text-xs">Libellé</Label>
            <ChecklistSettingsBufferedInput
              value={item.label}
              syncKey={syncKey}
              placeholder="Ex. Dernier avis d'imposition"
              onCommit={(label) => onUpdate(stage, index, { label })}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Affichage</Label>
              <Select
                value={item.profiles[0] ?? "base"}
                onValueChange={(value) =>
                  onUpdate(stage, index, { profiles: [value as PipeChecklistProfileScope] })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(PIPE_CHECKLIST_PROFILE_SCOPE_LABELS) as [
                      PipeChecklistProfileScope,
                      string,
                    ][]
                  ).map(([scope, label]) => (
                    <SelectItem key={scope} value={scope}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {stage === "R1" ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">
                  {item.id === "estimation_retraite"
                    ? "Étapes mail (liste numérotée)"
                    : "Précision (optionnel)"}
                </Label>
                {item.id === "estimation_retraite" ? (
                  <ChecklistSettingsBufferedTextarea
                    value={item.hint ?? ""}
                    syncKey={syncKey}
                    rows={4}
                    placeholder={r1ItemHintPlaceholder(item)}
                    className="text-xs font-mono leading-relaxed"
                    onCommit={(hint) =>
                      onUpdate(stage, index, { hint: hint.trim() ? hint : undefined })
                    }
                  />
                ) : (
                  <ChecklistSettingsBufferedInput
                    value={item.hint ?? ""}
                    syncKey={syncKey}
                    placeholder={r1ItemHintPlaceholder(item)}
                    onCommit={(hint) =>
                      onUpdate(stage, index, { hint: hint.trim() ? hint : undefined })
                    }
                  />
                )}
              </div>
            ) : stage !== "R2" && item.profiles.includes("base") ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Précision (optionnel)</Label>
                <ChecklistSettingsBufferedInput
                  value={item.hint ?? ""}
                  syncKey={syncKey}
                  placeholder={
                    stage === "R3" ? "Ex. Date d'émission récente" : "Ex. Livrets, assurance-vie…"
                  }
                  onCommit={(hint) =>
                    onUpdate(stage, index, { hint: hint.trim() ? hint : undefined })
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
          onClick={() => onRemove(stage, index)}
          aria-label="Supprimer la pièce"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
});

const PipeR3ImmoSettingsItemRow = memo(function PipeR3ImmoSettingsItemRow({
  item,
  index,
  sections,
  syncKey,
  onUpdate,
  onRemove,
}: {
  item: R3ImmoChecklistItemDef;
  index: number;
  sections: readonly string[];
  syncKey: number;
  onUpdate: (index: number, patch: Partial<R3ImmoChecklistItemDef>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <li className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <Label className="text-xs mb-1 block">Libellé</Label>
            <ChecklistSettingsBufferedInput
              value={item.label}
              syncKey={syncKey}
              placeholder="Ex. Les 2 derniers avis d'imposition"
              className="h-9"
              onCommit={(label) => onUpdate(index, { label })}
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Section</Label>
            <Select
              value={item.section}
              onValueChange={(value) => onUpdate(index, { section: value })}
            >
              <SelectTrigger className="h-9 w-full text-xs [&>span]:line-clamp-1 [&>span]:text-left">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sections.map((section) => (
                  <SelectItem key={section} value={section}>
                    {section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Règle d&apos;affichage</Label>
            <Select
              value={item.rule}
              onValueChange={(value) =>
                onUpdate(index, { rule: value as R3ImmoVisibilityRule })
              }
            >
              <SelectTrigger className="h-9 w-full text-xs [&>span]:line-clamp-1 [&>span]:text-left">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(R3_IMMO_VISIBILITY_RULE_LABELS) as [
                    R3ImmoVisibilityRule,
                    string,
                  ][]
                ).map(([rule, label]) => (
                  <SelectItem key={rule} value={rule}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Précision (optionnel)</Label>
            <ChecklistSettingsBufferedInput
              value={item.hint ?? ""}
              syncKey={syncKey}
              placeholder="Ex. Si couple et/ou enfants à charge"
              className="h-9"
              onCommit={(hint) =>
                onUpdate(index, { hint: hint.trim() ? hint : undefined })
              }
            />
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(index)}
          aria-label="Supprimer la pièce"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
});

export function PipeChecklistSettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: PipeChecklistSettingsDialogProps) {
  const [draft, setDraft] = useState<PipeChecklistTemplates>(
    cloneDefaultPipeChecklistTemplates()
  );
  const [r3ImmoDraft, setR3ImmoDraft] = useState<R3ImmoChecklistTemplate>(
    cloneDefaultR3ImmoChecklistTemplate()
  );
  const [activeTab, setActiveTab] = useState<ChecklistSettingsTab>("R1");
  const [r1PreviewProfile, setR1PreviewProfile] = useState<R1ChecklistProfile>({
    salarie: true,
    chef_entreprise: false,
    retraite: false,
  });
  const [saving, setSaving] = useState(false);
  const [syncKey, setSyncKey] = useState(0);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const draftRef = useRef(draft);
  const r3ImmoDraftRef = useRef(r3ImmoDraft);

  const commitDraft = useCallback(
    (updater: (prev: PipeChecklistTemplates) => PipeChecklistTemplates) => {
      setDraft((prev) => {
        const next = updater(prev);
        draftRef.current = next;
        return next;
      });
    },
    []
  );

  const commitR3ImmoDraft = useCallback(
    (updater: (prev: R3ImmoChecklistTemplate) => R3ImmoChecklistTemplate) => {
      setR3ImmoDraft((prev) => {
        const next = updater(prev);
        r3ImmoDraftRef.current = next;
        return next;
      });
    },
    []
  );

  const flushBufferedDrafts = useCallback(() => {
    flushSync(() => {
      flushChecklistSettingsBufferedState();
    });
  }, []);

  const r3ImmoSectionKey = useMemo(
    () =>
      [
        ...new Set([
          ...r3ImmoDraft.sections,
          ...r3ImmoDraft.items.map((item) => item.section),
          ...R3_IMMO_CHECKLIST_SECTIONS,
        ]),
      ]
        .filter(Boolean)
        .sort()
        .join("\0"),
    [r3ImmoDraft.sections, r3ImmoDraft.items]
  );
  const r3ImmoSections = useMemo(
    () => sectionOptions(r3ImmoDraft),
    [r3ImmoSectionKey]
  );

  useEffect(() => {
    if (!open) return;
    void Promise.all([loadPipeChecklistTemplates(), loadR3ImmoChecklistTemplate()]).then(
      ([loadedDraft, loadedR3Immo]) => {
        draftRef.current = loadedDraft;
        r3ImmoDraftRef.current = loadedR3Immo;
        setDraft(loadedDraft);
        setR3ImmoDraft(loadedR3Immo);
        setSyncKey((key) => key + 1);
      }
    );
    setActiveTab("R1");
    setR1PreviewProfile({ salarie: true, chef_entreprise: false, retraite: false });
    setShowEmailPreview(false);
  }, [open]);

  const updateItem = useCallback(
    (stage: PipeChecklistStage, index: number, patch: Partial<PipeChecklistTemplateItem>) => {
      commitDraft((prev) => {
        const items = [...prev[stage]];
        items[index] = { ...items[index], ...patch };
        return { ...prev, [stage]: items };
      });
    },
    [commitDraft]
  );

  const removeItem = useCallback(
    (stage: PipeChecklistStage, index: number) => {
      commitDraft((prev) => ({
        ...prev,
        [stage]: prev[stage].filter((_, i) => i !== index),
      }));
    },
    [commitDraft]
  );

  const addItem = useCallback(
    (stage: PipeChecklistStage) => {
      commitDraft((prev) => ({
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
    },
    [commitDraft]
  );

  const updateR3ImmoItem = useCallback(
    (index: number, patch: Partial<R3ImmoChecklistItemDef>) => {
      commitR3ImmoDraft((prev) => {
        const items = [...prev.items];
        items[index] = { ...items[index], ...patch };
        return { ...prev, items };
      });
    },
    [commitR3ImmoDraft]
  );

  const removeR3ImmoItem = useCallback(
    (index: number) => {
      commitR3ImmoDraft((prev) => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
    },
    [commitR3ImmoDraft]
  );

  const addR3ImmoItem = useCallback(() => {
    commitR3ImmoDraft((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: createR3ImmoChecklistItemId(),
          section: prev.sections[0] ?? R3_IMMO_CHECKLIST_SECTIONS[0],
          label: "",
          rule: "always",
        },
      ],
    }));
  }, [commitR3ImmoDraft]);

  const handleSave = async () => {
    flushBufferedDrafts();
    const templatesToSave = draftRef.current;
    const r3ImmoToSave = r3ImmoDraftRef.current;

    for (const stage of PIPE_CHECKLIST_STAGES) {
      const invalid = templatesToSave[stage].find((item) => !item.label.trim());
      if (invalid) {
        toast.error(`Renseignez le libellé de chaque pièce (${stageTitle(stage)})`);
        setActiveTab(stage);
        return;
      }
    }

    const invalidR3Immo = r3ImmoToSave.items.find(
      (item) => !item.label.trim() || !item.section.trim()
    );
    if (invalidR3Immo) {
      toast.error("Renseignez le libellé et la section de chaque pièce R3 Immo");
      setActiveTab("R3_IMMO");
      return;
    }

    setSaving(true);
    try {
      await Promise.all([
        savePipeChecklistTemplates(templatesToSave),
        saveR3ImmoChecklistTemplate(r3ImmoToSave),
      ]);
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
    commitDraft((prev) => ({
      ...prev,
      [stage]: cloneDefaultPipeChecklistTemplates()[stage].map((item) => ({ ...item })),
    }));
    setSyncKey((key) => key + 1);
  };

  const handleResetR3Immo = () => {
    const reset = cloneDefaultR3ImmoChecklistTemplate();
    r3ImmoDraftRef.current = reset;
    setR3ImmoDraft(reset);
    setSyncKey((key) => key + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(96vw,64rem)] max-w-[min(96vw,64rem)] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Checklists documents</DialogTitle>
          <DialogDescription>
            Configurez les pièces demandées aux clients pour chaque étape. Partagé sur cette
            installation. Les libellés sont enregistrés dans le brouillon quand vous quittez le
            champ (Tab ou clic ailleurs).
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value as ChecklistSettingsTab);
            setShowEmailPreview(false);
          }}
          className="flex-1 min-h-0 flex flex-col"
        >
          <TabsList className="grid w-full grid-cols-4">
            {CHECKLIST_SETTINGS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 min-h-0 overflow-y-auto mt-3">
            {PIPE_CHECKLIST_STAGES.map((stage) =>
              activeTab === stage ? (
                <div key={stage} className="space-y-3">
                  <p className="text-xs text-muted-foreground">{stageDescription(stage)}</p>

                  {draft[stage].length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
                      Aucune pièce configurée.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {draft[stage].map((item, index) => (
                        <PipeChecklistStageItemRow
                          key={item.id}
                          stage={stage}
                          item={item}
                          index={index}
                          syncKey={syncKey}
                          onUpdate={updateItem}
                          onRemove={removeItem}
                        />
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

                  {(stage === "R1" || stage === "R3") && (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          if (!showEmailPreview) flushBufferedDrafts();
                          setShowEmailPreview((open) => !open);
                        }}
                      >
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 transition-transform",
                            showEmailPreview && "rotate-180"
                          )}
                        />
                        {showEmailPreview ? "Masquer l'aperçu email" : "Aperçu variable email"}
                      </Button>
                      {showEmailPreview ? (
                        stage === "R1" ? (
                          <PipeR1ChecklistEmailPreviewPanel
                            templates={draft}
                            profile={r1PreviewProfile}
                            onProfileChange={setR1PreviewProfile}
                            idPrefix="settings-r1"
                          />
                        ) : (
                          <PipeR3ChecklistEmailPreviewPanel
                            templates={draft}
                            idPrefix="settings-r3"
                          />
                        )
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null
            )}

            {activeTab === "R3_IMMO" ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Pièces dossier prêt immobilier (RDV R3 Immo). Chaque ligne a une règle de
                  visibilité (contact, profil revenus, patrimoine, toggles dossier). Alimente la
                  variable {"{{liste_documents_r3_immo_html}}"} dans le modèle email RDV.
                </p>

                {r3ImmoDraft.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
                    Aucune pièce configurée.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {r3ImmoDraft.items.map((item, index) => (
                      <PipeR3ImmoSettingsItemRow
                        key={item.id}
                        item={item}
                        index={index}
                        sections={r3ImmoSections}
                        syncKey={syncKey}
                        onUpdate={updateR3ImmoItem}
                        onRemove={removeR3ImmoItem}
                      />
                    ))}
                  </ul>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={addR3ImmoItem}
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
                    onClick={handleResetR3Immo}
                  >
                    Réinitialiser R3 Immo
                  </Button>
                </div>

                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      if (!showEmailPreview) flushBufferedDrafts();
                      setShowEmailPreview((open) => !open);
                    }}
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        showEmailPreview && "rotate-180"
                      )}
                    />
                    {showEmailPreview ? "Masquer l'aperçu email" : "Aperçu variable email"}
                  </Button>
                  {showEmailPreview ? (
                    <PipeR3ImmoChecklistEmailPreviewPanel
                      template={r3ImmoDraft}
                      idPrefix="settings-r3-immo"
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
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
