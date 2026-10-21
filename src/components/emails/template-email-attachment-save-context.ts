import { createContext } from "react";

export interface TemplateEmailAttachmentFormContext {
  /**
   * Enregistre le modèle sans fermer l'éditeur, pour pouvoir joindre un fichier à un modèle
   * (ou à une variante tu / relance / Pipe) pas encore enregistré. Retourne true si
   * l'enregistrement a réussi.
   */
  saveBeforeAttach: () => Promise<boolean>;
  /** Ajout / retrait de pièce jointe : modification à enregistrer (sinon perdue à la fermeture). */
  markDirty: () => void;
}

export const TemplateEmailAttachmentSaveContext =
  createContext<TemplateEmailAttachmentFormContext | null>(null);
