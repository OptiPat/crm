import { useEffect, useRef, useState } from "react";
import { ExternalLink, Mail, Pencil, Phone, Trash2, Archive, ArchiveRestore } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getContactById, type Contact } from "@/lib/api/tauri-contacts";
import { openExternalUrl } from "@/lib/api/tauri-system";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { deletePipe, archivePipe, unarchivePipe, type PipeRecord } from "@/lib/api/tauri-pipe";
import { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { usePipeRdvStageSync } from "@/hooks/usePipeRdvStageSync";
import {
  formatPipeParticipantsLabel,
  isClassicAffaireStelliumSouscriptionStage,
  isPipeType,
  pipeTypeUsesStage,
} from "@/lib/pipe/pipe-types";
import { PipeTypeBadge } from "@/components/pipe/PipeTypeBadge";
import { PipeStageBadge } from "@/components/pipe/PipeStageBadge";
import { PipeStageStepper } from "@/components/pipe/PipeStageStepper";
import { PipeProspectionContactSection } from "@/components/pipe/PipeProspectionContactSection";
import { PipeSuiviStelliumActAdd } from "@/components/pipe/PipeSuiviStelliumActAdd";
import { PipeSuiviSection } from "@/components/pipe/PipeSuiviSection";
import { PipeSuiviPlacementAvancement } from "@/components/pipe/PipeSuiviPlacementAvancement";
import { PipeTimelineQuickAdd } from "@/components/pipe/PipeTimelineQuickAdd";
import { isSuiviPipe, isVersementComplementaireAffaire } from "@/lib/pipe/pipe-suivi";
import { shouldShowR1DocumentChecklist } from "@/lib/pipe/r1-document-checklist";
import { shouldShowR3DocumentChecklist } from "@/lib/pipe/r3-document-checklist";
import { shouldShowR3ImmoDocumentChecklist } from "@/lib/pipe/r3-immo-document-checklist";
import { usePipeR1DocumentChecklist } from "@/hooks/usePipeR1DocumentChecklist";
import { usePipeR3DocumentChecklist } from "@/hooks/usePipeR3DocumentChecklist";
import { usePipeR3ImmoDocumentChecklist } from "@/hooks/usePipeR3ImmoDocumentChecklist";
import { usePipeChecklistTemplates } from "@/hooks/usePipeChecklistTemplates";
import { PipeSuiviQuickAdd } from "@/components/pipe/PipeSuiviQuickAdd";
import { PipeTimelineHistory } from "@/components/pipe/PipeTimelineHistory";
import { PipeR1DocumentChecklist } from "@/components/pipe/PipeR1DocumentChecklist";
import { PipeR3DocumentChecklist } from "@/components/pipe/PipeR3DocumentChecklist";
import { PipeR3ImmoDocumentChecklist } from "@/components/pipe/PipeR3ImmoDocumentChecklist";
import { PipeR1MissingDocsBadge } from "@/components/pipe/PipeR1MissingDocsBadge";
import { PipeR3MissingDocsBadge } from "@/components/pipe/PipeR3MissingDocsBadge";
import { PipeR3ImmoMissingDocsBadge } from "@/components/pipe/PipeR3ImmoMissingDocsBadge";
import { useGlobalContactDetailSheet } from "@/components/layout/ContactDetailSheetProvider";
import type { PipeRdvPlanOption } from "@/lib/pipe/pipe-rdv-plan-option";
import { toast } from "sonner";

interface PipeDetailPanelProps {
  pipe: PipeRecord;
  childAffaires?: PipeRecord[];
  onEdit: () => void;
  onDeleted: () => void;
  onArchived?: () => void;
  onRefreshed?: (pipe: PipeRecord) => void;
  onPlanRdv?: (planOption: PipeRdvPlanOption) => void;
  onOpenChildAffaire?: (pipe: PipeRecord) => void;
  onOpenParentPipe?: (parentId: number) => void;
  focusHistoriqueToken?: number;
}

export function PipeDetailPanel({
  pipe,
  childAffaires = [],
  onEdit,
  onDeleted,
  onArchived,
  onRefreshed,
  onPlanRdv,
  onOpenChildAffaire,
  onOpenParentPipe,
  focusHistoriqueToken = 0,
}: PipeDetailPanelProps) {
  const { openContactWithTab } = useGlobalContactDetailSheet();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [activeTab, setActiveTab] = useState("suivi");
  const [focusProspectionToken, setFocusProspectionToken] = useState(0);
  const [contactInfo, setContactInfo] = useState<Pick<Contact, "email" | "telephone"> | null>(
    null
  );
  const timeline = usePipeTimeline(pipe.id);

  usePipeRdvStageSync(pipe, timeline.entries, timeline.loading);

  const isArchived = pipe.archived_at != null && pipe.archived_at > 0;

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await archivePipe(pipe.id);
      toast.success("Pipe archivé — l'historique reste dans la fiche contact");
      setConfirmArchive(false);
      onArchived?.();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchive = async () => {
    setArchiving(true);
    try {
      const updated = await unarchivePipe(pipe.id);
      toast.success("Pipe réactivé");
      onRefreshed?.(updated);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setArchiving(false);
    }
  };

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

  const isVersementAffaire = isVersementComplementaireAffaire(pipe);

  const showStageStepper =
    isPipeType(pipe.pipe_type) &&
    pipeTypeUsesStage(pipe.pipe_type) &&
    pipe.stage &&
    !isVersementAffaire;

  const showProspectionFields =
    isPipeType(pipe.pipe_type) &&
    pipe.pipe_type === "AFFAIRE" &&
    pipe.contact_id > 0 &&
    !isVersementAffaire;

  const showSuiviSection = isSuiviPipe(pipe);
  const showAffairePlacementSection =
    isPipeType(pipe.pipe_type) && pipe.pipe_type === "AFFAIRE" && pipe.contact_id > 0;
  const showClassicAffaireStelliumSouscription =
    showAffairePlacementSection &&
    !isVersementAffaire &&
    isClassicAffaireStelliumSouscriptionStage(pipe.stage);

  const showR1DocumentChecklist =
    isPipeType(pipe.pipe_type) &&
    pipe.pipe_type === "AFFAIRE" &&
    pipe.contact_id > 0 &&
    !isVersementAffaire &&
    !timeline.loading &&
    shouldShowR1DocumentChecklist(timeline.entries);

  const loadR1DocumentChecklist =
    isPipeType(pipe.pipe_type) &&
    pipe.pipe_type === "AFFAIRE" &&
    pipe.contact_id > 0 &&
    !isVersementAffaire &&
    shouldShowR1DocumentChecklist(timeline.entries);

  const showR3DocumentChecklist =
    isPipeType(pipe.pipe_type) &&
    pipe.pipe_type === "AFFAIRE" &&
    pipe.contact_id > 0 &&
    !isVersementAffaire &&
    !timeline.loading &&
    shouldShowR3DocumentChecklist(timeline.entries);

  const loadR3DocumentChecklist =
    isPipeType(pipe.pipe_type) &&
    pipe.pipe_type === "AFFAIRE" &&
    pipe.contact_id > 0 &&
    !isVersementAffaire &&
    shouldShowR3DocumentChecklist(timeline.entries);

  const showR3ImmoDocumentChecklist =
    isPipeType(pipe.pipe_type) &&
    pipe.pipe_type === "AFFAIRE" &&
    pipe.contact_id > 0 &&
    !isVersementAffaire &&
    !timeline.loading &&
    shouldShowR3ImmoDocumentChecklist(timeline.entries);

  const loadR3ImmoDocumentChecklist =
    isPipeType(pipe.pipe_type) &&
    pipe.pipe_type === "AFFAIRE" &&
    pipe.contact_id > 0 &&
    !isVersementAffaire &&
    shouldShowR3ImmoDocumentChecklist(timeline.entries);

  const { templates: checklistTemplates } = usePipeChecklistTemplates();

  const r1Documents = usePipeR1DocumentChecklist(
    pipe.id,
    pipe.contact_id,
    pipe.secondary_contact_id,
    loadR1DocumentChecklist,
    checklistTemplates
  );

  const r3Documents = usePipeR3DocumentChecklist(
    pipe.id,
    pipe.contact_id,
    pipe.secondary_contact_id,
    loadR3DocumentChecklist,
    checklistTemplates
  );

  const r3ImmoDocuments = usePipeR3ImmoDocumentChecklist(
    pipe.id,
    pipe.contact_id,
    pipe.secondary_contact_id,
    loadR3ImmoDocumentChecklist
  );

  const prospectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveTab("suivi");
    setFocusProspectionToken(0);
  }, [pipe.id]);

  useEffect(() => {
    if (!focusHistoriqueToken) return;
    setActiveTab("historique");
  }, [focusHistoriqueToken]);

  useEffect(() => {
    if (pipe.contact_id <= 0) {
      setContactInfo(null);
      return;
    }
    let cancelled = false;
    const loadContact = () => {
      void getContactById(pipe.contact_id).then((c) => {
        if (!cancelled) {
          setContactInfo({ email: c.email, telephone: c.telephone });
        }
      });
    };
    loadContact();
    const unsub = subscribeContactsChanged((detail) => {
      if (detail.patchedContact?.id === pipe.contact_id) {
        setContactInfo({
          email: detail.patchedContact.email,
          telephone: detail.patchedContact.telephone,
        });
      } else if (detail.removedContactId !== pipe.contact_id) {
        loadContact();
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [pipe.contact_id]);

  useEffect(() => {
    if (!showProspectionFields || activeTab !== "suivi" || pipe.stage !== "PROSPECTION") return;
    const frame = requestAnimationFrame(() => {
      prospectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [showProspectionFields, pipe.id, pipe.stage, activeTab]);

  const handleViewProspection = () => {
    setActiveTab("historique");
    setFocusProspectionToken((token) => token + 1);
  };

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="border-b px-5 py-4 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <PipeTypeBadge pipeType={pipe.pipe_type} />
              {pipe.stage ? <PipeStageBadge stage={pipe.stage} pipe={pipe} /> : null}
              {showR1DocumentChecklist ? (
                <PipeR1MissingDocsBadge
                  checklist={r1Documents.checklist}
                  templates={checklistTemplates}
                />
              ) : null}
              {showR3DocumentChecklist ? (
                <PipeR3MissingDocsBadge
                  checklist={r3Documents.checklist}
                  templates={checklistTemplates}
                />
              ) : null}
              {showR3ImmoDocumentChecklist ? (
                <PipeR3ImmoMissingDocsBadge
                  checklist={r3ImmoDocuments.checklist}
                  checklistContext={r3ImmoDocuments.checklistContext}
                  checklistTemplate={r3ImmoDocuments.checklistTemplate}
                />
              ) : null}
              {isArchived && (
                <Badge variant="secondary" className="text-xs">
                  Archivé
                </Badge>
              )}
            </div>
            <h2 className="text-lg font-semibold leading-tight">{pipe.titre}</h2>
            <p className="text-sm text-muted-foreground">
              {formatPipeParticipantsLabel(pipe)}
              {pipe.parent_titre && pipe.parent_pipe_id ? (
                <>
                  {" · rattaché à "}
                  {onOpenParentPipe ? (
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => {
                        const parentId = pipe.parent_pipe_id;
                        if (parentId != null && parentId > 0) onOpenParentPipe(parentId);
                      }}
                    >
                      {pipe.parent_titre}
                    </button>
                  ) : (
                    pipe.parent_titre
                  )}
                </>
              ) : null}
            </p>
            {pipe.contact_id > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => void openContactWithTab(pipe.contact_id)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Voir la fiche contact
                </Button>
                {contactInfo?.email?.trim() && (
                  <button
                    type="button"
                    onClick={() => void openExternalUrl(`mailto:${contactInfo.email!.trim()}`)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Mail className="h-3 w-3" />
                    {contactInfo.email.trim()}
                  </button>
                )}
                {contactInfo?.telephone?.trim() && (
                  <button
                    type="button"
                    onClick={() => void openExternalUrl(`tel:${contactInfo.telephone!.trim()}`)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Phone className="h-3 w-3" />
                    {contactInfo.telephone.trim()}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="outline" size="icon" onClick={onEdit} aria-label="Modifier">
              <Pencil className="h-4 w-4" />
            </Button>
            {isArchived ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void handleUnarchive()}
                disabled={archiving}
                aria-label="Réactiver"
                title="Réactiver ce pipe"
              >
                <ArchiveRestore className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setConfirmArchive(true)}
                aria-label="Archiver"
                title="Archiver — retire du pipe actif, conserve l'historique client"
              >
                <Archive className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setConfirmDelete(true)}
              aria-label="Supprimer"
              title="Suppression définitive"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-5 mt-3 w-fit shrink-0">
            <TabsTrigger value="suivi">Suivi</TabsTrigger>
            <TabsTrigger value="historique" className="gap-1.5">
              Historique
              {timeline.entries.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 px-1.5 font-normal tabular-nums text-[10px]"
                >
                  {timeline.entries.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="suivi"
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-6 focus-visible:outline-none"
          >
            {showStageStepper && (
              <PipeStageStepper
                currentStage={pipe.stage}
                timelineEntries={timeline.entries}
                onViewProspection={handleViewProspection}
                onPlanRdv={onPlanRdv}
              />
            )}

            {showR1DocumentChecklist ? (
              <PipeR1DocumentChecklist
                pipeId={pipe.id}
                stage={pipe.stage}
                contactId={pipe.contact_id}
                checklist={r1Documents.checklist}
                documents={r1Documents.documents}
                loading={r1Documents.loading}
                templates={checklistTemplates}
                onPersist={r1Documents.persist}
                onDocumentImported={r1Documents.addDocument}
                linkItemDocument={r1Documents.linkItemDocument}
              />
            ) : null}

            {showR3DocumentChecklist ? (
              <PipeR3DocumentChecklist
                pipeId={pipe.id}
                stage={pipe.stage}
                contactId={pipe.contact_id}
                checklist={r3Documents.checklist}
                documents={r3Documents.documents}
                loading={r3Documents.loading}
                templates={checklistTemplates}
                onPersist={r3Documents.persist}
                onDocumentImported={r3Documents.addDocument}
                linkItemDocument={r3Documents.linkItemDocument}
              />
            ) : null}

            {showR3ImmoDocumentChecklist ? (
              <PipeR3ImmoDocumentChecklist
                pipeId={pipe.id}
                stage={pipe.stage}
                contactId={pipe.contact_id}
                checklist={r3ImmoDocuments.checklist}
                checklistContext={r3ImmoDocuments.checklistContext}
                checklistTemplate={r3ImmoDocuments.checklistTemplate}
                documents={r3ImmoDocuments.documents}
                loading={r3ImmoDocuments.loading}
                onPersist={r3ImmoDocuments.persist}
                onDocumentImported={r3ImmoDocuments.addDocument}
                linkItemDocument={r3ImmoDocuments.linkItemDocument}
              />
            ) : null}

            {showProspectionFields && (
              <div ref={prospectionRef} id="pipe-prospection-section">
                <PipeProspectionContactSection contactId={pipe.contact_id} />
              </div>
            )}

            {isVersementAffaire ? (
              <p className="text-xs text-muted-foreground leading-snug">
                Versement complémentaire : suivi partenaire et chiffre d&apos;affaires. L&apos;affaire
                passe à <span className="font-medium text-foreground">Gagnée</span> après le mail
                client (étape 6).
              </p>
            ) : null}

            {showSuiviSection && onOpenChildAffaire ? (
              <>
                <PipeSuiviPlacementAvancement pipeId={pipe.id} />
                <PipeSuiviSection
                pipe={pipe}
                childAffaires={childAffaires}
                timeline={timeline}
                onJournalAdded={() => setActiveTab("historique")}
                onOpenChildAffaire={onOpenChildAffaire}
              />
              </>
            ) : isVersementAffaire ? (
              <>
                <PipeSuiviPlacementAvancement pipeId={pipe.id} />
                <PipeSuiviQuickAdd
                  timeline={timeline}
                  pipe={pipe}
                  onAdded={() => setActiveTab("historique")}
                />
                <PipeSuiviStelliumActAdd
                  pipe={pipe}
                  timeline={timeline}
                  variant="affaire"
                  onAdded={() => setActiveTab("historique")}
                />
              </>
            ) : (
              <>
                {showAffairePlacementSection && (
                  <PipeSuiviPlacementAvancement pipeId={pipe.id} />
                )}
                {showClassicAffaireStelliumSouscription ? (
                  <PipeSuiviStelliumActAdd
                    pipe={pipe}
                    timeline={timeline}
                    variant="affaire"
                    onAdded={() => setActiveTab("historique")}
                  />
                ) : null}
                <PipeTimelineQuickAdd
                  timeline={timeline}
                  pipe={pipe}
                  onAdded={() => setActiveTab("historique")}
                />
              </>
            )}
          </TabsContent>

          <TabsContent
            value="historique"
            className="mt-0 min-h-0 flex-1 overflow-y-auto px-5 py-4 focus-visible:outline-none"
          >
            <PipeTimelineHistory
              timeline={timeline}
              pipe={pipe}
              focusProspectionToken={focusProspectionToken}
            />
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver ce pipe ?</AlertDialogTitle>
            <AlertDialogDescription>
              Il disparaîtra du pipe actif (board et liste). L&apos;historique reste visible dans
              l&apos;onglet Relation de la fiche contact. Vous pourrez le réactiver plus tard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleArchive()} disabled={archiving}>
              {archiving ? "Archivage…" : "Archiver"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement ce pipe ?</AlertDialogTitle>
            <AlertDialogDescription>
              Action irréversible : le pipe et tout son historique seront effacés. Préférez
              l&apos;archivage pour conserver la trace côté client. Supprimez d&apos;abord les
              éléments rattachés actifs.
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
