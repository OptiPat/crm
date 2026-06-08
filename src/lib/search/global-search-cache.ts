import type { Contact } from "@/lib/api/tauri-contacts";
import type { Document } from "@/lib/api/tauri-documents";
import type { Foyer } from "@/lib/api/tauri-foyers";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import type { Partenaire } from "@/lib/api/tauri-partenaires";

export type GlobalSearchData = {
  contacts: Contact[];
  investissements: InvestissementWithDetails[];
  foyers: Foyer[];
  partenaires: Partenaire[];
  documents: Document[];
};

let cache: GlobalSearchData | null = null;

export function getGlobalSearchCache(): GlobalSearchData | null {
  return cache;
}

export function setGlobalSearchCache(next: GlobalSearchData): void {
  cache = next;
}

export function invalidateGlobalSearchCache(): void {
  cache = null;
}
