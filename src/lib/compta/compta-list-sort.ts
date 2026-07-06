export type ComptaSortDir = "asc" | "desc";

export type ComptaDepenseSortKey = "date" | "tiers" | "ttc";
export type ComptaEncaissementSortKey = "date" | "client" | "total";
export type ComptaDeplacementSortKey = "date" | "destination" | "indemnite";

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "fr", { sensitivity: "base" });
}

function sortBy<T>(
  items: T[],
  getValue: (item: T) => string | number,
  dir: ComptaSortDir
): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => compareValues(getValue(a), getValue(b)) * factor);
}

export function sortComptaDepenses<T extends { date: string; tiers: string; ttc: number }>(
  items: T[],
  key: ComptaDepenseSortKey,
  dir: ComptaSortDir
): T[] {
  switch (key) {
    case "date":
      return sortBy(items, (d) => d.date, dir);
    case "tiers":
      return sortBy(items, (d) => d.tiers, dir);
    case "ttc":
      return sortBy(items, (d) => d.ttc, dir);
  }
}

export function sortComptaEncaissements<
  T extends { date: string; client: string; total: number },
>(items: T[], key: ComptaEncaissementSortKey, dir: ComptaSortDir): T[] {
  switch (key) {
    case "date":
      return sortBy(items, (e) => e.date, dir);
    case "client":
      return sortBy(items, (e) => e.client, dir);
    case "total":
      return sortBy(items, (e) => e.total, dir);
  }
}

export function sortComptaDeplacements<
  T extends { date: string; destination: string; indemnite: number },
>(items: T[], key: ComptaDeplacementSortKey, dir: ComptaSortDir): T[] {
  switch (key) {
    case "date":
      return sortBy(items, (d) => d.date, dir);
    case "destination":
      return sortBy(items, (d) => d.destination, dir);
    case "indemnite":
      return sortBy(items, (d) => d.indemnite, dir);
  }
}

export function parseComptaSortValue(value: string): { key: string; dir: ComptaSortDir } {
  const [key, dir] = value.split("-");
  return { key, dir: dir === "asc" ? "asc" : "desc" };
}
