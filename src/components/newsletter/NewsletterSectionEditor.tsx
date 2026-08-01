import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GeneratedNewsletterContent, NewsletterLayout } from "@/lib/api/tauri-newsletter";
import { NEWSLETTER_LAYOUT_OPTIONS } from "@/lib/newsletter/newsletter-branding";
import { Plus, Trash2 } from "lucide-react";
import { NEWSLETTER_VARIABLE_HINTS } from "@/lib/newsletter/newsletter-template-variables";
import { footerProfileHasOptions } from "@/lib/newsletter/newsletter-footer-options";
import { NewsletterCollapsibleSection } from "@/components/newsletter/NewsletterCollapsibleSection";
import { useState } from "react";
import { NewsletterPlacedImagesEditor } from "@/components/newsletter/NewsletterPlacedImagesEditor";
import { NewsletterRichBlocksEditor } from "@/components/newsletter/NewsletterRichBlocksEditor";
import { NewsletterRichTextField } from "@/components/newsletter/NewsletterRichTextField";

type NewsletterSectionEditorProps = {
  draft: GeneratedNewsletterContent;
  onChange: (next: GeneratedNewsletterContent) => void;
  /** Coordonnées profil disponibles pour le pied de page */
  footerProfile?: {
    conseillerName?: string;
    phone?: string;
    siteWeb?: string;
    postalAddress?: string;
  };
};

function emptySection(index: number) {
  return { title: `Point ${index + 1}`, body: "", highlight: false as const };
}

export function NewsletterSectionEditor({
  draft,
  onChange,
  footerProfile,
}: NewsletterSectionEditorProps) {
  const update = (patch: Partial<GeneratedNewsletterContent>) => {
    onChange({ ...draft, ...patch });
  };

  const updateSection = (
    index: number,
    patch: Partial<GeneratedNewsletterContent["sections"][number]>
  ) => {
    const sections = draft.sections.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...draft, sections });
  };

  const includeCta = draft.includeCta !== false;
  const includeLegalMentions = draft.includeLegalMentions === true;
  const [editorMode, setEditorMode] = useState<"simple" | "advanced">("simple");
  const hasImages = (draft.images?.length ?? 0) > 0;
  const hasBlocks = (draft.blocks?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Variables : {NEWSLETTER_VARIABLE_HINTS.join(", ")} — couleurs et typo : Paramètres.
        </p>
        <div className="flex rounded-md border p-0.5 text-xs">
          <button
            type="button"
            className={`px-2.5 py-1 rounded ${editorMode === "simple" ? "bg-primary text-primary-foreground" : ""}`}
            onClick={() => setEditorMode("simple")}
          >
            Simple
          </button>
          <button
            type="button"
            className={`px-2.5 py-1 rounded ${editorMode === "advanced" ? "bg-primary text-primary-foreground" : ""}`}
            onClick={() => setEditorMode("advanced")}
          >
            Avancé
          </button>
        </div>
      </div>

      {editorMode === "advanced" ?
        <NewsletterCollapsibleSection
          title="Mise en page et titre éditorial"
          description="Layout, preheader, titre du numéro"
          defaultOpen
        >
          <div className="space-y-2">
            <Label htmlFor="nl-layout">Mise en page de ce numéro</Label>
            <select
              id="nl-layout"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={draft.layout ?? "magazine"}
              onChange={(e) => update({ layout: e.target.value as NewsletterLayout })}
            >
              {NEWSLETTER_LAYOUT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {NEWSLETTER_LAYOUT_OPTIONS.find((o) => o.id === (draft.layout ?? "magazine"))?.hint}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nl-preheader">Preheader (aperçu inbox)</Label>
            <Input
              id="nl-preheader"
              value={draft.preheader ?? ""}
              onChange={(e) => update({ preheader: e.target.value })}
              placeholder="Phrase sous l'objet dans la boîte mail"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nl-edition-title">Titre éditorial du numéro</Label>
            <Input
              id="nl-edition-title"
              value={draft.editionTitle ?? ""}
              onChange={(e) => update({ editionTitle: e.target.value })}
              placeholder="Ex. Les SCPI en 2025 : le palmarès"
            />
          </div>
        </NewsletterCollapsibleSection>
      : null}

      {editorMode === "advanced" ?
        <>
          <NewsletterCollapsibleSection
            title="Images"
            description="Importez puis placez chaque image dans le mail"
            defaultOpen={hasImages}
            badge={hasImages ? `${draft.images?.length ?? 0}` : undefined}
          >
            <NewsletterPlacedImagesEditor draft={draft} onChange={onChange} embedded />
          </NewsletterCollapsibleSection>
          <NewsletterCollapsibleSection
            title="Blocs enrichis"
            description="Citation, chiffre clé, encart ou séparateur"
            defaultOpen={hasBlocks}
            badge={hasBlocks ? `${draft.blocks?.length ?? 0}` : undefined}
          >
            <NewsletterRichBlocksEditor draft={draft} onChange={onChange} embedded />
          </NewsletterCollapsibleSection>
        </>
      : null}

      <NewsletterRichTextField
        id="nl-intro"
        label="Introduction"
        value={draft.intro}
        onChange={(intro) => update({ intro })}
        minHeight="120px"
      />

      {draft.sections.map((section, index) => (
        <div key={index} className="space-y-2 rounded-lg border p-3 bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Section {index + 1}
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={draft.sections.length <= 1}
              onClick={() =>
                update({ sections: draft.sections.filter((_, i) => i !== index) })
              }
              aria-label={`Supprimer la section ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <NewsletterRichTextField
            id={`nl-section-title-${index}`}
            label="Titre de section"
            value={section.title}
            onChange={(title) => updateSection(index, { title })}
            minHeight="72px"
            placeholder="Titre de section"
            variant="sectionTitle"
          />
          <NewsletterRichTextField
            id={`nl-section-body-${index}`}
            label="Corps de la section"
            value={section.body}
            onChange={(body) => updateSection(index, { body })}
            minHeight="160px"
            placeholder="Corps de la section"
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id={`nl-highlight-${index}`}
              checked={section.highlight === true}
              onCheckedChange={(v) => updateSection(index, { highlight: v === true })}
            />
            <Label htmlFor={`nl-highlight-${index}`} className="text-sm font-normal">
              Mettre en avant (encadré accent)
            </Label>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => update({ sections: [...draft.sections, emptySection(draft.sections.length)] })}
      >
        <Plus className="h-4 w-4 mr-1" />
        Ajouter une section
      </Button>

      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="nl-include-cta"
            checked={includeCta}
            onCheckedChange={(v) => update({ includeCta: v === true })}
          />
          <Label htmlFor="nl-include-cta" className="text-sm font-normal">
            Inclure un appel à l'action en fin de mail
          </Label>
        </div>
        {includeCta && (
          <>
            <NewsletterRichTextField
              id="nl-cta"
              label="Texte d'appel à l'action"
              value={draft.cta}
              onChange={(cta) => update({ cta })}
              minHeight="100px"
              placeholder="Ex. Prenez rendez-vous pour en discuter…"
            />
            <div className="grid gap-2 sm:grid-cols-2 pt-1">
              <div className="space-y-1">
                <Label htmlFor="nl-cta-label" className="text-xs text-muted-foreground">
                  Libellé du bouton (optionnel)
                </Label>
                <Input
                  id="nl-cta-label"
                  value={draft.ctaLabel ?? ""}
                  onChange={(e) => update({ ctaLabel: e.target.value })}
                  placeholder="Ex. Prendre rendez-vous"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nl-cta-url" className="text-xs text-muted-foreground">
                  URL du bouton (optionnel)
                </Label>
                <Input
                  id="nl-cta-url"
                  type="url"
                  value={draft.ctaUrl ?? ""}
                  onChange={(e) => update({ ctaUrl: e.target.value })}
                  placeholder="https://…"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Laissez libellé et URL vides pour le comportement automatique (bouton agenda si le
              texte parle de rendez-vous). Lien RDV par défaut : Paramètres → Agenda & RDV.
            </p>
          </>
        )}
        <div className="flex items-center gap-2 border-t pt-3">
          <Checkbox
            id="nl-include-legal"
            checked={includeLegalMentions}
            onCheckedChange={(v) =>
              update({
                includeLegalMentions: v === true,
                legalMentions: draft.legalMentions ?? "",
              })
            }
          />
          <Label htmlFor="nl-include-legal" className="text-sm font-normal">
            Inclure des mentions légales
          </Label>
        </div>
        {includeLegalMentions && (
          <NewsletterRichTextField
            id="nl-legal-mentions"
            label="Mentions légales"
            value={draft.legalMentions ?? ""}
            onChange={(legalMentions) => update({ legalMentions, includeLegalMentions: true })}
            minHeight="100px"
            placeholder="Ex. Les performances passées ne préjugent pas des performances futures…"
          />
        )}
      </div>

      {footerProfile && footerProfileHasOptions(footerProfile) && (
        <NewsletterCollapsibleSection
          title="Pied de page — cette édition"
          description="Identité conseiller, téléphone, site, adresse (profil CGP)"
          defaultOpen={false}
        >
          {footerProfile.conseillerName && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="nl-footer-conseiller"
                checked={draft.includeFooterConseiller !== false}
                onCheckedChange={(v) => update({ includeFooterConseiller: v === true })}
              />
              <Label htmlFor="nl-footer-conseiller" className="text-sm font-normal">
                Identité conseiller ({footerProfile.conseillerName})
              </Label>
            </div>
          )}
          {footerProfile.phone && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="nl-footer-phone"
                checked={draft.includeFooterPhone !== false}
                onCheckedChange={(v) => update({ includeFooterPhone: v === true })}
              />
              <Label htmlFor="nl-footer-phone" className="text-sm font-normal">
                Téléphone ({footerProfile.phone})
              </Label>
            </div>
          )}
          {footerProfile.siteWeb && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="nl-footer-site"
                checked={draft.includeFooterSite !== false}
                onCheckedChange={(v) => update({ includeFooterSite: v === true })}
              />
              <Label htmlFor="nl-footer-site" className="text-sm font-normal">
                Site web ({footerProfile.siteWeb})
              </Label>
            </div>
          )}
          {footerProfile.postalAddress && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="nl-footer-address"
                checked={draft.includeFooterAddress !== false}
                onCheckedChange={(v) => update({ includeFooterAddress: v === true })}
              />
              <Label htmlFor="nl-footer-address" className="text-sm font-normal">
                Adresse ({footerProfile.postalAddress})
              </Label>
            </div>
          )}
        </NewsletterCollapsibleSection>
      )}
    </div>
  );
}
