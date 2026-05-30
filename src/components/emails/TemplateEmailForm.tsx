import { useState, useEffect, useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createTemplateEmail,
  updateTemplateEmail,
  type NewTemplateEmail,
  type TemplateEmail,
} from "@/lib/api/tauri-templates-email";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import {
  EMAIL_TEMPLATE_CATEGORIES,
  EMAIL_TEMPLATE_VARIABLES,
} from "@/lib/emails/template-email-meta";
import { TemplateEmailPreviewPanel } from "@/components/emails/TemplateEmailPreviewPanel";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface TemplateEmailFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateEmail | null;
  onSuccess: () => void;
}

export function TemplateEmailForm({
  open,
  onOpenChange,
  template,
  onSuccess,
}: TemplateEmailFormProps) {
  const [loading, setLoading] = useState(false);
  const [cgp, setCgp] = useState<Awaited<ReturnType<typeof getCgpConfig>> | null>(null);
  const [previewContactId, setPreviewContactId] = useState<string>("sample");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [formData, setFormData] = useState<NewTemplateEmail>({
    nom: "",
    sujet: "",
    corps: "",
    categorie: "RELANCE",
    variables: null,
  });

  useEffect(() => {
    if (!open) return;
    void getCgpConfig().then(setCgp).catch(() => setCgp(null));
    void getAllContacts()
      .then((list) => setContacts(list.filter((c) => c.email?.trim())))
      .catch(() => setContacts([]));
  }, [open]);

  useEffect(() => {
    if (template) {
      setFormData({
        nom: template.nom,
        sujet: template.sujet,
        corps: template.corps,
        categorie: template.categorie,
        variables: template.variables,
      });
    } else {
      setFormData({
        nom: "",
        sujet: "",
        corps: "",
        categorie: "RELANCE",
        variables: null,
      });
      setPreviewContactId("sample");
    }
  }, [template, open]);

  const previewContact = useMemo(() => {
    if (previewContactId === "sample") return null;
    const id = parseInt(previewContactId, 10);
    return contacts.find((c) => c.id === id) ?? null;
  }, [previewContactId, contacts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (template) {
        await updateTemplateEmail(template.id, formData);
        toast.success("Template modifié");
      } else {
        await createTemplateEmail(formData);
        toast.success("Template créé");
      }
      onSuccess();
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  const insertVariable = (variable: string, field: "sujet" | "corps") => {
    setFormData({
      ...formData,
      [field]: `${formData[field]} ${variable}`.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? "Modifier le template" : "Nouveau template"}
          </DialogTitle>
          <DialogDescription>
            Modèles réutilisables pour les campagnes liées aux étiquettes. Variables documentées
            ci-dessous.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nom">Nom du template *</Label>
              <Input
                id="nom"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Ex: Relance — client 1 an"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="categorie">Intention *</Label>
              <Select
                value={formData.categorie}
                onValueChange={(value) =>
                  setFormData({ ...formData, categorie: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMAIL_TEMPLATE_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Variables (cliquez pour insérer)</Label>
            <div className="flex flex-wrap gap-2">
              {EMAIL_TEMPLATE_VARIABLES.map((v) => (
                <span key={v.token} className="inline-flex gap-0.5">
                  <Badge
                    variant="outline"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground rounded-r-none"
                    title={`${v.label} — ${v.hint} → message`}
                    onClick={() => insertVariable(v.token, "corps")}
                  >
                    {v.token}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="cursor-pointer rounded-l-none text-[10px] px-1.5"
                    title="→ objet"
                    onClick={() => insertVariable(v.token, "sujet")}
                  >
                    obj
                  </Badge>
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Variable → corps ; « obj » → objet.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sujet">Objet *</Label>
            <Input
              id="sujet"
              value={formData.sujet}
              onChange={(e) => setFormData({ ...formData, sujet: e.target.value })}
              placeholder="Ex: {{prenom}}, reprenons contact"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="corps">Message *</Label>
            <Textarea
              id="corps"
              value={formData.corps}
              onChange={(e) => setFormData({ ...formData, corps: e.target.value })}
              rows={10}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Aperçu sur</Label>
            <Select value={previewContactId} onValueChange={setPreviewContactId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sample">Contact fictif (Marie Dupont)</SelectItem>
                {contacts.slice(0, 200).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.prenom} {c.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TemplateEmailPreviewPanel
            sujet={formData.sujet}
            corps={formData.corps}
            cgp={cgp}
            contact={previewContact}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : template ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
