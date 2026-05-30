import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Mail, Pencil, Trash2, Copy, Sparkles } from "lucide-react";
import {
  getAllTemplatesEmail,
  deleteTemplateEmail,
  createTemplateEmail,
  seedDefaultEmailTemplates,
  type TemplateEmail,
} from "@/lib/api/tauri-templates-email";
import { TemplateEmailForm } from "@/components/emails/TemplateEmailForm";
import { TemplateEmailPreviewPanel } from "@/components/emails/TemplateEmailPreviewPanel";
import {
  duplicateTemplatePayload,
  EMAIL_TEMPLATE_CATEGORIES,
  getTemplateCategoryMeta,
} from "@/lib/emails/template-email-meta";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { toast } from "sonner";

export function TemplatesEmail() {
  const [templates, setTemplates] = useState<TemplateEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateEmail | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [cgp, setCgp] = useState<Awaited<ReturnType<typeof getCgpConfig>> | null>(null);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await getAllTemplatesEmail();
      setTemplates(data);
      if (data.length > 0 && previewId == null) {
        setPreviewId(data[0].id);
      }
    } catch (error) {
      console.error("Error loading templates:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
    void getCgpConfig().then(setCgp).catch(() => setCgp(null));
  }, []);

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

  const grouped = useMemo(() => {
    const map = new Map<string, TemplateEmail[]>();
    for (const cat of EMAIL_TEMPLATE_CATEGORIES) {
      map.set(cat.id, []);
    }
    for (const t of templates) {
      const list = map.get(t.categorie) ?? map.get("AUTRE")!;
      list.push(t);
    }
    return EMAIL_TEMPLATE_CATEGORIES.map((c) => ({
      ...c,
      items: (map.get(c.id) ?? []).sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
    })).filter((g) => g.items.length > 0);
  }, [templates]);

  const previewTemplate = templates.find((t) => t.id === previewId) ?? null;

  const handleEdit = (template: TemplateEmail) => {
    setSelectedTemplate(template);
    setShowForm(true);
  };

  const handleDuplicate = async (template: TemplateEmail) => {
    try {
      await createTemplateEmail(duplicateTemplatePayload(template));
      await loadTemplates();
      toast.success("Template dupliqué");
    } catch {
      toast.error("Erreur lors de la duplication");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer ce template ?")) return;
    try {
      await deleteTemplateEmail(id);
      if (previewId === id) setPreviewId(null);
      await loadTemplates();
      toast.success("Template supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setSelectedTemplate(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Templates d&apos;emails
          </h2>
          <p className="text-muted-foreground max-w-2xl">
            Bibliothèque par intention (relance, fiscalité…). Liez un template à une étiquette
            pour préremplir la file Suivi → Envois.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => void handleSeedDefaults()} disabled={seeding}>
            <Sparkles className="h-4 w-4" />
            Modèles par défaut
          </Button>
          <Button className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Nouveau template
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Bibliothèque</CardTitle>
            <CardDescription>
              {templates.length} template{templates.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Chargement...</div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-muted-foreground">Aucun template.</p>
                <Button variant="outline" onClick={() => void handleSeedDefaults()}>
                  Charger les modèles par défaut
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {grouped.map((group) => (
                  <div key={group.id}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">
                      {group.label}
                    </h3>
                    <div className="space-y-2">
                      {group.items.map((template) => {
                        const meta = getTemplateCategoryMeta(template.categorie);
                        const selected = previewId === template.id;
                        return (
                          <div
                            key={template.id}
                            role="button"
                            tabIndex={0}
                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                              selected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                            }`}
                            onClick={() => setPreviewId(template.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") setPreviewId(template.id);
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <Mail className="h-4 w-4 text-primary shrink-0" />
                                  <span className="font-medium truncate">{template.nom}</span>
                                  <Badge className={meta.badgeClass}>{meta.label}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {template.sujet}
                                </p>
                              </div>
                              <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(template)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => void handleDuplicate(template)}>
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => void handleDelete(template.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Aperçu</CardTitle>
            <CardDescription>Variables remplacées sur un exemple</CardDescription>
          </CardHeader>
          <CardContent>
            {previewTemplate ? (
              <TemplateEmailPreviewPanel
                sujet={previewTemplate.sujet}
                corps={previewTemplate.corps}
                cgp={cgp}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Sélectionnez un template.</p>
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
