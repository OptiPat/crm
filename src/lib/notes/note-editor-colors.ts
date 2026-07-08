export type NoteEditorColor = {
  label: string;
  value: string;
};

/** Couleurs de texte courantes (lisibles sur fond clair). */
export const NOTE_TEXT_COLORS: NoteEditorColor[] = [
  { label: "Noir", value: "#111827" },
  { label: "Rouge", value: "#dc2626" },
  { label: "Orange", value: "#d97706" },
  { label: "Vert", value: "#16a34a" },
  { label: "Bleu", value: "#2563eb" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Gris", value: "#6b7280" },
];

/** Couleurs de surlignage. */
export const NOTE_HIGHLIGHT_COLORS: NoteEditorColor[] = [
  { label: "Jaune", value: "#fef08a" },
  { label: "Vert clair", value: "#bbf7d0" },
  { label: "Bleu clair", value: "#bfdbfe" },
  { label: "Rose", value: "#fecdd3" },
  { label: "Orange clair", value: "#fed7aa" },
  { label: "Gris clair", value: "#e5e7eb" },
];

/** Couleur texte par défaut (réinitialisation). */
export const NOTE_TEXT_COLOR_DEFAULT = NOTE_TEXT_COLORS[0]!.value;

/** « Aucun surlignage » — blanc du fond éditeur. */
export const NOTE_HIGHLIGHT_CLEAR = "#ffffff";
