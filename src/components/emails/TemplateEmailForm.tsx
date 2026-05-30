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
  getEtiquetteIdsForTemplate,
  setTemplateEtiquetteLinks,
  type NewTemplateEmail,
  type TemplateEmail,
} from "@/lib/api/tauri-templates-email";
import { getAllEtiquettes, type Etiquette } from "@/lib/api/tauri-etiquettes";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import {
  EMAIL_TEMPLATE_CATEGORIES,
  EMAIL_TEMPLATE_VARIABLES,
  getAgendaVariableTokens,
  normalizeAgendaLinks,
} from "@/lib/emails/template-email-meta";
import { TemplateEmailPreviewPanel } from "@/components/emails/TemplateEmailPreviewPanel";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [etiquettes, setEtiquettes] = useState<Etiquette[]>([]);
  const [linkedEtiquetteIds, setLinkedEtiquetteIds] = useState<number[]>([]);
  const [formData, setFormData] = useState<NewTemplateEmail>({
    nom: "",
    sujet: "",
    corps: "",
    categorie: "RELANCE",
    variables: null,
    agenda_link_id: null,
  });

  useEffect(() => {
    if (!open) return;
    void getCgpConfig().then(setCgp).catch(() => setCgp(null));
    void getAllContacts()
      .then((list) => setContacts(list.filter((c) => c.email?.trim())))
      .catch(() => setContacts([]));
    void getAllEtiquettes().then(setEtiquettes).catch(() => setEtiquettes([]));
  }, [open]);

  useEffect(() => {
    if (template) {
      setFormData({
        nom: template.nom,
        sujet: template.sujet,
        corps: template.corps,
        categorie: template.categorie,
        variables: template.variables,
        agenda_link_id: template.agenda_link_id,
      });
    } else {
      setFormData({
        nom: "",
        sujet: "",
        corps: "",
        categorie: "RELANCE",
        variables: null,
        agenda_link_id: null,
      });
      setPreviewContactId("sample");
      setLinkedEtiquetteIds([]);
    }
  }, [template, open]);

  useEffect(() => {
    if (!open || !template?.id) {
      if (!template) setLinkedEtiquetteIds([]);
      return;
    }
    void getEtiquetteIdsForTemplate(template.id)
      .then(setLinkedEtiquetteIds)
      .catch(() => setLinkedEtiquetteIds([]));
  }, [open, template?.id]);

  const previewContact = useMemo(() => {
    if (previewContactId === "sample") return null;
    const id = parseInt(previewContactId, 10);
    return contacts.find((c) => c.id === id) ?? null;
  }, [previewContactId, contacts]);

  const agendaLinks = useMemo(() => normalizeAgendaLinks(cgp), [cgp]);
  const agendaVariables = useMemo(() => getAgendaVariableTokens(agendaLinks), [agendaLinks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let templateId = template?.id;
      if (template) {
        await updateTemplateEmail(template.id, formData);
        toast.success("Template modifié");
      } else {
        const created = await createTemplateEmail(formData);
        templateId = created.id;
        toast.success("Template créé");
      }
      if (templateId != null) {
        await setTemplateEtiquetteLinks(templateId, linkedEtiquetteIds);
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

          <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
            <Label>Étiquettes qui utilisent ce template</Label>
            <p className="text-xs text-muted-foreground">
              Cochez les étiquettes dont la campagne email enverra ce modèle (Paramètres campagne sur
              chaque étiquette).
            </p>
            <div className="max-h-40 overflow-y-auto space-y-2 pt-1">
              {etiquettes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune étiquette.</p>
              ) : (
                etiquettes.map((e) => (
                  <label
                    key={e.id}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={linkedEtiquetteIds.includes(e.id)}
                      onCheckedChange={(checked) => {
                        setLinkedEtiquetteIds((prev) =>
                          checked
                            ? [...prev, e.id]
                            : prev.filter((id) => id !== e.id)
                        );
                      }}
                    />
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: e.couleur }}
                    />
                    {e.nom}
                    {e.email_actif ? (
                      <span className="text-xs text-muted-foreground">(campagne)</span>
                    ) : null}
                  </label>
                ))
              )}
            </div>
          </div>

          {agendaLinks.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="agenda-link">Lien Google Agenda pour ce template</Label>
              <Select
                value={formData.agenda_link_id ?? "__none__"}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    agenda_link_id: value === "__none__" ? null : value,
                  })
                }
              >
                <SelectTrigger id="agenda-link">
                  <SelectValue placeholder="Choisir un lien" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Aucun (lien_agenda vide)</SelectItem>
                  {agendaLinks.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Utilisé pour la variable <code>{"{{lien_agenda}}"}</code> dans ce modèle.
              </p>
            </div>
          )}

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
              {agendaVariables.map((v) => (
                <span key={v.token} className="inline-flex gap-0.5">
                  <Badge
                    variant="outline"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground rounded-r-none border-amber-300"
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
              Variable → corps ; « obj » → objet. Liens agenda : Paramètres → Profil CGP.
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
            agendaLinkId={formData.agenda_link_id}
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
