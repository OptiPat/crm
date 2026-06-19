import {
  Banknote,
  FileText,
  Landmark,
  Repeat,
  TrendingUp,
  User,
  type LucideIcon,
} from "lucide-react";

export const INVESTISSEMENT_FORM_SECTIONS = {
  identification: "investissement-section-identification",
  montants: "investissement-section-montants",
  financement: "investissement-section-financement",
  versements: "investissement-section-versements",
  suivi: "investissement-section-suivi",
  notes: "investissement-section-notes",
} as const;

export type InvestissementFormSectionKey = keyof typeof INVESTISSEMENT_FORM_SECTIONS;

export type InvestissementFormSectionId =
  (typeof INVESTISSEMENT_FORM_SECTIONS)[InvestissementFormSectionKey];

export const INVESTISSEMENT_FORM_SECTION_ICON_CLASS =
  "h-4 w-4 shrink-0 text-muted-foreground";

export const INVESTISSEMENT_FORM_SECTION_META: Record<
  InvestissementFormSectionKey,
  { label: string; navLabel: string; icon: LucideIcon }
> = {
  identification: { label: "Identification", navLabel: "Identité", icon: User },
  montants: { label: "Montants & dates", navLabel: "Montants", icon: Banknote },
  financement: { label: "Financement", navLabel: "Financement", icon: Landmark },
  versements: {
    label: "Versements programmés",
    navLabel: "Versements",
    icon: Repeat,
  },
  suivi: { label: "Suivi & encours", navLabel: "Suivi", icon: TrendingUp },
  notes: { label: "Notes", navLabel: "Notes", icon: FileText },
};

export const INVESTISSEMENT_FORM_SECTION_ORDER: InvestissementFormSectionKey[] = [
  "identification",
  "montants",
  "financement",
  "versements",
  "suivi",
  "notes",
];

export interface InvestissementFormSectionVisibility {
  financement: boolean;
  versements: boolean;
  suivi: boolean;
}

export function getVisibleInvestissementFormSections(
  visibility: InvestissementFormSectionVisibility
): InvestissementFormSectionKey[] {
  return INVESTISSEMENT_FORM_SECTION_ORDER.filter((key) => {
    if (key === "financement") return visibility.financement;
    if (key === "versements") return visibility.versements;
    if (key === "suivi") return visibility.suivi;
    return true;
  });
}
