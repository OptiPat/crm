import type { LucideIcon } from "lucide-react";
import { CircleUser, Network } from "lucide-react";
import type { StatistiquesSectionId } from "./statistiques-page-preferences";
import { statistiquesPanelCountForSection } from "./statistiques-page-preferences";

export type StatistiquesSectionConfig = {
  id: StatistiquesSectionId;
  title: string;
  intro?: string;
  icon: LucideIcon;
};

export const STATISTIQUES_SECTIONS: StatistiquesSectionConfig[] = [
  {
    id: "filleuls_organisation",
    title: "Organisation filleuls",
    intro: "Structure, acquisition et santé de votre organisation.",
    icon: Network,
  },
  {
    id: "clients",
    title: "Clients",
    intro: "Portefeuille client « avec moi » — acquisition, encours, produits et rétention.",
    icon: CircleUser,
  },
];

export function statistiquesSectionPanelCount(sectionId: StatistiquesSectionId): number {
  return statistiquesPanelCountForSection(sectionId);
}

export function statistiquesSectionAnchorId(sectionId: StatistiquesSectionId): string {
  return `statistiques-section-${sectionId}`;
}
