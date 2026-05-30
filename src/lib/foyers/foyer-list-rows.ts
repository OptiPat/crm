import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";

export type FoyerGroup = {
  foyer: Foyer | null;
  contacts: Contact[];
};

export type FoyerFlatRow =
  | {
      kind: "header";
      key: string;
      foyer: Foyer | null;
      memberCount: number;
      totalPatrimoine: number;
    }
  | { kind: "contact"; key: string; contact: Contact; inFoyer: boolean };

export const FOYER_HEADER_ROW_PX = 64;
export const FOYER_CONTACT_ROW_PX = 112;

export function buildFoyerFlatRows(
  groups: FoyerGroup[],
  patrimoines: Record<string, number>
): FoyerFlatRow[] {
  const rows: FoyerFlatRow[] = [];

  for (const group of groups) {
    const foyerPatrimoine = group.foyer
      ? patrimoines[`foyer_${group.foyer.id}`] || 0
      : 0;
    const contactsPatrimoine = group.contacts.reduce(
      (sum, c) => sum + (patrimoines[`contact_${c.id}`] || 0),
      0
    );
    const totalPatrimoine = foyerPatrimoine + contactsPatrimoine;
    const headerKey = group.foyer
      ? `foyer-${group.foyer.id}`
      : `solo-${group.contacts[0]?.id ?? "x"}`;

    rows.push({
      kind: "header",
      key: headerKey,
      foyer: group.foyer,
      memberCount: group.contacts.length,
      totalPatrimoine,
    });

    for (const contact of group.contacts) {
      rows.push({
        kind: "contact",
        key: `contact-${contact.id}`,
        contact,
        inFoyer: !!group.foyer,
      });
    }
  }

  return rows;
}

export function getFoyerRowHeight(row: FoyerFlatRow): number {
  return row.kind === "header" ? FOYER_HEADER_ROW_PX : FOYER_CONTACT_ROW_PX;
}
