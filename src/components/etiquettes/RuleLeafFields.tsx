import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RuleLeaf } from "@/lib/etiquettes/rule-ast";
import { MOIS_LABELS } from "@/lib/api/tauri-etiquettes";
import { INVESTISSEMENT_TYPE_GROUPS } from "@/lib/etiquettes/etiquette-investissement-types";
import { TypeProduitConditionFields } from "@/components/etiquettes/TypeProduitConditionFields";
import { buildTypeProduitConditionConfig } from "@/lib/etiquettes/type-produit-condition";
import { IrNetConditionFields, TmiTranchePicker } from "@/components/etiquettes/FiscalRuleFields";
import {
  type IrNetOperator,
} from "@/lib/etiquettes/fiscal-tmi";
import { CategoryTogglePills } from "@/components/etiquettes/etiquette-form-ui";
import {
  parseSelectOptions,
  type CustomFieldDef,
} from "@/lib/api/tauri-custom-fields";

/** Opérateurs disponibles pour une condition « champ personnalisé ». */
const CUSTOM_FIELD_OPERATORS = [
  { value: "rempli", label: "est rempli" },
  { value: "vide", label: "est vide" },
  { value: "egal", label: "est égal à" },
  { value: "different", label: "est différent de" },
  { value: "contient", label: "contient" },
] as const;

const OPERATORS_WITH_VALUE = ["egal", "different", "contient"];

const CATEGORIES = [
  { value: "CLIENT", label: "Client" },
  { value: "PROSPECT_CLIENT", label: "Prospect client" },
  { value: "PROSPECT_FILLEUL", label: "Prospect filleul" },
  { value: "SUSPECT_CLIENT", label: "Suspect client" },
  { value: "SUSPECT_FILLEUL", label: "Suspect filleul" },
  { value: "FILLEUL", label: "Filleul" },
] as const;

export function RuleLeafFields({
  leaf,
  onChange,
  etiquettesOptions = [],
  customFieldsOptions = [],
  highlightInvalid = false,
}: {
  leaf: RuleLeaf;
  onChange: (leaf: RuleLeaf) => void;
  etiquettesOptions?: { id: number; nom: string }[];
  customFieldsOptions?: CustomFieldDef[];
  highlightInvalid?: boolean;
}) {
  const setConfig = (patch: Record<string, unknown>) =>
    onChange({ ...leaf, config: { ...leaf.config, ...patch } });

  const toggleCategory = (cat: string) => {
    const next = leaf.categories.includes(cat)
      ? leaf.categories.filter((c) => c !== cat)
      : [...leaf.categories, cat];
    onChange({ ...leaf, categories: next });
  };


  const typeProduitTypes = (leaf.config.types as string[] | undefined) ?? [];
  const typeProduitNoms = (leaf.config.noms_produit as string[] | undefined) ?? [];

  const invTypes = (leaf.config.types_produit as string[] | undefined) ?? [];

  return (
    <div className="space-y-3">
      {leaf.type === "DELAI_SANS_CONTACT" && (
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <Label className="text-xs">Jours sans contact</Label>
            <Input
              type="number"
              className="w-24 mt-1"
              value={Number(leaf.config.jours ?? 365)}
              onChange={(e) => setConfig({ jours: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Checkbox
              id={`incl-${leaf.type}`}
              checked={leaf.config.inclure_sans_date !== false}
              onCheckedChange={(c) => setConfig({ inclure_sans_date: !!c })}
            />
            <Label htmlFor={`incl-${leaf.type}`} className="text-xs font-normal">
              Inclure sans date
            </Label>
          </div>
        </div>
      )}

      {leaf.type === "DATE_APPROCHE" && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Champ date</Label>
            <Select
              value={String(leaf.config.champ ?? "date_prochain_suivi")}
              onValueChange={(v) => setConfig({ champ: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date_prochain_suivi">Prochain suivi</SelectItem>
                <SelectItem value="date_prochain_suivi_filleul">Prochain suivi filleul</SelectItem>
                <SelectItem value="date_naissance">Date de naissance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Jours avant</Label>
            <Input
              type="number"
              className="w-full mt-1"
              value={Number(leaf.config.jours_avant ?? 30)}
              onChange={(e) => setConfig({ jours_avant: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
        </div>
      )}

      {leaf.type === "DATE_APPROCHE_INVESTISSEMENT" && (
        <div className="space-y-2">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Champ investissement</Label>
              <Select
                value={String(leaf.config.champ ?? "date_fin_demembrement")}
                onValueChange={(v) => setConfig({ champ: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_fin_demembrement">Fin démembrement</SelectItem>
                  <SelectItem value="date_fin_pret">Fin de prêt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Jours avant</Label>
              <Input
                type="number"
                className="mt-1"
                value={Number(leaf.config.jours_avant ?? 180)}
                onChange={(e) => setConfig({ jours_avant: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {INVESTISSEMENT_TYPE_GROUPS.flatMap((g) => g.types).map((t) => (
              <label key={t.value} className="flex items-center gap-1 text-xs">
                <Checkbox
                  checked={invTypes.includes(t.value)}
                  onCheckedChange={() => {
                    const next = invTypes.includes(t.value)
                      ? invTypes.filter((x) => x !== t.value)
                      : [...invTypes, t.value];
                    setConfig({ types_produit: next });
                  }}
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {leaf.type === "PERIODE_ANNEE" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Du mois</Label>
            <Select
              value={String(leaf.config.mois_debut ?? 4)}
              onValueChange={(v) => setConfig({ mois_debut: parseInt(v, 10) })}
            >
              <SelectTrigger className="mt-1">
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
          <div>
            <Label className="text-xs">Au mois</Label>
            <Select
              value={String(leaf.config.mois_fin ?? 5)}
              onValueChange={(v) => setConfig({ mois_fin: parseInt(v, 10) })}
            >
              <SelectTrigger className="mt-1">
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

      {leaf.type === "AGE_APPROCHE" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Âge cible</Label>
            <Input
              type="number"
              className="mt-1"
              value={Number(leaf.config.age ?? 69)}
              onChange={(e) => setConfig({ age: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div>
            <Label className="text-xs">Jours avant</Label>
            <Input
              type="number"
              className="mt-1"
              value={Number(leaf.config.jours_avant ?? 30)}
              onChange={(e) => setConfig({ jours_avant: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
        </div>
      )}

      {leaf.type === "TMI" && (
        <div className="space-y-2">
          <Label className="text-xs">Tranche(s) TMI</Label>
          <TmiTranchePicker
            selected={((leaf.config.tranches as number[] | undefined) ?? []).map(Number)}
            onToggle={(rate) => {
              const current = ((leaf.config.tranches as number[] | undefined) ?? []).map(Number);
              const next = current.includes(rate)
                ? current.filter((r) => r !== rate)
                : [...current, rate];
              setConfig({ tranches: next.sort((a, b) => a - b) });
            }}
          />
        </div>
      )}

      {leaf.type === "IR_NET" && (
        <IrNetConditionFields
          operator={(leaf.config.operator as IrNetOperator) ?? "gte"}
          onOperatorChange={(op) => setConfig({ operator: op })}
          montant={
            leaf.config.montant != null && leaf.config.montant !== ""
              ? Number(leaf.config.montant)
              : ""
          }
          onMontantChange={(v) => setConfig({ montant: v === "" ? "" : v })}
        />
      )}

      {leaf.type === "TYPE_PRODUIT" && (
        <TypeProduitConditionFields
          compact
          types={typeProduitTypes}
          nomsProduit={typeProduitNoms}
          highlightInvalid={highlightInvalid}
          onTypesChange={(next) =>
            setConfig(buildTypeProduitConditionConfig(next, typeProduitNoms))
          }
          onNomsProduitChange={(next) =>
            setConfig(buildTypeProduitConditionConfig(typeProduitTypes, next))
          }
        />
      )}

      {leaf.type === "A_ETIQUETTE" && (
        <Select
          value={String(leaf.config.etiquette_id ?? 0)}
          onValueChange={(v) =>
            onChange({
              ...leaf,
              config: { etiquette_id: parseInt(v, 10), present: true },
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Étiquette requise" />
          </SelectTrigger>
          <SelectContent>
            {etiquettesOptions.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>
                {e.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {leaf.type === "CHAMP_PERSO" &&
        (() => {
          const fieldKey = String(leaf.config.field_key ?? "");
          const operator = String(leaf.config.operator ?? "rempli");
          const def = customFieldsOptions.find((d) => d.field_key === fieldKey);
          const showValue = OPERATORS_WITH_VALUE.includes(operator);
          return (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Champ</Label>
                <Select value={fieldKey} onValueChange={(v) => setConfig({ field_key: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choisir un champ" />
                  </SelectTrigger>
                  <SelectContent>
                    {customFieldsOptions.map((d) => (
                      <SelectItem key={d.field_key} value={d.field_key}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Condition</Label>
                <Select value={operator} onValueChange={(v) => setConfig({ operator: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_FIELD_OPERATORS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showValue && (
                <div className="sm:col-span-2">
                  <Label className="text-xs">Valeur</Label>
                  {def?.field_type === "select" ? (
                    <Select
                      value={String(leaf.config.value ?? "")}
                      onValueChange={(v) => setConfig({ value: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Choisir…" />
                      </SelectTrigger>
                      <SelectContent>
                        {parseSelectOptions(def.options).map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="mt-1"
                      value={String(leaf.config.value ?? "")}
                      onChange={(e) => setConfig({ value: e.target.value })}
                      placeholder="Valeur à comparer"
                    />
                  )}
                </div>
              )}
            </div>
          );
        })()}

      {leaf.type !== "JAMAIS_CONTACT" && (
        <CategoryTogglePills
          categories={[...CATEGORIES]}
          selected={leaf.categories}
          onToggle={toggleCategory}
        />
      )}

      {leaf.type === "JAMAIS_CONTACT" && (
        <CategoryTogglePills
          categories={[...CATEGORIES]}
          selected={leaf.categories}
          onToggle={toggleCategory}
        />
      )}
    </div>
  );
}
