import type { Investissement } from "@/lib/api/tauri-investissements";

export type PartenaireProductOwnerKind = "contact" | "foyer" | "orphan";

export type PartenaireProductOwnerInfo = {
  kind: PartenaireProductOwnerKind;
  label: string;
  contactId?: number;
  foyerId?: number;
};

export function getPartenaireProductOwner(
  inv: Pick<Investissement, "contact_id" | "foyer_id">,
  contactLabelById: Record<number, string>,
  foyerLabelById: Record<number, string>
): PartenaireProductOwnerInfo {
  if (inv.contact_id != null && inv.contact_id > 0) {
    return {
      kind: "contact",
      label: contactLabelById[inv.contact_id] ?? `Contact #${inv.contact_id}`,
      contactId: inv.contact_id,
    };
  }
  if (inv.foyer_id != null && inv.foyer_id > 0) {
    return {
      kind: "foyer",
      label: foyerLabelById[inv.foyer_id] ?? `Foyer #${inv.foyer_id}`,
      foyerId: inv.foyer_id,
    };
  }
  return { kind: "orphan", label: "Sans détenteur rattaché" };
}

export function countOrphanPartenaireProducts(investissements: Investissement[]): number {
  return investissements.filter((inv) => getPartenaireProductOwner(inv, {}, {}).kind === "orphan")
    .length;
}

export function formatPartenaireProductOwnerCsv(
  inv: Pick<Investissement, "contact_id" | "foyer_id">,
  contactLabelById: Record<number, string>,
  foyerLabelById: Record<number, string>
): string {
  const owner = getPartenaireProductOwner(inv, contactLabelById, foyerLabelById);
  if (owner.kind === "foyer") {
    return `Foyer · ${owner.label}`;
  }
  return owner.label;
}
