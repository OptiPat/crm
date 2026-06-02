import { useState, useEffect, useMemo, useRef } from "react";
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
import {
  RichTextEmailEditor,
  insertTextInRichEditor,
} from "@/components/emails/RichTextEmailEditor";
import {
  getTemplateCorpsHtml,
  htmlToPlainEmail,
  plainTextToTemplateHtml,
  sanitizeTemplateEmailHtml,
  setTemplateCorpsHtmlInMeta,
} from "@/lib/emails/template-email-html";
import {
  etiquettesSouscriptionDuplicateForTemplate,
  formatSouscriptionDuplicateWarning,
} from "@/lib/emails/template-etiquette-duplicate";
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
  getTemplateEmailById,
  getEtiquetteIdsForTemplate,
  setTemplateEtiquetteLinks,
  type NewTemplateEmail,
  type TemplateEmail,
} from "@/lib/api/tauri-templates-email";
import {
  TemplateEmailRelancePanel,
  type TemplateRelanceDraft,
} from "@/components/emails/TemplateEmailRelancePanel";
import { parseTemplateEmailMeta } from "@/lib/emails/template-email-html";
import {
  parseTemplateEmailRelance,
  setTemplateEmailRelanceInMeta,
  TEMPLATE_EMAIL_RELANCE_KEY,
} from "@/lib/emails/template-email-relance";
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
import { TemplateEmailTriggerPanel } from "@/components/emails/TemplateEmailTriggerPanel";
import {
  DEFAULT_TEMPLATE_EMAIL_TRIGGER,
  parseTemplateEmailTrigger,
  setTemplateEmailTriggerInMeta,
  type TemplateEmailTriggerConfig,
} from "@/lib/emails/template-email-trigger";
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
  const [formTab, setFormTab] = useState<"message" | "relance" | "declencheur" | "liaisons">(
    "message"
  );
  const [relanceDraft, setRelanceDraft] = useState<TemplateRelanceDraft>({
    enabled: false,
    useSameMessage: true,
    sujet: "",
    corpsHtml: "",
  });
  const [relanceTemplateId, setRelanceTemplateId] = useState<number | null>(null);
  const [emailTrigger, setEmailTrigger] = useState<TemplateEmailTriggerConfig>(
    DEFAULT_TEMPLATE_EMAIL_TRIGGER
  );
  const [cgp, setCgp] = useState<Awaited<ReturnType<typeof getCgpConfig>> | null>(null);
  const [previewContactId, setPreviewContactId] = useState<string>("sample");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [etiquettes, setEtiquettes] = useState<Etiquette[]>([]);
  const [linkedEtiquetteIds, setLinkedEtiquetteIds] = useState<number[]>([]);
  const [corpsHtml, setCorpsHtml] = useState("");
  const richEditorRef = useRef<HTMLDivElement>(null);
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
        relance_template_id: template.relance_template_id,
      });
      const storedHtml = getTemplateCorpsHtml(template.variables);
      setCorpsHtml(storedHtml ?? plainTextToTemplateHtml(template.corps));
      setEmailTrigger(parseTemplateEmailTrigger(template.variables));
      setRelanceTemplateId(template.relance_template_id);
      const meta = parseTemplateEmailMeta(template.variables);
      const hasDedicated = template.relance_template_id != null;
      const relanceEnabled = TEMPLATE_EMAIL_RELANCE_KEY in meta
        ? parseTemplateEmailRelance(template.variables).enabled
        : hasDedicated;
      setRelanceDraft({
        enabled: relanceEnabled,
        useSameMessage: !hasDedicated,
        sujet: "",
        corpsHtml: "",
      });
      if (hasDedicated && template.relance_template_id) {
        void getTemplateEmailById(template.relance_template_id)
          .then((rel) => {
            const relHtml = getTemplateCorpsHtml(rel.variables);
            setRelanceDraft((prev) => ({
              ...prev,
              sujet: rel.sujet,
              corpsHtml: relHtml ?? plainTextToTemplateHtml(rel.corps),
            }));
          })
          .catch(() => undefined);
      }
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
      setCorpsHtml("");
      setEmailTrigger(DEFAULT_TEMPLATE_EMAIL_TRIGGER);
      setRelanceDraft({
        enabled: false,
        useSameMessage: true,
        sujet: "",
        corpsHtml: "",
      });
      setRelanceTemplateId(null);
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

  const souscriptionDuplicateWarning = useMemo(() => {
    if (
      !emailTrigger.enabled ||
      emailTrigger.condition_type !== "EVENEMENT_SOUSCRIPTION" ||
      !template?.id
    ) {
      return "";
    }
    const dupes = etiquettesSouscriptionDuplicateForTemplate(template.id, etiquettes);
    return formatSouscriptionDuplicateWarning(
      formData.nom.trim() || template.nom,
      dupes.map((e) => e.nom)
    );
  }, [
    emailTrigger.enabled,
    emailTrigger.condition_type,
    template?.id,
    template?.nom,
    formData.nom,
    etiquettes,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const plainCorps = htmlToPlainEmail(corpsHtml) || formData.corps.trim();
    if (!formData.nom.trim() || !formData.sujet.trim() || !plainCorps) {
      toast.error("Nom, objet et message sont obligatoires");
      return;
    }
    if (relanceDraft.enabled && !relanceDraft.useSameMessage) {
      const relPlain = htmlToPlainEmail(relanceDraft.corpsHtml);
      if (!relanceDraft.sujet.trim() || !relPlain) {
        toast.error("Relance : renseignez l'objet et le message (onglet Relance)");
        setFormTab("relance");
        return;
      }
    }

    setLoading(true);
    try {
      let linkedRelanceId = relanceTemplateId;
      if (relanceDraft.enabled && !relanceDraft.useSameMessage) {
        const relPlain = htmlToPlainEmail(relanceDraft.corpsHtml);
        const relNom = formData.nom.trim()
          ? `Relance — ${formData.nom.trim()}`
          : "Relance";
        const relPayload: NewTemplateEmail = {
          nom: relNom,
          sujet: relanceDraft.sujet.trim(),
          corps: relPlain,
          categorie: "RELANCE",
          variables: setTemplateCorpsHtmlInMeta(null, relanceDraft.corpsHtml.trim() || null),
          agenda_link_id: formData.agenda_link_id,
          relance_template_id: null,
        };
        if (linkedRelanceId != null) {
          await updateTemplateEmail(linkedRelanceId, relPayload);
        } else {
          const createdRel = await createTemplateEmail(relPayload);
          linkedRelanceId = createdRel.id;
        }
      }

      let variables = setTemplateCorpsHtmlInMeta(formData.variables, corpsHtml.trim() || null);
      variables = setTemplateEmailTriggerInMeta(variables, emailTrigger);
      variables = setTemplateEmailRelanceInMeta(variables, {
        enabled: relanceDraft.enabled,
      });

      const payload: NewTemplateEmail = {
        ...formData,
        corps: plainCorps,
        variables,
        relance_template_id: relanceDraft.enabled
          ? relanceDraft.useSameMessage
            ? null
            : linkedRelanceId
          : formData.relance_template_id,
      };

      let templateId = template?.id;
      if (template) {
        await updateTemplateEmail(template.id, payload);
        toast.success("Modèle enregistré");
      } else {
        const created = await createTemplateEmail(payload);
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

  const applyCorpsHtml = (html: string) => {
    const normalized = sanitizeTemplateEmailHtml(html.trim());
    setCorpsHtml(normalized);
    setFormData((prev) => ({
      ...prev,
      corps: htmlToPlainEmail(normalized),
      variables: setTemplateCorpsHtmlInMeta(prev.variables, normalized || null),
    }));
  };

  const insertVariable = (variable: string, field: "sujet" | "corps") => {
    if (field === "corps") {
      const html = insertTextInRichEditor(richEditorRef.current, ` ${variable}`.trim());
      applyCorpsHtml(html);
      return;
    }
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
            Message, déclencheur (événement ou étiquettes) et mise en forme — aperçu à droite.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
            <div className="flex-1 min-h-0 flex flex-col min-w-0">
              <Tabs
                value={formTab}
                onValueChange={(v) =>
                  setFormTab(v as "message" | "relance" | "declencheur" | "liaisons")
                }
                className="flex flex-col flex-1 min-h-0"
              >
                <TabsList className="mx-6 mt-4 grid w-auto grid-cols-4 shrink-0">
                  <TabsTrigger value="message">Message</TabsTrigger>
                  <TabsTrigger value="relance">
                    Relance
                    {relanceDraft.enabled && (
                      <span className="ml-1.5 text-[10px] text-orange-700">on</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="declencheur">
                    Déclencheur
                    {emailTrigger.enabled && (
                      <span className="ml-1.5 text-[10px] text-primary">on</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="liaisons">
                    Étiquettes
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
                      <RichTextEmailEditor
                        ref={richEditorRef}
                        value={corpsHtml}
                        onChange={applyCorpsHtml}
                        minHeight="240px"
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
                        corpsHtml={corpsHtml}
                        templateVariables={formData.variables}
                        cgp={cgp}
                        agendaLinkId={formData.agenda_link_id}
                        contact={previewContact}
                        allowSendTest
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="relance" className="mt-0 data-[state=inactive]:hidden">
                    <TemplateEmailRelancePanel
                      draft={relanceDraft}
                      onChange={setRelanceDraft}
                      parentNom={formData.nom}
                    />
                  </TabsContent>

                  <TabsContent value="declencheur" className="mt-0 data-[state=inactive]:hidden">
                    {souscriptionDuplicateWarning && (
                      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                        {souscriptionDuplicateWarning}
                      </p>
                    )}
                    <TemplateEmailTriggerPanel
                      trigger={emailTrigger}
                      onChange={setEmailTrigger}
                    />
                  </TabsContent>

                  <TabsContent value="liaisons" className="mt-0 space-y-5 data-[state=inactive]:hidden">
                    {souscriptionDuplicateWarning && (
                      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        {souscriptionDuplicateWarning}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground rounded-lg border px-3 py-2 bg-muted/30">
                      Optionnel : liez des étiquettes pour les campagnes « classiques » (règles
                      auto sur les fiches). Le déclencheur du modèle fonctionne sans créer
                      d&apos;étiquette.
                    </p>
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
                corpsHtml={corpsHtml}
                templateVariables={formData.variables}
                cgp={cgp}
                agendaLinkId={formData.agenda_link_id}
                contact={previewContact}
                label=""
                allowSendTest
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
