import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { Loader2 } from "lucide-react";
import {
  ensureNewsletterEtiquette,
  getNewsletterSettings,
  saveNewsletterSettings,
  type NewsletterSettings,
} from "@/lib/api/tauri-newsletter";
import { openExternalUrl } from "@/lib/api/tauri-system";
import {
  DEFAULT_MISTRAL_MODEL,
  DEFAULT_NEWSLETTER_STYLE_PROMPT,
  NEWSLETTER_STYLE_PRESETS,
} from "@/lib/newsletter/default-style-prompt";
import { toast } from "sonner";

export function ParametresNewsletterSection({
  onSettingsSaved,
}: {
  onSettingsSaved?: (settings: NewsletterSettings) => void;
}) {
  const [settings, setSettings] = useState<NewsletterSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [stylePrompt, setStylePrompt] = useState(DEFAULT_NEWSLETTER_STYLE_PROMPT);
  const [model, setModel] = useState(DEFAULT_MISTRAL_MODEL);
  const [etiquetteNom, setEtiquetteNom] = useState("Newsletter");
  const [sendDelayMs, setSendDelayMs] = useState(3000);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getNewsletterSettings();
      setSettings(s);
      setStylePrompt(s.stylePrompt);
      setModel(s.model);
      setEtiquetteNom(s.etiquetteNom);
      setSendDelayMs(s.sendDelayMs);
      const etiq = await ensureNewsletterEtiquette(s.etiquetteNom);
      setSubscriberCount(etiq.contactCount);
    } catch (e) {
      console.error(e);
      toast.error("Impossible de charger les paramètres newsletter");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!settings?.apiKeyConfigured && !apiKeyInput.trim()) {
      toast.error("Saisissez votre clé API Mistral avant d'enregistrer");
      return;
    }
    setSaving(true);
    try {
      const payload: Parameters<typeof saveNewsletterSettings>[0] = {
        stylePrompt,
        model,
        etiquetteNom,
        sendDelayMs,
      };
      if (apiKeyInput.trim()) {
        payload.apiKey = apiKeyInput.trim();
      }
      const saved = await saveNewsletterSettings(payload);
      setSettings(saved);
      setApiKeyInput("");
      const etiq = await ensureNewsletterEtiquette(saved.etiquetteNom);
      setSubscriberCount(etiq.contactCount);
      onSettingsSaved?.(saved);
      if (payload.apiKey) {
        toast.success("Clé Mistral enregistrée (masquée pour sécurité)");
      } else {
        toast.success("Paramètres newsletter enregistrés");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Chargement…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanel
        title="Clé API Mistral"
        description="Nécessaire pour générer les newsletters (Relation client → Newsletter). Clé stockée localement et chiffrée — console.mistral.ai"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="param-mistral-key">
              {settings?.apiKeyConfigured ?
                "Nouvelle clé (laisser vide pour conserver)"
              : "Clé API"}
            </Label>
            <Input
              id="param-mistral-key"
              type="password"
              autoComplete="off"
              placeholder={settings?.apiKeyConfigured ? "••••••••" : "sk-…"}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            {settings?.apiKeyConfigured ?
              <p className="text-xs text-green-700 dark:text-green-400">
                Clé Mistral enregistrée — le champ reste vide volontairement (comme un mot de
                passe).
              </p>
            : null}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => void openExternalUrl("https://console.mistral.ai/")}
            >
              Obtenir une clé sur console.mistral.ai
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="param-mistral-model">Modèle</Label>
            <Input
              id="param-mistral-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_MISTRAL_MODEL}
            />
          </div>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ?
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement…
              </>
            : "Enregistrer la clé Mistral"}
          </Button>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Style par défaut"
        description="Équivalent de votre GEM Gemini — modifiable à chaque génération via « Instructions édition »"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {NEWSLETTER_STYLE_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStylePrompt(preset.prompt)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Textarea
            rows={12}
            className="font-mono text-xs"
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
          />
        </div>
      </SettingsPanel>

      <SettingsPanel title="Campagne" description="Étiquette technique pour la file d'envoi et espacement entre emails">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="param-nl-etiquette">Nom de l&apos;étiquette (file d&apos;envoi)</Label>
            <Input
              id="param-nl-etiquette"
              value={etiquetteNom}
              onChange={(e) => setEtiquetteNom(e.target.value)}
            />
            {subscriberCount != null && (
              <p className="text-xs text-muted-foreground">
                {subscriberCount} contact{subscriberCount !== 1 ? "s" : ""} tagué
                {subscriberCount !== 1 ? "s" : ""} manuellement (optionnel — l&apos;audience inclut
                toute la base par défaut)
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="param-nl-delay">Délai entre envois (ms)</Label>
            <Input
              id="param-nl-delay"
              type="number"
              min={500}
              step={500}
              value={sendDelayMs}
              onChange={(e) => setSendDelayMs(Number(e.target.value) || 3000)}
            />
            <p className="text-xs text-muted-foreground">
              Espacer les envois réduit le risque spam (ex. 3000 = 3 secondes).
            </p>
          </div>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ?
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement…
              </>
            : "Enregistrer les paramètres newsletter"}
          </Button>
        </div>
      </SettingsPanel>

      <SettingsPanel title="Bonnes pratiques anti-spam">
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li>Destinataires = contacts avec email (toute la base, sauf désinscrits)</li>
          <li>Un seul lien principal (bouton agenda)</li>
          <li>Envoi via Gmail connecté (Paramètres → Email)</li>
          <li>Testez avec « M&apos;envoyer un test » avant la campagne</li>
        </ul>
      </SettingsPanel>
    </div>
  );
}
