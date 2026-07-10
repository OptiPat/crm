import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";
import type { Investissement } from "@/lib/api/tauri-investissements";

export interface InvestWithCommun extends Investissement {
  isCommun?: boolean;
}

export interface MemberWithInvestments {
  contact: Contact;
  investissements: InvestWithCommun[];
  patrimoine: number;
  patrimoinePerso: number;
  patrimoineCommun: number;
  avecMoiPerso: number;
  avecMoiCommun: number;
  avecMoiTotal: number;
  isSpouse: boolean;
  spouseOf?: string;
  /** Enfant au foyer d'un membre, affiché sans être rattaché via famille_id. */
  isFoyerChild?: boolean;
  foyerChildOf?: string;
}

export interface FamilleGroup {
  /** Identifiant stable pour la sélection UI (`auto:MARTIN` ou `manual:12`). */
  key: string;
  nom: string;
  /** Présent pour les familles créées manuellement. */
  familleId?: number;
  isManual: boolean;
  membres: MemberWithInvestments[];
  foyers: Foyer[];
  patrimoineTotal: number;
  patrimoineAvecMoi: number;
}
