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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createTemplateEmail,
  updateTemplateEmail,
  getEtiquetteIdsForTemplate,
  setTemplateEtiquetteLinks,
  getAllTemplatesEmail,
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
  getTemplateCategoryMeta,
  normalizeAgendaLinks,
} from "@/lib/emails/template-email-meta";
import { TemplateEmailPreviewPanel } from "@/components/emails/TemplateEmailPreviewPanel";
import { CategoryTogglePills } from "@/components/etiquettes/etiquette-form-ui";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
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
  const [formTab, setFormTab] = useState<"message" | "liaisons">("message");
  const [cgp, setCgp] = useState<Awaited<ReturnType<typeof getCgpConfig>> | null>(null);
  const [previewContactId, setPreviewContactId] = useState<string>("sample");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [etiquettes, setEtiquettes] = useState<Etiquette[]>([]);
  const [allTemplates, setAllTemplates] = useState<TemplateEmail[]>([]);
  const [linkedEtiquetteIds, setLinkedEtiquetteIds] = useState<number[]>([]);
  const [formData, setFormData] = useState<NewTemplateEmail>({
    nom: "",
    sujet: "",
    corps: "",
    categorie: "RELANCE",
    variables: null,
    agenda_link_id: null,
    relance_template_id: null,
  });

  useEffect(() => {
    if (!open) return;
    setFormTab("message");
    void getCgpConfig().then(setCgp).catch(() => setCgp(null));
    void getAllContacts()
      .then((list) => setContacts(list.filter((c) => c.email?.trim())))
      .catch(() => setContacts([]));
    void getAllEtiquettes().then(setEtiquettes).catch(() => setEtiquettes([]));
    void getAllTemplatesEmail().then(setAllTemplates).catch(() => setAllTemplates([]));
  }, [open]);

  const relanceTemplateOptions = useMemo(() => {
    return allTemplates.filter((t) => t.id !== template?.id);
  }, [allTemplates, template?.id]);

  useEffect(() => {
    if (template) {
      setFormData({
        nom: template.nom,
        sujet: template.sujet,
        corps: template.corps,
        categorie: template.categorie,
        variables: template.variables,
        agenda_link_id: template.agenda_link_id,
        relance_template_id: template.relance_template_id,
      });
    } else {
      setFormData({
        nom: "",
        sujet: "",
        corps: "",
        categorie: "RELANCE",
        variables: null,
        agenda_link_id: null,
        relance_template_id: null,
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

  const categoryPills = EMAIL_TEMPLATE_CATEGORIES.map((c) => ({
    value: c.id,
    label: c.label,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nom.trim() || !formData.sujet.trim() || !formData.corps.trim()) {
      toast.error("Nom, objet et message sont obligatoires");
      return;
    }
    setLoading(true);
    try {
      let templateId = template?.id;
      if (template) {
        await updateTemplateEmail(template.id, formData);
        toast.success("Modèle enregistré");
      } else {
        const created = await createTemplateEmail(formData);
        templateId = created.id;
        toast.success("Modèle créé");
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

  const toggleEtiquetteLink = (id: number) => {
    setLinkedEtiquetteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle>{template ? "Modifier le modèle" : "Nouveau modèle"}</DialogTitle>
          <DialogDescription>
            Message réutilisable pour les campagnes d&apos;étiquettes — aperçu à droite en direct.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
            <div className="flex-1 min-h-0 flex flex-col min-w-0">
              <Tabs
                value={formTab}
                onValueChange={(v) => setFormTab(v as "message" | "liaisons")}
                className="flex flex-col flex-1 min-h-0"
              >
                <TabsList className="mx-6 mt-4 grid w-auto grid-cols-2 shrink-0">
                  <TabsTrigger value="message">Message</TabsTrigger>
                  <TabsTrigger value="liaisons">
                    Liaisons
                    {linkedEtiquetteIds.length > 0 && (
                      <span className="ml-1.5 text-[10px] text-primary">({linkedEtiquetteIds.length})</span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                  <TabsContent value="message" className="mt-0 space-y-4 data-[state=inactive]:hidden">
                    <div className="space-y-2">
                      <Label htmlFor="nom">Nom du modèle *</Label>
                      <Input
                        id="nom"
                        value={formData.nom}
                        onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                        placeholder="Ex. Rappel déclaration IR"
                        required
                        autoFocus
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Intention</Label>
                      <CategoryTogglePills
                        categories={categoryPills}
                        selected={[formData.categorie]}
                        single
                        onToggle={(value) => setFormData({ ...formData, categorie: value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        {getTemplateCategoryMeta(formData.categorie).label} — pour retrouver le
                        modèle dans la bibliothèque.
                      </p>
                    </div>

                    <details className="group rounded-lg border bg-muted/20">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                        Variables à insérer
                        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="px-3 pb-3 space-y-2 border-t">
                        <div className="flex flex-wrap gap-2 pt-2">
                          {EMAIL_TEMPLATE_VARIABLES.map((v) => (
                            <span key={v.token} className="inline-flex gap-0.5">
                              <Badge
                                variant="outline"
                                className="cursor-pointer hover:bg-primary hover:text-primary-foreground rounded-r-none text-[11px]"
                                title={`${v.label} → message`}
                                onClick={() => insertVariable(v.token, "corps")}
                              >
                                {v.token}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="cursor-pointer rounded-l-none text-[10px] px-1"
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
                                className="cursor-pointer rounded-r-none text-[11px] border-amber-300"
                                onClick={() => insertVariable(v.token, "corps")}
                              >
                                {v.token}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="cursor-pointer rounded-l-none text-[10px] px-1"
                                onClick={() => insertVariable(v.token, "sujet")}
                              >
                                obj
                              </Badge>
                            </span>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Clic sur la variable → corps ; « obj » → objet.
                        </p>
                      </div>
                    </details>

                    <div className="space-y-2">
                      <Label htmlFor="sujet">Objet *</Label>
                      <Input
                        id="sujet"
                        value={formData.sujet}
                        onChange={(e) => setFormData({ ...formData, sujet: e.target.value })}
                        placeholder="Ex. {{prenom}}, votre déclaration d'impôts"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="corps">Message *</Label>
                      <Textarea
                        id="corps"
                        value={formData.corps}
                        onChange={(e) => setFormData({ ...formData, corps: e.target.value })}
                        rows={12}
                        className="font-mono text-sm min-h-[200px]"
                        required
                      />
                    </div>

                    <div className="space-y-2 lg:hidden">
                      <Label>Aperçu sur</Label>
                      <Select value={previewContactId} onValueChange={setPreviewContactId}>
                        <SelectTrigger className="h-9">
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
                      <TemplateEmailPreviewPanel
                        sujet={formData.sujet}
                        corps={formData.corps}
                        cgp={cgp}
                        agendaLinkId={formData.agenda_link_id}
                        contact={previewContact}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="liaisons" className="mt-0 space-y-5 data-[state=inactive]:hidden">
                    <div className="space-y-2 rounded-xl border p-4 bg-orange-50/40 border-orange-100">
                      <Label htmlFor="relance-template">Relance (2e email)</Label>
                      <p className="text-xs text-muted-foreground">
                        Dans Suivi → Envois → À relancer. Vide = renvoyer le même modèle.
                      </p>
                      <Select
                        value={
                          formData.relance_template_id != null
                            ? String(formData.relance_template_id)
                            : "__none__"
                        }
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            relance_template_id:
                              value === "__none__" ? null : parseInt(value, 10),
                          })
                        }
                      >
                        <SelectTrigger id="relance-template">
                          <SelectValue placeholder="Choisir…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Même modèle que le 1er envoi</SelectItem>
                          {relanceTemplateOptions.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.nom}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Étiquettes qui envoient ce modèle</Label>
                      <p className="text-xs text-muted-foreground">
                        Équivalent au choix du modèle sur chaque étiquette (onglet Email). Les
                        étiquettes cochées utiliseront ce template en campagne.
                      </p>
                      {etiquettes.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">Aucune étiquette.</p>
                      ) : (
                        <CategoryTogglePills
                          categories={etiquettes.map((e) => ({
                            value: String(e.id),
                            label: e.nom,
                          }))}
                          selected={linkedEtiquetteIds.map(String)}
                          onToggle={(value) => toggleEtiquetteLink(parseInt(value, 10))}
                        />
                      )}
                    </div>

                    {agendaLinks.length > 0 && (
                      <div className="space-y-2">
                        <Label htmlFor="agenda-link">Lien Google Agenda</Label>
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
                            <SelectItem value="__none__">— Aucun</SelectItem>
                            {agendaLinks.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Pour {"{{lien_agenda}}"} dans le message — liens définis dans Paramètres
                          → Profil.
                        </p>
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            <aside
              className={cn(
                "hidden lg:flex flex-col w-[300px] shrink-0 border-l bg-muted/15",
                "p-4 gap-3 overflow-y-auto"
              )}
            >
              <Label className="text-xs text-muted-foreground">Aperçu en direct</Label>
              <Select value={previewContactId} onValueChange={setPreviewContactId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sample">Marie Dupont (exemple)</SelectItem>
                  {contacts.slice(0, 200).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.prenom} {c.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <TemplateEmailPreviewPanel
                sujet={formData.sujet}
                corps={formData.corps}
                cgp={cgp}
                agendaLinkId={formData.agenda_link_id}
                contact={previewContact}
                label=""
              />
            </aside>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
