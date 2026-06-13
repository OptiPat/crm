/** `YYYY-MM-DD` → `JJ/MM/AAAA` pour affichage document. */
export function formatDateInputFr(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
