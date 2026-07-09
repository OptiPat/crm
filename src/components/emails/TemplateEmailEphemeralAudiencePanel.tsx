import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ContactAutoRuleCategoryPicker } from "@/components/etiquettes/ContactAutoRuleCategoryPicker";
import { ConditionBuilder } from "@/components/etiquettes/ConditionBuilder";
import { TemplateEmailEphemeralProductFilter } from "@/components/emails/TemplateEmailEphemeralProductFilter";
import { TypeProduitInvestmentOptions } from "@/components/etiquettes/TypeProduitInvestmentOptions";
import { getAllSegments, type Segment } from "@/lib/api/tauri-segments";
import {
  EPHEMERAL_DEFAULT_SEND_TIME,
  defaultEphemeralRuleChildren,
  ephemeralRuleTreeToJson,
  hasEphemeralRuleTree,
  parseEphemeralRuleTree,
  ephemeralSendDateTimeToUnix,
  isEphemeralSegmentAudience,
  shouldShowEphemeralPatrimoineFilter,
  unixToEphemeralSendDateLocal,
  unixToEphemeralSendTimeLocal,
  type EphemeralCampaignAudience,
  type EphemeralReinvestFilter,
  type EphemeralVersementProgrammeFilter,
} from "@/lib/emails/template-email-ephemeral";
import type { RuleLeaf, RuleOp } from "@/lib/etiquettes/rule-ast";

type Props = {
  audience: EphemeralCampaignAudience;
  sendAt: number | null;
  onAudienceChange: (next: EphemeralCampaignAudience) => void;
  onSendAtChange: (next: number | null) => void;
  highlightInvalid?: boolean;
};

export function TemplateEmailEphemeralAudiencePanel({
  audience,
  sendAt,
  onAudienceChange,
  onSendAtChange,
  highlightInvalid,
}: Props) {
  const [segments, setSegments] = useState<Segment[]>([]);

  useEffect(() => {
    void getAllSegments()
      .then(setSegments)
      .catch(() => setSegments([]));
  }, []);

  const activeSegments = useMemo(() => segments.filter((s) => s.actif), [segments]);

  const patchAudience = (partial: Partial<EphemeralCampaignAudience>) =>
    onAudienceChange({ ...audience, ...partial });

  const segmentMode = isEphemeralSegmentAudience(audience);
  const showPatrimoine =
    !segmentMode && shouldShowEphemeralPatrimoineFilter(audience.categories);
  const useAdvancedRule = hasEphemeralRuleTree(audience);
  const parsedRule = useMemo(
    () => parseEphemeralRuleTree(audience.rule_tree),
    [audience.rule_tree]
  );
  const ruleOp: RuleOp = parsedRule?.op ?? "and";
  const ruleChildren: RuleLeaf[] = parsedRule?.children ?? defaultEphemeralRuleChildren();

  const setAudienceMode = (mode: "manual" | "segment") => {
    if (mode === "segment") {
      if (activeSegments.length === 0) return;
      const first = activeSegments[0]?.id ?? null;
      onAudienceChange({
        ...audience,
        segment_id: first,
        categories: [],
        types_produit: [],
        noms_produit: [],
        reinvestissement_dividendes: "any",
        versement_programme: "any",
        rule_tree: null,
      });
      return;
    }
    onAudienceChange({
      ...audience,
      segment_id: null,
      categories: audience.categories.length > 0 ? audience.categories : ["CLIENT"],
    });
  };

  const handleSegmentPick = (value: string) => {
    const id = parseInt(value, 10);
    if (Number.isNaN(id)) return;
    onAudienceChange({
      ...audience,
      segment_id: id,
      categories: [],
      types_produit: [],
      noms_produit: [],
      reinvestissement_dividendes: "any",
      versement_programme: "any",
      rule_tree: null,
    });
  };

  const handleCategoriesChange = (categories: string[]) => {
    if (!shouldShowEphemeralPatrimoineFilter(categories)) {
      onAudienceChange({
        ...audience,
        categories,
        types_produit: [],
        noms_produit: [],
        reinvestissement_dividendes: "any",
        versement_programme: "any",
        rule_tree: null,
      });
      return;
    }
    patchAudience({ categories });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-violet-50/40 px-4 py-3 text-sm text-muted-foreground">
        Campagne ponctuelle : ciblez des contacts par catégories et, pour les clients, par
        patrimoine. Préparez la file, puis envoyez depuis{" "}
        <strong className="text-foreground">Suivi → Envois</strong>. Le modèle disparaît de la
        bibliothèque une fois la campagne terminée ; l&apos;historique reste sur chaque fiche.
      </div>

      <div className="space-y-2">
        <Label>Mode de ciblage</Label>
        <Select
          value={segmentMode ? "segment" : "manual"}
          onValueChange={(v) => setAudienceMode(v as "manual" | "segment")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manuel (catégories / patrimoine)</SelectItem>
            <SelectItem value="segment" disabled={activeSegments.length === 0}>
              Segment existant{activeSegments.length === 0 ? " (aucun actif)" : ""}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {segmentMode ? (
        <div className="space-y-2">
          <Label>Segment</Label>
          {activeSegments.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-lg px-3 py-4 text-center">
              Aucun segment actif — créez-en un dans Suivi → Segments ou Étiquettes.
            </p>
          ) : (
            <Select
              value={String(audience.segment_id ?? "")}
              onValueChange={handleSegmentPick}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir un segment…" />
              </SelectTrigger>
              <SelectContent>
                {activeSegments.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nom}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            Les contacts correspondant au segment au moment de la préparation seront ajoutés à la
            file (snapshot). Les règles du segment (TMI, étiquettes, etc.) s&apos;appliquent.
          </p>
        </div>
      ) : (
        <>
      <div className="space-y-2">
        <Label>Catégories contact</Label>
        <ContactAutoRuleCategoryPicker
          selected={audience.categories}
          onChange={handleCategoriesChange}
        />
        {!showPatrimoine && (
          <p className="text-xs text-muted-foreground">
            Ciblage réseau filleul : les contacts correspondant aux catégories cochées sont retenus
            sans filtre patrimonial.
          </p>
        )}
      </div>

      {showPatrimoine && (
        <>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Règle avancée (TMI, revenus…)</p>
              <p className="text-xs text-muted-foreground">
                Alternative ou complément au filtre patrimoine — ex. TMI 30 % et revenus ≥ 60 000 €.
              </p>
            </div>
            <Switch
              id="ephemeral-advanced-rule"
              checked={useAdvancedRule}
              onCheckedChange={(checked) => {
                if (!checked) {
                  patchAudience({ rule_tree: null });
                  return;
                }
                patchAudience({
                  rule_tree: ephemeralRuleTreeToJson("and", defaultEphemeralRuleChildren()),
                });
              }}
            />
          </div>

          {useAdvancedRule && (
            <ConditionBuilder
              op={ruleOp}
              onOpChange={(op) =>
                patchAudience({
                  rule_tree: ephemeralRuleTreeToJson(op, ruleChildren),
                })
              }
              children={ruleChildren}
              onChange={(children) =>
                patchAudience({
                  rule_tree: ephemeralRuleTreeToJson(ruleOp, children),
                })
              }
              showPreview={false}
            />
          )}

          <TemplateEmailEphemeralProductFilter
            types={audience.types_produit}
            nomsProduit={audience.noms_produit}
            produitsMatchMode={audience.produits_match_mode}
            onTypesChange={(types) => patchAudience({ types_produit: types })}
            onNomsProduitChange={(noms) => patchAudience({ noms_produit: noms })}
            onProduitsMatchModeChange={(produits_match_mode) =>
              patchAudience({ produits_match_mode })
            }
            highlightInvalid={highlightInvalid}
          />

          <TypeProduitInvestmentOptions
            reinvestissementDividendes={audience.reinvestissement_dividendes}
            versementProgramme={audience.versement_programme}
            onReinvestissementChange={(v) =>
              patchAudience({ reinvestissement_dividendes: v as EphemeralReinvestFilter })
            }
            onVersementProgrammeChange={(v) =>
              patchAudience({ versement_programme: v as EphemeralVersementProgrammeFilter })
            }
          />
        </>
      )}

        </>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium">Envoi planifié (optionnel)</Label>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label htmlFor="ephemeral-send-date" className="text-xs text-muted-foreground">
              Date
            </Label>
            <Input
              id="ephemeral-send-date"
              type="date"
              className="w-[180px]"
              value={unixToEphemeralSendDateLocal(sendAt)}
              onChange={(e) => {
                const date = e.target.value;
                if (!date) {
                  onSendAtChange(null);
                  return;
                }
                onSendAtChange(
                  ephemeralSendDateTimeToUnix(
                    date,
                    sendAt != null
                      ? unixToEphemeralSendTimeLocal(sendAt)
                      : EPHEMERAL_DEFAULT_SEND_TIME
                  )
                );
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ephemeral-send-time" className="text-xs text-muted-foreground">
              Heure
            </Label>
            <Input
              id="ephemeral-send-time"
              type="time"
              className="w-[140px]"
              value={unixToEphemeralSendTimeLocal(sendAt)}
              disabled={sendAt == null}
              onChange={(e) => {
                const date = unixToEphemeralSendDateLocal(sendAt);
                if (!date) return;
                onSendAtChange(ephemeralSendDateTimeToUnix(date, e.target.value));
              }}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Sans date : file dès la préparation (Prêts à envoyer). Avec date et heure : visible dans
          Suivi → Envois à partir du créneau choisi.
        </p>
      </div>
    </div>
  );
}
