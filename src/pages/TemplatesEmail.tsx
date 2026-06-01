import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Sparkles } from "lucide-react";
import {
  getAllTemplatesEmail,
  deleteTemplateEmail,
  createTemplateEmail,
  seedDefaultEmailTemplates,
  type TemplateEmail,
} from "@/lib/api/tauri-templates-email";
import { getAllEtiquettes, type Etiquette } from "@/lib/api/tauri-etiquettes";
import { TemplateEmailForm } from "@/components/emails/TemplateEmailForm";
import { TemplateEmailPreviewPanel } from "@/components/emails/TemplateEmailPreviewPanel";
import {
  TemplateCategoryFilters,
  TemplateListRow,
  TemplatePreviewActions,
  TemplatesEmailHelp,
} from "@/components/emails/templates-email-ui";
import {
  duplicateTemplatePayload,
  EMAIL_TEMPLATE_CATEGORIES,
} from "@/lib/emails/template-email-meta";
import { filterTemplatesEmail } from "@/lib/emails/filter-templates-email";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { toast } from "sonner";

export function TemplatesEmail() {
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

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const [data, etiq] = await Promise.all([getAllTemplatesEmail(), getAllEtiquettes()]);
      setTemplates(data);
      setEtiquettes(etiq);
      if (data.length > 0 && previewId == null) {
        setPreviewId(data[0].id);
      }
      if (previewId != null && !data.some((t) => t.id === previewId)) {
        setPreviewId(data[0]?.id ?? null);
      }
    } catch (error) {
      console.error("Error loading templates:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        await seedDefaultEmailTemplates();
      } catch {
        /* ignore */
      }
      await loadTemplates();
      void getCgpConfig().then(setCgp).catch(() => setCgp(null));
    })();
  }, []);

  const linkCountByTemplate = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of etiquettes) {
      if (e.email_template_id != null) {
        m.set(e.email_template_id, (m.get(e.email_template_id) ?? 0) + 1);
      }
    }
    return m;
  }, [etiquettes]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of templates) {
      counts[t.categorie] = (counts[t.categorie] ?? 0) + 1;
    }
    return counts;
  }, [templates]);

  const filtered = useMemo(
    () => filterTemplatesEmail(templates, searchQuery, categoryFilter),
    [templates, searchQuery, categoryFilter]
  );

  const previewTemplate = templates.find((t) => t.id === previewId) ?? null;

  const linkedEtiquettes = useMemo(() => {
    if (!previewTemplate) return [];
    return etiquettes.filter((e) => e.email_template_id === previewTemplate.id);
  }, [etiquettes, previewTemplate]);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const n = await seedDefaultEmailTemplates();
      await loadTemplates();
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
      await loadTemplates();
      toast.success("Modèle dupliqué");
    } catch {
      toast.error("Erreur lors de la duplication");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer ce modèle ? Les étiquettes liées perdront ce template.")) return;
    try {
      await deleteTemplateEmail(id);
      if (previewId === id) setPreviewId(null);
      await loadTemplates();
      toast.success("Modèle supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setSelectedTemplate(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-1">Templates email</h2>
          <p className="text-muted-foreground max-w-xl text-sm">
            Bibliothèque de messages pour vos campagnes d&apos;étiquettes.
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

      <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Bibliothèque</CardTitle>
                <CardDescription>
                  {filtered.length} modèle{filtered.length !== 1 ? "s" : ""}
                  {searchQuery || categoryFilter !== "all"
                    ? ` (sur ${templates.length})`
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
                Aucun résultat — modifiez la recherche ou le filtre.
              </p>
            ) : (
              <div className="space-y-2 max-h-[min(65vh,640px)] overflow-y-auto pr-1">
                {filtered.map((template) => (
                  <TemplateListRow
                    key={template.id}
                    template={template}
                    selected={previewId === template.id}
                    linkedCount={linkCountByTemplate.get(template.id)}
                    onSelect={() => setPreviewId(template.id)}
                    onEdit={() => handleEdit(template)}
                    onDuplicate={() => void handleDuplicate(template)}
                    onDelete={() => void handleDelete(template.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 lg:sticky lg:top-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Aperçu</CardTitle>
            <CardDescription>Variables remplacées sur un exemple</CardDescription>
          </CardHeader>
          <CardContent>
            {previewTemplate ? (
              <TemplatePreviewActions
                onEdit={() => handleEdit(previewTemplate)}
                onDuplicate={() => void handleDuplicate(previewTemplate)}
              >
                {linkedEtiquettes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {linkedEtiquettes.map((e) => (
                      <span
                        key={e.id}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border"
                        style={{
                          borderColor: `${e.couleur}55`,
                          backgroundColor: `${e.couleur}18`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: e.couleur }}
                        />
                        {e.nom}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Non lié à une étiquette — cochez des étiquettes dans le modèle ou choisissez ce
                    modèle sur l&apos;étiquette (onglet Email).
                  </p>
                )}
                <TemplateEmailPreviewPanel
                  sujet={previewTemplate.sujet}
                  corps={previewTemplate.corps}
                  cgp={cgp}
                  agendaLinkId={previewTemplate.agenda_link_id}
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
        onSuccess={() => {
          void loadTemplates();
          handleFormClose();
        }}
      />
    </div>
  );
}
