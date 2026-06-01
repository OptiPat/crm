import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Send,
  Settings2,
  Loader2,
  ArrowRight,
  Eye,
  Save,
  Mail,
} from "lucide-react";
import {
  activateNewsletterCampaign,
  ensureNewsletterEtiquette,
  generateNewsletterContent,
  getNewsletterSettings,
  type GeneratedNewsletterContent,
  type NewsletterSettings,
} from "@/lib/api/tauri-newsletter";
import {
  createTemplateEmail,
  setTemplateEtiquetteLinks,
} from "@/lib/api/tauri-templates-email";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { sendEmail } from "@/lib/api/tauri-email";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { ParametresNewsletterSection } from "@/components/settings/ParametresNewsletterSection";
import { appendEmailSignature, buildSendEmailBodies } from "@/lib/emails/email-signature";
import { replaceTemplateVariables } from "@/lib/api/tauri-templates-email";
import { SAMPLE_PREVIEW_CONTACT } from "@/lib/emails/template-email-meta";
import {
  buildNewsletterHtml,
  buildNewsletterHtmlOptions,
  buildNewsletterPlainBody,
  contentFromPlainEdit,
  injectNewsletterSignatureHtml,
  serializeNewsletterTemplateMeta,
} from "@/lib/newsletter/newsletter-html";
import { NewsletterChatPanel } from "@/components/newsletter/NewsletterChatPanel";
import { toast } from "sonner";

function formatEditionLabel() {
  return new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function Newsletter({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [tab, setTab] = useState<"composer" | "settings">("composer");
  const [settings, setSettings] = useState<NewsletterSettings | null>(null);
  const [cgp, setCgp] = useState<CgpConfig | null>(null);
  const [emailConnected, setEmailConnected] = useState(false);

  const [theme, setTheme] = useState("");
  const [editionInstructions, setEditionInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [content, setContent] = useState<GeneratedNewsletterContent | null>(null);
  const [subject, setSubject] = useState("");
  const [plainBody, setPlainBody] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");

  const [preparing, setPreparing] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const [etiquetteInfo, setEtiquetteInfo] = useState<{
    id: number;
    count: number;
  } | null>(null);
  const [etiquetteNom, setEtiquetteNom] = useState("Newsletter");
  const [sendDelayMs, setSendDelayMs] = useState(3000);
  const [chatSessionKey, setChatSessionKey] = useState(0);

  const load = useCallback(async () => {
    const [s, cgpConfig, emailSt] = await Promise.all([
      getNewsletterSettings(),
      getCgpConfig().catch(() => null),
      getEmailConnectionStatus().catch(() => null),
    ]);
    setSettings(s);
    setEtiquetteNom(s.etiquetteNom);
    setSendDelayMs(s.sendDelayMs);
    setCgp(cgpConfig);
    setEmailConnected(Boolean(emailSt?.connected && emailSt.method === "oauth"));
    const etiq = await ensureNewsletterEtiquette(s.etiquetteNom);
    setEtiquetteInfo({ id: etiq.etiquetteId, count: etiq.contactCount });
  }, []);

  useEffect(() => {
    void load().catch((e) => {
      console.error(e);
      toast.error("Impossible de charger la newsletter");
    });
  }, [load]);

  useEffect(() => {
    if (tab !== "composer") return;
    void getNewsletterSettings()
      .then(setSettings)
      .catch(() => {});
  }, [tab]);

  const htmlOptions = useMemo(() => buildNewsletterHtmlOptions(cgp), [cgp]);

  const refreshPreviewHtml = useCallback(
    (c: GeneratedNewsletterContent) => {
      setPreviewHtml(buildNewsletterHtml(c, htmlOptions));
    },
    [htmlOptions]
  );

  const applyDraft = useCallback(
    (c: GeneratedNewsletterContent) => {
      setContent(c);
      setSubject(c.subject);
      setPlainBody(buildNewsletterPlainBody(c));
      refreshPreviewHtml(c);
    },
    [refreshPreviewHtml]
  );

  const currentDraft = useMemo((): GeneratedNewsletterContent => {
    if (content) {
      return { ...content, subject: subject.trim() || content.subject };
    }
    return contentFromPlainEdit(subject, plainBody);
  }, [content, subject, plainBody]);

  const handleGenerate = async () => {
    if (!theme.trim()) {
      toast.error("Indiquez un sujet ou thème");
      return;
    }
    setGenerating(true);
    try {
      const generated = await generateNewsletterContent({
        theme: theme.trim(),
        editionInstructions: editionInstructions.trim() || null,
      });
      setContent(generated);
      setSubject(generated.subject);
      const plain = buildNewsletterPlainBody(generated);
      setPlainBody(plain);
      refreshPreviewHtml(generated);
      setChatSessionKey((k) => k + 1);
      toast.success("Newsletter générée — discutez avec Mistral pour affiner");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur Mistral");
    } finally {
      setGenerating(false);
    }
  };

  const handlePlainBodyChange = (value: string) => {
    setPlainBody(value);
    if (!content) return;
    const parts = value.split(/\n\n+/);
    const updated: GeneratedNewsletterContent = {
      subject,
      intro: parts[0] ?? "",
      sections: content.sections,
      cta: parts[parts.length - 1] ?? "",
    };
    refreshPreviewHtml(updated);
  };

  const handleSendTest = async () => {
    const to = cgp?.email?.trim();
    if (!to) {
      toast.error("Renseignez votre email dans Paramètres → Profil");
      return;
    }
    if (!emailConnected) {
      toast.error("Connectez Gmail dans Paramètres → Email");
      return;
    }
    if (!subject.trim() || !plainBody.trim()) {
      toast.error("Générez ou saisissez une newsletter d'abord");
      return;
    }
    setSendingTest(true);
    try {
      const vars = {
        prenom: cgp?.prenom?.trim() || SAMPLE_PREVIEW_CONTACT.prenom,
        nom: cgp?.nom?.trim() || SAMPLE_PREVIEW_CONTACT.nom,
      };
      const subj = replaceTemplateVariables(subject.trim(), vars);
      const bodyPlain = appendEmailSignature(
        replaceTemplateVariables(plainBody.trim(), vars),
        cgp?.email_signature
      );
      let html = replaceTemplateVariables(previewHtml, vars);
      html = injectNewsletterSignatureHtml(html, cgp?.email_signature_html);
      const fallback = buildSendEmailBodies(bodyPlain, cgp);
      await sendEmail({
        to_email: to,
        to_name: `${cgp?.prenom ?? ""} ${cgp?.nom ?? ""}`.trim(),
        subject: subj,
        body: bodyPlain,
        body_html: html || fallback.body_html,
      });
      toast.success(`Aperçu envoyé à ${to}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi test impossible");
    } finally {
      setSendingTest(false);
    }
  };

  const handlePrepareCampaign = async () => {
    if (!subject.trim() || !plainBody.trim()) {
      toast.error("Contenu incomplet");
      return;
    }
    if (!etiquetteInfo) {
      toast.error("Étiquette Newsletter introuvable");
      return;
    }
    if (etiquetteInfo.count === 0) {
      toast.warning(
        "Aucun contact tagué — taguez vos abonnés avec l'étiquette Newsletter avant l'envoi"
      );
    }
    setPreparing(true);
    try {
      const html = previewHtml || buildNewsletterHtml(
        content ?? {
          subject,
          intro: plainBody.split("\n\n")[0] ?? "",
          sections: [],
          cta: "",
        },
        htmlOptions
      );
      const templateNom = `Newsletter — ${formatEditionLabel()}`;
      const template = await createTemplateEmail({
        nom: templateNom,
        sujet: subject.trim(),
        corps: plainBody.trim(),
        categorie: "NEWSLETTER",
        variables: serializeNewsletterTemplateMeta(html),
      });
      await setTemplateEtiquetteLinks(template.id, [etiquetteInfo.id]);
      await activateNewsletterCampaign(etiquetteInfo.id, template.id);
      toast.success("Campagne préparée — ouvrez Suivi → Envois pour valider l'envoi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Préparation campagne impossible");
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Newsletter</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Génération Mistral, mise en page HTML, envoi via votre file Suivi → Envois
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {settings?.apiKeyConfigured ?
            <Badge variant="outline" className="font-normal">
              Mistral connecté
            </Badge>
          : <Badge variant="secondary" className="font-normal">
              Clé API à configurer
            </Badge>
          }
          {etiquetteInfo != null && (
            <Badge variant="outline" className="font-normal">
              {etiquetteInfo.count} abonné{etiquetteInfo.count !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "composer" | "settings")}>
        <TabsList>
          <TabsTrigger value="composer">Composer</TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 className="h-4 w-4 mr-1" />
            Paramètres
          </TabsTrigger>
        </TabsList>

        <TabsContent value="composer" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Thème du numéro</CardTitle>
              <CardDescription>
                Mistral rédige le contenu selon votre style (modifiable dans Paramètres)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newsletter-theme">Sujet / thème</Label>
                <Input
                  id="newsletter-theme"
                  placeholder="Ex. Assurance emprunteur, bilan fin d'année, taux directeurs…"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newsletter-edition">Instructions pour cette édition (optionnel)</Label>
                <Input
                  id="newsletter-edition"
                  placeholder="Ex. Ton plus sobre, insister sur le CTA agenda…"
                  value={editionInstructions}
                  onChange={(e) => setEditionInstructions(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating || !settings?.apiKeyConfigured}
              >
                {generating ?
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Génération…
                  </>
                : <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Générer avec Mistral
                  </>
                }
              </Button>
              {!settings?.apiKeyConfigured && (
                <p className="text-xs text-muted-foreground">
                  Configurez votre clé API dans{" "}
                  <button
                    type="button"
                    className="underline text-primary"
                    onClick={() => onNavigate?.("parametres")}
                  >
                    Paramètres → Newsletter
                  </button>
                  .
                </p>
              )}
            </CardContent>
          </Card>

          {(content || plainBody) && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Édition</CardTitle>
                  <CardDescription>Texte brut — variables {"{{prenom}}"} conservées</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nl-subject">Objet</Label>
                    <Input
                      id="nl-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nl-body">Corps</Label>
                    <Textarea
                      id="nl-body"
                      rows={16}
                      className="font-mono text-sm"
                      value={plainBody}
                      onChange={(e) => handlePlainBodyChange(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={sendingTest}
                      onClick={() => void handleSendTest()}
                    >
                      {sendingTest ?
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <Mail className="h-4 w-4 mr-2" />}
                      M&apos;envoyer un test
                    </Button>
                    <Button
                      type="button"
                      disabled={preparing}
                      onClick={() => void handlePrepareCampaign()}
                    >
                      {preparing ?
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <Save className="h-4 w-4 mr-2" />}
                      Préparer la campagne
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Délai recommandé entre envois : {Math.round(sendDelayMs / 1000)} s (Paramètres).
                    Validez chaque envoi dans{" "}
                    <strong>Suivi → Envois → Prêts</strong>.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Aperçu HTML
                  </CardTitle>
                  <CardDescription>Rendu newsletter (600 px, anti-spam friendly)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg bg-muted/30 overflow-hidden">
                    {previewHtml ?
                      <iframe
                        title="Aperçu newsletter"
                        srcDoc={previewHtml}
                        className="w-full min-h-[520px] bg-white"
                        sandbox=""
                      />
                    : <p className="p-4 text-sm text-muted-foreground">Aperçu indisponible</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {(content || plainBody) && (
            <NewsletterChatPanel
              key={chatSessionKey}
              draft={currentDraft}
              onDraftUpdated={applyDraft}
              disabled={!settings?.apiKeyConfigured}
            />
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Les mêmes réglages sont disponibles dans{" "}
            <button
              type="button"
              className="underline text-primary"
              onClick={() => onNavigate?.("parametres")}
            >
              Paramètres → Newsletter
            </button>
            .
          </p>
          <ParametresNewsletterSection
            onSettingsSaved={(saved) => {
              setSettings(saved);
              setEtiquetteNom(saved.etiquetteNom);
              setSendDelayMs(saved.sendDelayMs);
              setTab("composer");
            }}
          />
        </TabsContent>
      </Tabs>

      <Card className="border-dashed">
        <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
          <Send className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="flex-1 text-muted-foreground">
            Après « Préparer la campagne », taguez vos contacts avec l&apos;étiquette{" "}
            <strong>{etiquetteNom}</strong>, puis validez l&apos;envoi contact par contact dans Suivi.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => onNavigate?.("suivi")}
          >
            Suivi → Envois
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
