import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Mail, Pencil, Trash2 } from "lucide-react";
import {
  getAllTemplatesEmail,
  deleteTemplateEmail,
  type TemplateEmail,
} from "@/lib/api/tauri-templates-email";
import { TemplateEmailForm } from "@/components/emails/TemplateEmailForm";

export function TemplatesEmail() {
  const [templates, setTemplates] = useState<TemplateEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateEmail | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await getAllTemplatesEmail();
      setTemplates(data);
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: TemplateEmail) => {
    setSelectedTemplate(template);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce template ?")) return;

    try {
      await deleteTemplateEmail(id);
      await loadTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
      alert("Erreur lors de la suppression");
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setSelectedTemplate(null);
  };

  const getCategorieColor = (categorie: string) => {
    switch (categorie) {
      case "SUIVI_ANNUEL":
        return "bg-blue-100 text-blue-800";
      case "ARBITRAGE":
        return "bg-purple-100 text-purple-800";
      case "FISCALITE":
        return "bg-green-100 text-green-800";
      case "BIENVENUE":
        return "bg-yellow-100 text-yellow-800";
      case "RELANCE":
        return "bg-orange-100 text-orange-800";
      case "AUTRE":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getCategorieLabel = (categorie: string) => {
    switch (categorie) {
      case "SUIVI_ANNUEL":
        return "Suivi annuel";
      case "ARBITRAGE":
        return "Arbitrage";
      case "FISCALITE":
        return "Fiscalité";
      case "BIENVENUE":
        return "Bienvenue";
      case "RELANCE":
        return "Relance";
      case "AUTRE":
        return "Autre";
      default:
        return categorie;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Templates d'emails
          </h2>
          <p className="text-muted-foreground">
            Créez et gérez vos modèles d'emails
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Nouveau template
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des templates</CardTitle>
          <CardDescription>
            {templates.length} template{templates.length > 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucun template. Commencez par en créer un !
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="p-4 border border-border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Mail className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-lg">{template.nom}</h3>
                        <Badge className={getCategorieColor(template.categorie)}>
                          {getCategorieLabel(template.categorie)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        <strong>Sujet :</strong> {template.sujet}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {template.corps}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(template)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(template.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulaire de création/modification */}
      <TemplateEmailForm
        open={showForm}
        onOpenChange={handleFormClose}
        template={selectedTemplate}
        onSuccess={() => {
          loadTemplates();
          handleFormClose();
        }}
      />
    </div>
  );
}
