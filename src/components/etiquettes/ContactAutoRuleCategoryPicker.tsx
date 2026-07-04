import { CategoryTogglePills } from "@/components/etiquettes/etiquette-form-ui";
import { CONTACT_AUTO_RULE_CATEGORIES } from "@/lib/contacts/contact-auto-rule-categories";
import {
  FILLEUL_RANK_CATEGORIES,
  FILLEUL_RANK_CATEGORY_OPTIONS,
  isFilleulCategoryActive,
  stripFilleulRankCategories,
} from "@/lib/contacts/contact-filleul-rank-match";
import { Label } from "@/components/ui/label";

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
};

function ensureNonEmpty(categories: string[]): string[] {
  return categories.length > 0 ? categories : ["CLIENT"];
}

export function ContactAutoRuleCategoryPicker({ selected, onChange }: Props) {
  const showFilleulRanks = isFilleulCategoryActive(selected);

  const toggleCategory = (value: string) => {
    if (selected.includes(value)) {
      if (value === "FILLEUL") {
        onChange(ensureNonEmpty(stripFilleulRankCategories(selected.filter((c) => c !== value))));
        return;
      }
      onChange(ensureNonEmpty(selected.filter((c) => c !== value)));
      return;
    }
    onChange(ensureNonEmpty([...selected, value]));
  };

  const toggleFilleulRank = (value: string) => {
    const rankValues = FILLEUL_RANK_CATEGORIES as readonly string[];
    const hasRank = selected.includes(value);
    let next = hasRank ? selected.filter((c) => c !== value) : [...selected, value];

    if (!hasRank && !next.includes("FILLEUL")) {
      next = ["FILLEUL", ...next];
    }

    if (hasRank && !next.some((c) => rankValues.includes(c))) {
      // Garde FILLEUL : tous les filleuls si aucun sous-filtre rang.
    }

    onChange(ensureNonEmpty(next));
  };

  return (
    <div className="space-y-3">
      <CategoryTogglePills
        categories={[...CONTACT_AUTO_RULE_CATEGORIES]}
        selected={selected}
        onToggle={toggleCategory}
      />
      {showFilleulRanks && (
        <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-2.5 space-y-2">
          <Label className="text-xs text-muted-foreground font-normal">
            Filleul — préciser (vide = tous les filleuls inscrits)
          </Label>
          <CategoryTogglePills
            categories={[...FILLEUL_RANK_CATEGORY_OPTIONS]}
            selected={selected}
            onToggle={toggleFilleulRank}
          />
          <p className="text-[11px] text-muted-foreground leading-snug">
            <strong>Premier niveau</strong> : filleuls directs (niveau 1 sous vous, comme dans
            Organisation). <strong>Manager</strong> inclut Senior, Major, Expert et les
            qualifications Planète, Étoile, Constellation, Galaxie.
          </p>
        </div>
      )}
    </div>
  );
}
