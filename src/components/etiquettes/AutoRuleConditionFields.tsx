import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryTogglePills } from "@/components/etiquettes/etiquette-form-ui";
import { INVESTISSEMENT_TYPE_GROUPS } from "@/lib/etiquettes/etiquette-investissement-types";
import { TypeProduitConditionFields } from "@/components/etiquettes/TypeProduitConditionFields";
import { buildTypeProduitConditionConfig } from "@/lib/etiquettes/type-produit-condition";
import {
  CONDITION_TYPE_LABELS,
  type ConditionType,
} from "@/lib/etiquettes/etiquette-condition-labels";
import { AUTO_RULE_CONDITION_TYPES } from "@/lib/etiquettes/auto-rule-condition-types";
import {
  parseConditionConfig,
  stringifyConditionConfig,
  type ConditionDelaiSansContact,
  type ConditionDateApproche,
  type ConditionDateApprocheInvestissement,
  type ConditionPeriodeAnnee,
  type ConditionTypeProduit,
  type ConditionAgeApproche,
  type ConditionEvenementSouscription,
} from "@/lib/api/tauri-etiquettes";
import { SouscriptionRepeatModeRadios } from "@/components/etiquettes/SouscriptionRepeatModeRadios";
import { useMemo } from "react";

const CONTACT_CATEGORIES = [
  { value: "CLIENT", label: "Client" },
  { value: "PROSPECT_CLIENT", label: "Prospect client" },
  { value: "PROSPECT_FILLEUL", label: "Prospect filleul" },
  { value: "SUSPECT_CLIENT", label: "Suspect client" },
  { value: "SUSPECT_FILLEUL", label: "Suspect filleul" },
] as const;

const MOIS_LABELS = [
  { value: 1, label: "Janvier" },
  { value: 2, label: "Février" },
  { value: 3, label: "Mars" },
  { value: 4, label: "Avril" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Juin" },
  { value: 7, label: "Juillet" },
  { value: 8, label: "Août" },
  { value: 9, label: "Septembre" },
  { value: 10, label: "Octobre" },
  { value: 11, label: "Novembre" },
  { value: 12, label: "Décembre" },
];

type Props = {
  conditionType: string;
  conditionConfig: string | null;
  categories: string[];
  onChange: (next: {
    conditionType: string;
    conditionConfig: string | null;
    categories: string[];
  }) => void;
  /** Uniquement pour « Nouvelle souscription » */
  repeatEachSouscription?: boolean;
  onRepeatEachSouscriptionChange?: (value: boolean) => void;
};

export function AutoRuleConditionFields({
  conditionType,
  conditionConfig,
  categories,
  onChange,
  repeatEachSouscription = true,
  onRepeatEachSouscriptionChange,
}: Props) {
  const emit = (
    type: string,
    config: string | null,
    cats: string[]
  ) => onChange({ conditionType: type, conditionConfig: config, categories: cats });

  const delai = useMemo(
    () => parseConditionConfig<ConditionDelaiSansContact>(conditionConfig) ?? { jours: 365, inclure_sans_date: true },
    [conditionConfig]
  );
  const age = useMemo(
    () => parseConditionConfig<ConditionAgeApproche>(conditionConfig) ?? { age: 69, jours_avant: 30 },
    [conditionConfig]
  );
  const dateApproche = useMemo(
    () =>
      parseConditionConfig<ConditionDateApproche>(conditionConfig) ?? {
        champ: "date_prochain_suivi",
        jours_avant: 30,
      },
    [conditionConfig]
  );
  const periode = useMemo(
    () =>
      parseConditionConfig<ConditionPeriodeAnnee>(conditionConfig) ?? {
        mois_debut: 4,
        mois_fin: 5,
      },
    [conditionConfig]
  );
  const typesProduit = useMemo(
    () => parseConditionConfig<ConditionTypeProduit>(conditionConfig)?.types ?? [],
    [conditionConfig]
  );
  const nomsProduit = useMemo(
    () => parseConditionConfig<ConditionTypeProduit>(conditionConfig)?.noms_produit ?? [],
    [conditionConfig]
  );
  const invDate = useMemo(
    () =>
      parseConditionConfig<ConditionDateApprocheInvestissement>(conditionConfig) ?? {
        champ: "date_fin_demembrement",
        jours_avant: 180,
        types_produit: [],
      },
    [conditionConfig]
  );
  const evtSouscription = useMemo(
    () =>
      parseConditionConfig<ConditionEvenementSouscription>(conditionConfig) ?? {
        types: [],
        a_chaque_souscription: true,
      },
    [conditionConfig]
  );

  const toggleType = (list: string[], value: string, setter: (types: string[]) => void) => {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const toggleCategory = (value: string) => {
    const next = categories.includes(value)
      ? categories.filter((c) => c !== value)
      : [...categories, value];
    emit(conditionType, conditionConfig, next.length > 0 ? next : ["CLIENT"]);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Type de déclencheur</Label>
        <Select
          value={conditionType}
          onValueChange={(type) => {
            let config: string | null = null;
            if (type === "DELAI_SANS_CONTACT") {
              config = stringifyConditionConfig({ jours: 365, inclure_sans_date: true });
            } else if (type === "EVENEMENT_SOUSCRIPTION") {
              config = stringifyConditionConfig({ types: [], a_chaque_souscription: true });
            }
            emit(type, config, categories);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choisir…" />
          </SelectTrigger>
          <SelectContent>
            {AUTO_RULE_CONDITION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {CONDITION_TYPE_LABELS[t as ConditionType]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {conditionType === "EVENEMENT_SOUSCRIPTION" && (
        <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">
            Dès qu&apos;un investissement est enregistré sur la fiche (avec date de souscription).
          </p>
          <div className="space-y-2">
            <Label className="text-xs">Types de produit (vide = tous)</Label>
            <div className="max-h-28 overflow-y-auto border rounded-md p-2 flex flex-wrap gap-2 bg-background">
              {INVESTISSEMENT_TYPE_GROUPS.flatMap((g) => g.types).map((t) => (
                <div key={t.value} className="flex items-center gap-1.5">
                  <Checkbox
                    id={`arc-evt-${t.value}`}
                    checked={(evtSouscription.types ?? []).includes(t.value)}
                    onCheckedChange={() => {
                      const types = evtSouscription.types ?? [];
                      const next = types.includes(t.value)
                        ? types.filter((x) => x !== t.value)
                        : [...types, t.value];
                      emit(
                        conditionType,
                        stringifyConditionConfig({ ...evtSouscription, types: next }),
                        categories
                      );
                    }}
                  />
                  <Label htmlFor={`arc-evt-${t.value}`} className="text-xs font-normal cursor-pointer">
                    {t.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          {onRepeatEachSouscriptionChange && (
            <SouscriptionRepeatModeRadios
              variant="email"
              name="repeat-souscription-template"
              eachInvestissement={repeatEachSouscription}
              onChange={onRepeatEachSouscriptionChange}
            />
          )}
        </div>
      )}

      {conditionType === "DELAI_SANS_CONTACT" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Jours sans contact</Label>
            <Input
              type="number"
              min={1}
              value={delai.jours}
              onChange={(e) =>
                emit(
                  conditionType,
                  stringifyConditionConfig({
                    ...delai,
                    jours: parseInt(e.target.value, 10) || 1,
                  }),
                  categories
                )
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={delai.inclure_sans_date}
              onCheckedChange={(c) =>
                emit(
                  conditionType,
                  stringifyConditionConfig({ ...delai, inclure_sans_date: !!c }),
                  categories
                )
              }
            />
            <Label className="text-sm font-normal">Inclure sans date de dernier contact</Label>
          </div>
        </div>
      )}

      {conditionType === "AGE_APPROCHE" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Âge cible</Label>
            <Input
              type="number"
              min={1}
              value={age.age}
              onChange={(e) =>
                emit(
                  conditionType,
                  stringifyConditionConfig({ ...age, age: parseInt(e.target.value, 10) || 69 }),
                  categories
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Dans les prochains (jours)</Label>
            <Input
              type="number"
              min={1}
              value={age.jours_avant}
              onChange={(e) =>
                emit(
                  conditionType,
                  stringifyConditionConfig({
                    ...age,
                    jours_avant: parseInt(e.target.value, 10) || 30,
                  }),
                  categories
                )
              }
            />
          </div>
        </div>
      )}

      {conditionType === "DATE_APPROCHE" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Champ date</Label>
            <Select
              value={dateApproche.champ}
              onValueChange={(champ) =>
                emit(
                  conditionType,
                  stringifyConditionConfig({ ...dateApproche, champ }),
                  categories
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date_prochain_suivi">Prochain suivi client</SelectItem>
                <SelectItem value="date_prochain_suivi_filleul">Prochain suivi filleul</SelectItem>
                <SelectItem value="date_dernier_contact_filleul">Dernier contact filleul</SelectItem>
                <SelectItem value="date_naissance">Date de naissance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Jours avant</Label>
            <Input
              type="number"
              min={1}
              value={dateApproche.jours_avant}
              onChange={(e) =>
                emit(
                  conditionType,
                  stringifyConditionConfig({
                    ...dateApproche,
                    jours_avant: parseInt(e.target.value, 10) || 1,
                  }),
                  categories
                )
              }
            />
          </div>
        </div>
      )}

      {conditionType === "TYPE_PRODUIT" && (
        <TypeProduitConditionFields
          types={typesProduit}
          nomsProduit={nomsProduit}
          onTypesChange={(next) =>
            emit(
              conditionType,
              stringifyConditionConfig(buildTypeProduitConditionConfig(next, nomsProduit)),
              categories
            )
          }
          onNomsProduitChange={(next) =>
            emit(
              conditionType,
              stringifyConditionConfig(buildTypeProduitConditionConfig(typesProduit, next)),
              categories
            )
          }
        />
      )}

      {conditionType === "DATE_APPROCHE_INVESTISSEMENT" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date sur investissement</Label>
              <Select
                value={invDate.champ}
                onValueChange={(champ) =>
                  emit(
                    conditionType,
                    stringifyConditionConfig({ ...invDate, champ }),
                    categories
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_fin_demembrement">Fin démembrement</SelectItem>
                  <SelectItem value="date_fin_pret">Fin de prêt</SelectItem>
                  <SelectItem value="date_souscription">Date de souscription</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Dans les prochains (jours)</Label>
              <Input
                type="number"
                min={1}
                value={invDate.jours_avant}
                onChange={(e) =>
                  emit(
                    conditionType,
                    stringifyConditionConfig({
                      ...invDate,
                      jours_avant: parseInt(e.target.value, 10) || 1,
                    }),
                    categories
                  )
                }
              />
            </div>
          </div>
        </div>
      )}

      {conditionType === "PERIODE_ANNEE" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Du mois</Label>
            <Select
              value={String(periode.mois_debut)}
              onValueChange={(v) =>
                emit(
                  conditionType,
                  stringifyConditionConfig({ ...periode, mois_debut: parseInt(v, 10) }),
                  categories
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOIS_LABELS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Au mois</Label>
            <Select
              value={String(periode.mois_fin)}
              onValueChange={(v) =>
                emit(
                  conditionType,
                  stringifyConditionConfig({ ...periode, mois_fin: parseInt(v, 10) }),
                  categories
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOIS_LABELS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Catégories de contacts</Label>
        <CategoryTogglePills
          categories={[...CONTACT_CATEGORIES]}
          selected={categories}
          onToggle={toggleCategory}
        />
      </div>

      {conditionType !== "EVENEMENT_SOUSCRIPTION" && (
        <p className="text-xs text-muted-foreground">
          Le mail est proposé quand la règle devient vraie (recalcul des étiquettes / fiche contact).
          Une fois par contact tant que l&apos;envoi n&apos;a pas été fait.
        </p>
      )}
    </div>
  );
}
