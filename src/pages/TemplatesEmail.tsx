import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Search, Sparkles, Tag, Zap, RefreshCw, Inbox } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  getAllTemplatesEmail,
  deleteTemplateEmail,
  createTemplateEmail,
  seedDefaultEmailTemplates,
  type TemplateEmail,
} from "@/lib/api/tauri-templates-email";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getAllEtiquettes, type Etiquette } from "@/lib/api/tauri-etiquettes";
import { getEmailConnectionStatus, type EmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { TemplateEmailForm } from "@/components/emails/TemplateEmailForm";
import { TemplateEmailPreviewPanel } from "@/components/emails/TemplateEmailPreviewPanel";
import {
  TemplateActivationModeFilters,
  TemplateCategoryFilters,
  TemplateListRow,
  TemplatePreviewActions,
  TemplatePreviewActivationStatus,
  TemplatePreviewContactControls,
  TemplatesEmailActiveFilterChips,
  TemplatesEmailDeliveryBanner,
  TemplatesEmailHelp,
  TemplatesEmailStelliumPerfSection,
} from "@/components/emails/templates-email-ui";
import {
  duplicateTemplatePayload,
  EMAIL_TEMPLATE_CATEGORIES,
} from "@/lib/emails/template-email-meta";
import { filterTemplatesEmail } from "@/lib/emails/filter-templates-email";
import { filterLibraryTemplates } from "@/lib/emails/template-library";
import {
  computeTemplatesEmailPageStats,
  getTemplateActivationFlags,
  matchesTemplateActivationStatFilter,
  type TemplateActivationStatFilter,
} from "@/lib/emails/template-email-activation";
import {
  buildTemplatesEmailActiveFilterChips,
  type TemplatesEmailActiveFilterId,
} from "@/lib/emails/templates-email-active-filters";
import type { ContactRegistre } from "@/lib/emails/template-email-formality";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { getTemplateCorpsHtml } from "@/lib/emails/template-email-html";
import { ensureStelliumPerfEmailTemplates } from "@/lib/api/tauri-stellium-perf-campaign";
import { STELLIUM_PERF_TEMPLATE_NOM } from "@/lib/investissements/stellium-perf-campaign";
import { useTemplatesEmailAutoRefresh } from "@/hooks/useTemplatesEmailAutoRefresh";
import { navigateToEtiquetteEdit } from "@/lib/navigation/etiquettes-navigation";
import { resolveTemplateSouscriptionDuplicateWarning } from "@/lib/emails/template-etiquette-duplicate";
import {
  loadTemplatesEmailPagePreferences,
  saveTemplatesEmailPagePreferences,
} from "@/lib/emails/templates-email-page-preferences";
import { toast } from "sonner";

type TemplatesEmailProps = {
  onNavigate?: (page: string) => void;
};

export function TemplatesEmail({ onNavigate }: TemplatesEmailProps) {
  const [templates, setTemplates] = useState<TemplateEmail[]>([]);
  const [etiquettes, setEtiquettes] = useState<Etiquette[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateEmail | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [cgp, setCgp] = useState<Awaited<ReturnType<typeof getCgpConfig>> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activationFilter, setActivationFilter] = useState<TemplateActivationStatFilter | null>(
    null
  );
  const [emailStatus, setEmailStatus] = useState<EmailConnectionStatus | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [previewContactId, setPreviewContactId] = useState("sample");
  const [previewRegistre, setPreviewRegistre] = useState<ContactRegistre>("VOUS");
  const [deleteTarget, setDeleteTarget] = useState<TemplateEmail | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const previewIdRef = useRef(previewId);
  previewIdRef.current = previewId;

  const loadTemplates = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const data = await getAllTemplatesEmail();
      setTemplates(data);
      const currentPreviewId = previewIdRef.current;
      if (data.length > 0 && currentPreviewId == null) {
        setPreviewId(data[0].id);
      }
      if (currentPreviewId != null && !data.some((t) => t.id === currentPreviewId)) {
        setPreviewId(data[0]?.id ?? null);
      }
    } catch (error) {
      console.error("Error loading templates:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadEtiquetteLinks = useCallback(async () => {
    try {
      const etiq = await getAllEtiquettes();
      setEtiquettes(etiq);
    } catch (error) {
      console.error("Error loading etiquettes:", error);
    }
  }, []);

  useTemplatesEmailAutoRefresh({
    onTemplatesRefresh: () => loadTemplates({ silent: true }),
    onEtiquetteLinksRefresh: loadEtiquetteLinks,
  });

  useEffect(() => {
    const prefs = loadTemplatesEmailPagePreferences();
    setSearchQuery(prefs.searchQuery);
    setCategoryFilter(prefs.categoryFilter);
    setActivationFilter(prefs.activationFilter);
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    saveTemplatesEmailPagePreferences({
      searchQuery,
      categoryFilter,
      activationFilter,
    });
  }, [prefsLoaded, searchQuery, categoryFilter, activationFilter]);

  useEffect(() => {
    void (async () => {
      try {
        await ensureStelliumPerfEmailTemplates();
      } catch (error) {
        console.error("ensure Stellium perf templates:", error);
      }
      await Promise.all([loadTemplates(), loadEtiquetteLinks()]);
      void getCgpConfig().then(setCgp).catch(() => setCgp(null));
      void getEmailConnectionStatus().then(setEmailStatus).catch(() => setEmailStatus(null));
      void getAllContacts()
        .then((list) => setContacts(list.filter((c) => c.email?.trim())))
        .catch(() => setContacts([]));
    })();
  }, [loadTemplates, loadEtiquetteLinks]);

  const linkCountByTemplate = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of etiquettes) {
      if (e.email_template_id != null) {
        m.set(e.email_template_id, (m.get(e.email_template_id) ?? 0) + 1);
      }
    }
    return m;
  }, [etiquettes]);

  const libraryTemplates = useMemo(
    () => filterLibraryTemplates(templates),
    [templates]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of libraryTemplates) {
      counts[t.categorie] = (counts[t.categorie] ?? 0) + 1;
    }
    return counts;
  }, [libraryTemplates]);

  const stats = useMemo(
    () => computeTemplatesEmailPageStats(libraryTemplates, linkCountByTemplate),
    [libraryTemplates, linkCountByTemplate]
  );

  const souscriptionDuplicateByTemplateId = useMemo(() => {
    const map = new Map<number, string>();
    for (const template of libraryTemplates) {
      const warning = resolveTemplateSouscriptionDuplicateWarning(template, etiquettes);
      if (warning) map.set(template.id, warning);
    }
    return map;
  }, [libraryTemplates, etiquettes]);

  const filtered = useMemo(() => {
    const bySearchAndCategory = filterTemplatesEmail(
      libraryTemplates,
      searchQuery,
      categoryFilter
    );
    return bySearchAndCategory.filter((template) =>
      matchesTemplateActivationStatFilter(template, linkCountByTemplate, activationFilter)
    );
  }, [libraryTemplates, searchQuery, categoryFilter, activationFilter, linkCountByTemplate]);

  const previewTemplate = templates.find((t) => t.id === previewId) ?? null;

  const previewDuplicateWarning = previewTemplate
    ? souscriptionDuplicateByTemplateId.get(previewTemplate.id)
    : undefined;

  const linkedEtiquettes = useMemo(() => {
    if (!previewTemplate) return [];
    return etiquettes.filter((e) => e.email_template_id === previewTemplate.id);
  }, [etiquettes, previewTemplate]);

  const previewActivationFlags = useMemo(() => {
    if (!previewTemplate) return null;
    return getTemplateActivationFlags(
      previewTemplate,
      linkCountByTemplate.get(previewTemplate.id) ?? 0
    );
  }, [previewTemplate, linkCountByTemplate]);

  const previewContact = useMemo(() => {
    if (previewContactId === "sample") return null;
    const id = parseInt(previewContactId, 10);
    return contacts.find((c) => c.id === id) ?? null;
  }, [previewContactId, contacts]);

  const previewTutoiement = useMemo(() => {
    if (!previewTemplate?.tutoiement_template_id) return null;
    const tu = templates.find((t) => t.id === previewTemplate.tutoiement_template_id);
    if (!tu) return null;
    return {
      sujet: tu.sujet,
      corps: tu.corps,
      corpsHtml: getTemplateCorpsHtml(tu.variables),
    };
  }, [previewTemplate, templates]);

  const activeFilterChips = useMemo(
    () =>
      buildTemplatesEmailActiveFilterChips({
        activationFilter,
        categoryFilter,
        searchQuery,
      }),
    [activationFilter, categoryFilter, searchQuery]
  );

  const applyActivationFilter = (filter: TemplateActivationStatFilter | null) => {
    setActivationFilter((current) => (current === filter ? null : filter));
  };

  const resetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setActivationFilter(null);
  };

  const removeActiveFilter = (id: TemplatesEmailActiveFilterId) => {
    switch (id) {
      case "activation":
        setActivationFilter(null);
        break;
      case "category":
        setCategoryFilter("all");
        break;
      case "search":
        setSearchQuery("");
        break;
    }
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const n = await seedDefaultEmailTemplates();
      if (n > 0) {
        await loadTemplates();
      }
      toast.success(
        n > 0 ? `${n} modèle${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""}` : "Bibliothèque déjà complète"
      );
    } catch {
      toast.error("Impossible d'ajouter les modèles par défaut");
    } finally {
      setSeeding(false);
    }
  };

  const handleEdit = (template: TemplateEmail) => {
    setSelectedTemplate(template);
    setShowForm(true);
  };

  const handleDuplicate = async (template: TemplateEmail) => {
    try {
      await createTemplateEmail(duplicateTemplatePayload(template));
      toast.success("Modèle dupliqué");
    } catch {
      toast.error("Erreur lors de la duplication");
    }
  };

  const handleDeleteRequest = (template: TemplateEmail) => {
    setDeleteTarget(template);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteTemplateEmail(deleteTarget.id);
      if (previewId === deleteTarget.id) setPreviewId(null);
      toast.success("Modèle supprimé");
      setDeleteTarget(null);
      await loadTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(msg.includes("Failed") ? "Erreur lors de la suppression" : msg);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setSelectedTemplate(null);
  };

  const handleOpenEtiquette = (etiquetteId: number) => {
    if (!onNavigate) {
      toast.info("Navigation indisponible — ouvrez l'étiquette depuis le menu Étiquettes.");
      return;
    }
    navigateToEtiquetteEdit(onNavigate, etiquetteId, "templates-email");
  };

  const focusStelliumPerfTemplate = useCallback(() => {
    setSearchQuery("Performance AV/PER");
    setCategoryFilter("NEWSLETTER");
    setActivationFilter(null);
    const stellium = templates.find((t) => t.nom === STELLIUM_PERF_TEMPLATE_NOM);
    if (stellium) setPreviewId(stellium.id);
  }, [templates]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-1">Modèles email</h2>
          <p className="text-muted-foreground max-w-xl text-sm">
            Bibliothèque de messages — déclencheur auto, campagnes étiquette ou relance, envoi
            depuis Suivi → Envois.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void handleSeedDefaults()}
            disabled={seeding}
          >
            <Sparkles className="h-4 w-4" />
            Modèles par défaut
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Nouveau modèle
          </Button>
        </div>
      </div>

      <TemplatesEmailHelp />

      <TemplatesEmailDeliveryBanner emailStatus={emailStatus} onNavigate={onNavigate} />

      <TemplatesEmailStelliumPerfSection
        onNavigate={onNavigate}
        onPrepared={() => void loadTemplates({ silent: true })}
        onShowStelliumTemplates={focusStelliumPerfTemplate}
      />

      <section className="space-y-2" aria-label="Synthèse des modèles">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Synthèse — cliquer pour filtrer
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Déclencheur actif"
            value={stats.trigger}
            description="Envoi auto sans étiquette"
            icon={Zap}
            accentColor="#d97706"
            iconColor="text-amber-700"
            iconBgColor="bg-amber-50"
            onClick={() => applyActivationFilter("trigger")}
            highlight={activationFilter === "trigger"}
          />
          <StatCard
            title="Liés étiquette"
            value={stats.etiquette}
            description="Campagnes classiques par tag"
            icon={Tag}
            accentColor="#2563eb"
            iconColor="text-blue-700"
            iconBgColor="bg-blue-50"
            onClick={() => applyActivationFilter("etiquette")}
            highlight={activationFilter === "etiquette"}
          />
          <StatCard
            title="Relance configurée"
            value={stats.relance}
            description="2e email après le 1er envoi"
            icon={RefreshCw}
            accentColor="#ea580c"
            iconColor="text-orange-700"
            iconBgColor="bg-orange-50"
            onClick={() => applyActivationFilter("relance")}
            highlight={activationFilter === "relance"}
          />
          <StatCard
            title="Sans canal"
            value={stats.noChannel}
            description="Message seul — à configurer"
            icon={Inbox}
            accentColor="#6b7280"
            iconColor="text-gray-600"
            iconBgColor="bg-gray-50"
            onClick={() => applyActivationFilter("no_channel")}
            highlight={activationFilter === "no_channel"}
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Bibliothèque</CardTitle>
                <CardDescription>
                  {filtered.length} modèle{filtered.length !== 1 ? "s" : ""}
                  {searchQuery || categoryFilter !== "all" || activationFilter
                    ? ` (sur ${libraryTemplates.length})`
                    : ""}
                </CardDescription>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un modèle…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <TemplateCategoryFilters
              categories={EMAIL_TEMPLATE_CATEGORIES.map((c) => ({
                id: c.id,
                label: c.label,
              }))}
              active={categoryFilter}
              counts={categoryCounts}
              onChange={setCategoryFilter}
            />
            <TemplateActivationModeFilters
              active={activationFilter}
              onChange={setActivationFilter}
            />
            <TemplatesEmailActiveFilterChips
              chips={activeFilterChips}
              onRemove={removeActiveFilter}
              onReset={resetFilters}
            />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-10 text-muted-foreground text-sm">Chargement…</div>
            ) : templates.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <p className="text-sm text-muted-foreground">Aucun modèle pour le moment.</p>
                <Button variant="outline" size="sm" onClick={() => void handleSeedDefaults()}>
                  Charger les modèles par défaut
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                Aucun résultat — modifiez la recherche, l&apos;intention ou la synthèse.
              </p>
            ) : (
              <div className="space-y-2 max-h-[min(65vh,640px)] overflow-y-auto pr-1">
                {filtered.map((template) => (
                  <TemplateListRow
                    key={template.id}
                    template={template}
                    selected={previewId === template.id}
                    etiquetteLinkCount={linkCountByTemplate.get(template.id) ?? 0}
                    souscriptionDuplicateWarning={souscriptionDuplicateByTemplateId.get(
                      template.id
                    )}
                    onSelect={() => setPreviewId(template.id)}
                    onEdit={() => handleEdit(template)}
                    onDuplicate={() => void handleDuplicate(template)}
                    onDeleteRequest={() => handleDeleteRequest(template)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 lg:sticky lg:top-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Aperçu</CardTitle>
            <CardDescription>
              Variables remplacées sur un contact réel ou l&apos;exemple
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewTemplate && previewActivationFlags ? (
              <TemplatePreviewActions
                onEdit={() => handleEdit(previewTemplate)}
                onDuplicate={() => void handleDuplicate(previewTemplate)}
              >
                <TemplatePreviewActivationStatus
                  template={previewTemplate}
                  linkedEtiquettes={linkedEtiquettes}
                  flags={previewActivationFlags}
                  onOpenEtiquette={onNavigate ? handleOpenEtiquette : undefined}
                  souscriptionDuplicateWarning={previewDuplicateWarning}
                />
                <TemplatePreviewContactControls
                  contacts={contacts}
                  previewContactId={previewContactId}
                  onPreviewContactIdChange={setPreviewContactId}
                  previewRegistre={previewRegistre}
                  onPreviewRegistreChange={setPreviewRegistre}
                  showRegistreToggle={!previewContact && previewTutoiement != null}
                />
                <TemplateEmailPreviewPanel
                  sujet={previewTemplate.sujet}
                  corps={previewTemplate.corps}
                  corpsHtml={getTemplateCorpsHtml(previewTemplate.variables)}
                  templateNom={previewTemplate.nom}
                  templateVariables={previewTemplate.variables}
                  cgp={cgp}
                  agendaLinkId={previewTemplate.agenda_link_id}
                  contact={previewContact}
                  tutoiement={previewTutoiement}
                  previewRegistre={previewContact ? undefined : previewRegistre}
                  label=""
                  allowSendTest
                />
              </TemplatePreviewActions>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sélectionnez un modèle dans la liste.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <TemplateEmailForm
        open={showForm}
        onOpenChange={handleFormClose}
        template={selectedTemplate}
        onSuccess={async () => {
          await loadTemplates({ silent: true });
          handleFormClose();
        }}
      />

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce modèle ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  <strong>{deleteTarget.nom}</strong> sera définitivement supprimé. Les étiquettes
                  liées seront détachées ; les modèles qui l&apos;utilisaient comme relance le
                  seront aussi.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteConfirm();
              }}
            >
              {deleteBusy ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
