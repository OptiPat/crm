import type { LucideIcon } from "lucide-react";
import { CircleUser, Network, Share2, Users } from "lucide-react";
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
    id: "contacts",
    title: "Source / lead",
    intro: "D'où viennent vos contacts — canal d'acquisition renseigné sur la fiche.",
    icon: Users,
  },
  {
    id: "prescripteurs",
    title: "Prescripteurs",
    intro: "Qui vous envoie des clients et des filleuls — prescripteur renseigné sur la fiche.",
    icon: Share2,
  },
  {
    id: "filleuls_organisation",
    title: "Organisation filleuls",
    intro: "Structure et santé de votre organisation",
    icon: Network,
  },
  {
    id: "clients",
    title: "Clients",
    intro: "Portefeuille client « avec moi » — encours, produits, profils et rétention.",
    icon: CircleUser,
  },
];

export function statistiquesSectionPanelCount(sectionId: StatistiquesSectionId): number {
  return statistiquesPanelCountForSection(sectionId);
}

export function statistiquesSectionAnchorId(sectionId: StatistiquesSectionId): string {
  return `statistiques-section-${sectionId}`;
}
