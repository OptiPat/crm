import { useEffect, useRef, useState } from "react";
import { ExternalLink, Mail, Pencil, Phone, Trash2 } from "lucide-react";
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
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { deletePipe, type PipeRecord } from "@/lib/api/tauri-pipe";
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
import { PipeSuiviQuickAdd } from "@/components/pipe/PipeSuiviQuickAdd";
import { PipeTimelineHistory } from "@/components/pipe/PipeTimelineHistory";
import { useGlobalContactDetailSheet } from "@/components/layout/ContactDetailSheetProvider";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { toast } from "sonner";

interface PipeDetailPanelProps {
  pipe: PipeRecord;
  childAffaires?: PipeRecord[];
  onEdit: () => void;
  onDeleted: () => void;
  onPlanRdv?: (stage: PipeRdvStage) => void;
  onOpenChildAffaire?: (pipe: PipeRecord) => void;
  onOpenParentPipe?: (parentId: number) => void;
  focusHistoriqueToken?: number;
}

export function PipeDetailPanel({
  pipe,
  childAffaires = [],
  onEdit,
  onDeleted,
  onPlanRdv,
  onOpenChildAffaire,
  onOpenParentPipe,
  focusHistoriqueToken = 0,
}: PipeDetailPanelProps) {
  const { openContactWithTab } = useGlobalContactDetailSheet();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("suivi");
  const [focusProspectionToken, setFocusProspectionToken] = useState(0);
  const [contactInfo, setContactInfo] = useState<Pick<Contact, "email" | "telephone"> | null>(
    null
  );
  const timeline = usePipeTimeline(pipe.id);

  usePipeRdvStageSync(pipe, timeline.entries, timeline.loading);

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
                  <a
                    href={`mailto:${contactInfo.email.trim()}`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Mail className="h-3 w-3" />
                    {contactInfo.email.trim()}
                  </a>
                )}
                {contactInfo?.telephone?.trim() && (
                  <a
                    href={`tel:${contactInfo.telephone.trim().replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Phone className="h-3 w-3" />
                    {contactInfo.telephone.trim()}
                  </a>
                )}
              </div>
            )}
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
