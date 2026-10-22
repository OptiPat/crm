function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

type ContactNames = {
  contact_prenom?: string | null;
  contact_nom?: string | null;
  secondary_contact_prenom?: string | null;
  secondary_contact_nom?: string | null;
};

/** Chaque mot saisi doit apparaître dans le prénom/nom du contact (ou du co-contact), sans accents ni casse. */
export function matchesContactSearch(row: ContactNames, query: string): boolean {
  const tokens = foldSearchText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = foldSearchText(
    [
      row.contact_prenom,
      row.contact_nom,
      row.secondary_contact_prenom,
      row.secondary_contact_nom,
    ]
      .filter(Boolean)
      .join(" ")
  );
  return tokens.every((token) => haystack.includes(token));
}

export function filterByContactSearch<T extends ContactNames>(rows: T[], query: string): T[] {
  if (!query.trim()) return rows;
  return rows.filter((row) => matchesContactSearch(row, query));
}
