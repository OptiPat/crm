export const ROLES_FAMILLE = [
  { value: "PERE", label: "👨 Père", icon: "👨", priority: 1 },
  { value: "MERE", label: "👩 Mère", icon: "👩", priority: 2 },
  { value: "CONJOINT", label: "💑 Conjoint(e)", icon: "💑", priority: 3 },
  { value: "FILS", label: "👦 Fils", icon: "👦", priority: 4 },
  { value: "FILLE", label: "👧 Fille", icon: "👧", priority: 5 },
  { value: "FRERE", label: "👨 Frère", icon: "👨", priority: 6 },
  { value: "SOEUR", label: "👩 Sœur", icon: "👩", priority: 7 },
  { value: "GRAND_PERE", label: "👴 Grand-père", icon: "👴", priority: 0 },
  { value: "GRAND_MERE", label: "👵 Grand-mère", icon: "👵", priority: 0 },
  { value: "PETIT_FILS", label: "👦 Petit-fils", icon: "👦", priority: 8 },
  { value: "PETITE_FILLE", label: "👧 Petite-fille", icon: "👧", priority: 8 },
  { value: "AUTRE", label: "👤 Autre", icon: "👤", priority: 10 },
] as const;

export function getRoleFamilleIcon(role?: string): string {
  if (!role) return "👤";
  const found = ROLES_FAMILLE.find((r) => r.value === role);
  return found ? found.icon : "👤";
}

export function getRolePriority(role?: string): number {
  if (!role) return 99;
  const found = ROLES_FAMILLE.find((r) => r.value === role);
  return found ? found.priority : 99;
}
