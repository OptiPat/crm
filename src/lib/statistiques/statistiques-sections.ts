import type { LucideIcon } from "lucide-react";
import { CircleUser, Network, Share2, Users } from "lucide-react";
import type { StatistiquesSectionId } from "./statistiques-page-preferences";

export type StatistiquesSectionConfig = {
  id: StatistiquesSectionId;
  title: string;
  subtitle: string;
  intro?: string;
  icon: LucideIcon;
  panelCount: number;
};

export const STATISTIQUES_SECTIONS: StatistiquesSectionConfig[] = [
  {
    id: "contacts",
    title: "Source / lead",
    subtitle: "Origine des contacts et taux de conversion par source",
    intro: "D'où viennent vos contacts — canal d'acquisition renseigné sur la fiche.",
    icon: Users,
    panelCount: 4,
  },
  {
    id: "prescripteurs",
    title: "Prescripteurs",
    subtitle: "Recommandations et conversion par prescripteur",
    intro: "Qui vous envoie des clients et des filleuls — prescripteur renseigné sur la fiche.",
    icon: Share2,
    panelCount: 4,
  },
  {
    id: "filleuls_organisation",
    title: "Organisation filleuls",
    subtitle: "Géographie, âge, managers, parraineurs, attrition filleuls",
    intro: "Structure et santé de votre réseau filleul — tous parrains confondus sauf mention.",
    icon: Network,
    panelCount: 7,
  },
  {
    id: "clients",
    title: "Clients",
    subtitle: "Patrimoine, couverture produits, démographie, attrition clients",
    intro: "Portefeuille client « avec moi » — encours, produits, profils et rétention.",
    icon: CircleUser,
    panelCount: 13,
  },
];

export function statistiquesSectionAnchorId(sectionId: StatistiquesSectionId): string {
  return `statistiques-section-${sectionId}`;
}
