import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getBirthdayBuiltinBodies,
  getBirthdayMessageSettings,
  saveBirthdayMessageSettings,
  type BirthdayBuiltinBodies,
  type BirthdayContactToday,
  type BirthdayMessageSettings,
} from "@/lib/api/tauri-birthday-telegram";
import {
  BIRTHDAY_MESSAGE_STARTER_BODIES_TU,
  BIRTHDAY_MESSAGE_STARTER_BODIES_VOUS,
  EMPTY_BIRTHDAY_PROFILE,
  buildBirthdayEditorDraft,
  composeBirthdayMessagePreview,
  extractBirthdayPrenom,
  genreFromCivilite,
  normalizeBirthdayMessageBodies,
  previewVariantIndex,
  profileSliceKey,
  registreFromContact,
  resolveBirthdaySaveSettings,
  resolvePreviewTemplates,
  syncBirthdayMessageUseCustom,
  type BirthdayContactGenre,
  type BirthdayMessageRegistre,
  type BirthdayProfileSliceKey,
} from "@/lib/contacts/birthday-message-compose";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type RegistreTab = "tu" | "vous";
type GenreTab = "m" | "f" | "n";

function emptyDraft(): BirthdayMessageSettings {
  return { useCustom: false, bodiesTu: [], bodiesVous: [], profile: { ...EMPTY_BIRTHDAY_PROFILE } };
}

function emptyBuiltin(): BirthdayBuiltinBodies {
  return { profile: { ...EMPTY_BIRTHDAY_PROFILE } };
}

function registreTabToRegistre(tab: RegistreTab): BirthdayMessageRegistre {
  return tab === "tu" ? "TU" : "VOUS";
}

function genreTabToGenre(tab: GenreTab): BirthdayContactGenre {
  if (tab === "f") return "F";
  if (tab === "n") return "N";
  return "M";
}

function sliceKeyForTabs(registreTab: RegistreTab, genreTab: GenreTab): BirthdayProfileSliceKey {
  return profileSliceKey(registreTabToRegistre(registreTab), genreTabToGenre(genreTab));
}

function countRegistreVariants(
  profile: BirthdayMessageSettings["profile"],
  registreTab: RegistreTab
): number {
  const prefix = registreTab === "tu" ? "tu" : "vous";
  return normalizeBirthdayMessageBodies(profile[`${prefix}M` as BirthdayProfileSliceKey]).length
    + normalizeBirthdayMessageBodies(profile[`${prefix}F` as BirthdayProfileSliceKey]).length
    + normalizeBirthdayMessageBodies(profile[`${prefix}N` as BirthdayProfileSliceKey]).length;
}

function VariantList({
  registre,
  genre,
  bodies,
  onChange,
  hint,
}: {
  registre: BirthdayMessageRegistre;
  genre: BirthdayContactGenre;
  bodies: string[];
  onChange: (next: string[]) => void;
  hint?: string;
}) {
  const previewPrenom =
    registre === "TU"
      ? genre === "F"
        ? "Marie"
        : "Paul"
      : genre === "F"
        ? "Alice"
        : "Jean";

  const updateBody = (index: number, value: string) => {
    const next = [...bodies];
    next[index] = value;
    onChange(next);
  };

  const removeBody = (index: number) => {
    onChange(bodies.filter((_, i) => i !== index));
  };

  const addBody = () => {
    onChange([...bodies, ""]);
  };

  return (
    <div className="space-y-4">
      {hint ? (
        <p className="text-xs text-muted-foreground rounded-lg border border-dashed p-3">{hint}</p>
      ) : null}
      {bodies.map((body, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-border/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">Variante {index + 1}</Label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`Supprimer la variante ${index + 1}`}
              onClick={() => removeBody(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            value={body}
            onChange={(e) => updateBody(index, e.target.value)}
            rows={5}
            placeholder={`Salut {prenom}, joyeux anniversaire !\nCorps du message…\n${registre === "TU" ? "À très vite." : "À bientôt."}`}
            className="text-sm resize-y min-h-[96px] font-mono"
          />
          {body.trim() ? (
            <pre className="text-[11px] leading-snug whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-muted-foreground">
              {composeBirthdayMessagePreview(previewPrenom, registre, body)}
            </pre>
          ) : null}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addBody}>
        <Plus className="h-4 w-4" />
        Ajouter une variante
      </Button>
    </div>
  );
}

function RegistreProfileEditor({
  registreTab,
  draft,
  onPatchSlice,
  hint,
}: {
  registreTab: RegistreTab;
  draft: BirthdayMessageSettings;
  onPatchSlice: (key: BirthdayProfileSliceKey, bodies: string[]) => void;
  hint?: string;
}) {
  const registre = registreTabToRegistre(registreTab);

  return (
    <Tabs defaultValue="m" className="mt-2">
      <TabsList className="grid w-full grid-cols-3 h-9">
        {(["m", "f", "n"] as const).map((genreTab) => {
          const key = sliceKeyForTabs(registreTab, genreTab);
          const count = normalizeBirthdayMessageBodies(draft.profile[key]).length;
          const label = genreTab === "m" ? "Homme" : genreTab === "f" ? "Femme" : "Neutre";
          return (
            <TabsTrigger key={genreTab} value={genreTab} className="text-xs px-2">
              {label} ({count})
            </TabsTrigger>
          );
        })}
      </TabsList>
      {(["m", "f", "n"] as const).map((genreTab) => {
        const key = sliceKeyForTabs(registreTab, genreTab);
        const genre = genreTabToGenre(genreTab);
        return (
          <TabsContent key={genreTab} value={genreTab} className="mt-4">
            <VariantList
              registre={registre}
              genre={genre}
              bodies={draft.profile[key]}
              hint={hint}
              onChange={(bodies) => onPatchSlice(key, bodies)}
            />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function ContactPreviewBlock({
  birthdays,
  draft,
  builtin,
}: {
  birthdays: BirthdayContactToday[];
  draft: BirthdayMessageSettings;
  builtin: BirthdayBuiltinBodies;
}) {
  const [contactId, setContactId] = useState<string>("");
  const [previewText, setPreviewText] = useState("");

  useEffect(() => {
    if (birthdays.length === 0) {
      setContactId("");
      return;
    }
    setContactId((current) =>
      birthdays.some((c) => String(c.id) === current) ? current : String(birthdays[0]!.id)
    );
  }, [birthdays]);

  useEffect(() => {
    const contact = birthdays.find((c) => String(c.id) === contactId);
    if (!contact) {
      setPreviewText("");
      return;
    }

    const registre = registreFromContact(contact.registre);
    const genre = genreFromCivilite(contact.civilite);
    const prenom = extractBirthdayPrenom(contact.prenom, contact.displayName);
    const templates = resolvePreviewTemplates(draft, builtin, registre, genre);

    if (templates.length === 0) {
      setPreviewText("Aucune variante pour ce profil — ajoutez-en dans l'onglet correspondant.");
      return;
    }

    const variantIndex = previewVariantIndex(String(contact.id), templates.length);
    const genreLabel = genre === "F" ? "femme" : genre === "M" ? "homme" : "neutre";
    const variantNote =
      templates.length > 1
        ? `(aperçu variante ${variantIndex + 1} / ${templates.length} — ${registre === "TU" ? "tu" : "vous"} / ${genreLabel} ; tirage aléatoire à l'envoi)\n\n`
        : "";
    setPreviewText(
      variantNote + composeBirthdayMessagePreview(prenom, registre, templates[variantIndex]!)
    );
  }, [birthdays, contactId, draft, builtin]);

  if (birthdays.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
      <Label className="text-sm font-medium">Aperçu contact du jour</Label>
      <Select value={contactId} onValueChange={setContactId}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Choisir un contact" />
        </SelectTrigger>
        <SelectContent>
          {birthdays.map((c) => {
            const genre = genreFromCivilite(c.civilite);
            const genreLabel = genre === "F" ? "f" : genre === "M" ? "h" : "n";
            return (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.prenom} {c.nom} ({registreFromContact(c.registre) === "TU" ? "tu" : "vous"} /{" "}
                {genreLabel})
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {previewText ? (
        <pre className="text-[11px] leading-snug whitespace-pre-wrap rounded-md bg-background border p-2.5 text-foreground">
          {previewText}
        </pre>
      ) : null}
    </div>
  );
}

export function BirthdayMessagesSettingsSheet({
  open,
  onOpenChange,
  birthdays,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  birthdays?: BirthdayContactToday[];
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<BirthdayMessageSettings>(emptyDraft);
  const [builtinBodies, setBuiltinBodies] = useState<BirthdayBuiltinBodies>(emptyBuiltin);
  const todayBirthdays = birthdays ?? [];

  const patchDraft = useCallback(
    (
      patch: Partial<Omit<BirthdayMessageSettings, "profile">> & {
        useCustom?: boolean;
        profile?: Partial<BirthdayMessageSettings["profile"]>;
      }
    ) => {
      setDraft((prev) => {
        if ("useCustom" in patch && patch.useCustom === false) {
          const { profile: _profile, ...rest } = patch;
          return { ...prev, ...rest, useCustom: false };
        }
        if ("profile" in patch && patch.profile) {
          return syncBirthdayMessageUseCustom(prev, { profile: patch.profile });
        }
        const { profile: _profile, ...rest } = patch;
        return { ...prev, ...rest };
      });
    },
    []
  );

  const patchProfileSlice = useCallback(
    (key: BirthdayProfileSliceKey, bodies: string[]) => {
      patchDraft({ profile: { [key]: bodies } as Partial<BirthdayMessageSettings["profile"]> });
    },
    [patchDraft]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, builtin] = await Promise.all([
        getBirthdayMessageSettings(),
        getBirthdayBuiltinBodies(),
      ]);
      setBuiltinBodies(builtin);
      setDraft(buildBirthdayEditorDraft(settings, builtin));
    } catch (error) {
      toast.error(`Impossible de charger les messages : ${String(error)}`);
      setDraft(emptyDraft());
      setBuiltinBodies(emptyBuiltin());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const toSave = resolveBirthdaySaveSettings(draft, builtinBodies);
      const saved = await saveBirthdayMessageSettings(toSave);
      setDraft(buildBirthdayEditorDraft(saved, builtinBodies));
      onSaved?.();
      toast.success(
        saved.useCustom
          ? "Messages personnalisés enregistrés."
          : "Textes intégrés du CRM rétablis."
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(`Enregistrement impossible : ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const loadStarters = () => {
    setDraft((prev) =>
      syncBirthdayMessageUseCustom(prev, {
        profile: {
          tuM:
            normalizeBirthdayMessageBodies(prev.profile.tuM).length > 0
              ? prev.profile.tuM
              : [...BIRTHDAY_MESSAGE_STARTER_BODIES_TU],
          vousM:
            normalizeBirthdayMessageBodies(prev.profile.vousM).length > 0
              ? prev.profile.vousM
              : [...BIRTHDAY_MESSAGE_STARTER_BODIES_VOUS],
        },
      })
    );
  };

  const resetToBuiltIn = () => {
    setDraft({
      useCustom: false,
      bodiesTu: [],
      bodiesVous: [],
      profile: { ...builtinBodies.profile },
    });
  };

  const integratedHint =
    "Message complet sur 3 lignes : salutation (ex. Salut {prenom}, joyeux anniversaire !), corps, puis au revoir (ex. À très vite.). Six variantes par profil.";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif">Messages anniversaire</SheetTitle>
          <SheetDescription>
            Chaque variante est un message complet : salutation, corps et formule de clôture
            (3 lignes). Placeholder <code className="text-xs bg-muted px-1 rounded">{"{prenom}"}</code>{" "}
            dans la salutation et le corps. Profils tu/vous × homme/femme/neutre.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Chargement…
          </div>
        ) : (
          <div className="flex-1 space-y-5 py-2">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
              <div className="space-y-0.5 min-w-0">
                <Label htmlFor="birthday-use-custom" className="text-sm font-medium">
                  Utiliser mes textes enregistrés
                </Label>
                <p className="text-xs text-muted-foreground">
                  Activé après enregistrement d&apos;une modification. Désactivé = variantes
                  intégrées d&apos;origine (salutation, corps et au revoir par profil).
                </p>
              </div>
              <Switch
                id="birthday-use-custom"
                checked={draft.useCustom}
                onCheckedChange={(checked) => patchDraft({ useCustom: checked })}
              />
            </div>

            <ContactPreviewBlock
              birthdays={todayBirthdays}
              draft={draft}
              builtin={builtinBodies}
            />

            <Tabs defaultValue="tu">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tu">
                  Tutoiement ({countRegistreVariants(draft.profile, "tu")})
                </TabsTrigger>
                <TabsTrigger value="vous">
                  Vouvoiement ({countRegistreVariants(draft.profile, "vous")})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="tu" className="mt-3">
                <RegistreProfileEditor
                  registreTab="tu"
                  draft={draft}
                  onPatchSlice={patchProfileSlice}
                  hint={integratedHint}
                />
              </TabsContent>
              <TabsContent value="vous" className="mt-3">
                <RegistreProfileEditor
                  registreTab="vous"
                  draft={draft}
                  onPatchSlice={patchProfileSlice}
                  hint={integratedHint}
                />
              </TabsContent>
            </Tabs>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={loadStarters}>
                Exemples alternatifs
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={resetToBuiltIn}>
                Réinitialiser aux textes d&apos;origine
              </Button>
            </div>
          </div>
        )}

        <SheetFooter className="gap-2 sm:gap-0 pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={loading || saving} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function BirthdayMessagesSettingsButton({
  onOpen,
  customActive,
}: {
  onOpen: () => void;
  customActive?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-8 w-8 shrink-0 relative",
        customActive ? "text-foreground" : "text-muted-foreground"
      )}
      title={
        customActive
          ? "Messages personnalisés actifs — configurer"
          : "Configurer les messages anniversaire"
      }
      aria-label={
        customActive
          ? "Messages personnalisés actifs — configurer les messages anniversaire"
          : "Configurer les messages anniversaire"
      }
      onClick={onOpen}
    >
      <Settings className="h-4 w-4" />
      {customActive ? (
        <span
          className="absolute top-1 right-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-card"
          aria-hidden
        />
      ) : null}
    </Button>
  );
}
