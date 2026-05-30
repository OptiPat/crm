import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { contactMatchesSearch, textMatchesSearch } from "@/lib/search-utils";

export function formatFilleulCategorie(categorie: string): string {
  switch (categorie) {
    case "FILLEUL":
      return "Filleul";
    case "PROSPECT_FILLEUL":
      return "Prospect filleul";
    case "SUSPECT_FILLEUL":
      return "Suspect filleul";
    case "FILLEUL_DESINSCRIT":
      return "Filleul désinscrit";
    default:
      return categorie.replace(/_/g, " ").toLowerCase();
  }
}

export function getNiveauStyles(niveau: number): {
  bg: string;
  border: string;
  text: string;
} {
  switch (niveau) {
    case 0:
      return { bg: "bg-violet-50/80", border: "border-violet-200/80", text: "text-violet-950" };
    case 1:
      return { bg: "bg-sky-50/80", border: "border-sky-200/70", text: "text-sky-900" };
    case 2:
      return { bg: "bg-slate-50/80", border: "border-slate-200/70", text: "text-slate-800" };
    default:
      return { bg: "bg-muted/30", border: "border-border/70", text: "text-foreground/80" };
  }
}

export interface InvestWithCommun extends Investissement {
  isCommun: boolean;
  ownerName?: string;
}

export interface PrescripteurNode {
  contact: Contact;
  patrimoine: number;
  investissements: InvestWithCommun[];
  clientsRecommandes: PrescripteurNode[];
  niveau: number;
}

export interface PrescripteurStats {
  contact: Contact;
  patrimoinePersonnel: number;
  nombreClientsDirects: number;
  patrimoineApporteTotal: number;
  nombreClientsTotal: number;
}

export interface FoyerInfo {
  id: number;
  nom: string;
  membres: Contact[];
  displayName: string;
}

export function buildFoyersInfo(contacts: Contact[]): Record<number, FoyerInfo> {
  const foyers: Record<number, FoyerInfo> = {};

  contacts.forEach((contact) => {
    if (contact.foyer_id) {
      if (!foyers[contact.foyer_id]) {
        foyers[contact.foyer_id] = {
          id: contact.foyer_id,
          nom: contact.nom,
          membres: [],
          displayName: "",
        };
      }
      foyers[contact.foyer_id].membres.push(contact);
    }
  });

  Object.values(foyers).forEach((foyer) => {
    const prenoms = foyer.membres.map((m) => m.prenom).join(" + ");
    foyer.displayName = `Foyer ${foyer.nom} (${prenoms})`;
  });

  return foyers;
}

export function getContactDisplayName(
  contact: Contact,
  foyersInfo: Record<number, FoyerInfo>
): string {
  if (contact.foyer_id && foyersInfo[contact.foyer_id]) {
    return foyersInfo[contact.foyer_id].displayName;
  }
  return `${contact.prenom} ${contact.nom}`;
}

export function matchesContactOrFoyer(
  contact: Contact,
  query: string,
  foyersInfo: Record<number, FoyerInfo>
): boolean {
  if (contactMatchesSearch(query, contact)) return true;
  if (contact.foyer_id && foyersInfo[contact.foyer_id]) {
    const foyer = foyersInfo[contact.foyer_id];
    if (textMatchesSearch(query, foyer.nom)) return true;
    if (foyer.membres.some((m) => textMatchesSearch(query, m.prenom))) return true;
  }
  return false;
}

export function calculateTreePatrimoine(node: PrescripteurNode): number {
  let total = node.patrimoine;
  for (const child of node.clientsRecommandes) {
    total += calculateTreePatrimoine(child);
  }
  return total;
}

export function countTreeClients(node: PrescripteurNode): number {
  let count = node.clientsRecommandes.length;
  for (const child of node.clientsRecommandes) {
    count += countTreeClients(child);
  }
  return count;
}

type TreeContext = {
  contacts: Contact[];
  investissementsByContact: Record<number, Investissement[]>;
  investissementsByFoyer: Record<number, Investissement[]>;
  foyersInfo: Record<number, FoyerInfo>;
};

function getFoyerMembersIds(contacts: Contact[], foyerId: number | undefined): Set<number> {
  if (!foyerId) return new Set();
  return new Set(contacts.filter((c) => c.foyer_id === foyerId).map((c) => c.id));
}

function getContactPatrimoineWithInvests(
  contact: Contact,
  foyersProcessed: Set<number>,
  ctx: TreeContext
): { total: number; investissements: InvestWithCommun[]; foyerAdded: boolean } {
  const { investissementsByContact, investissementsByFoyer, foyersInfo } = ctx;
  let total = 0;
  let allInvests: InvestWithCommun[] = [];
  let foyerAdded = false;

  if (contact.foyer_id && !foyersProcessed.has(contact.foyer_id) && foyersInfo[contact.foyer_id]) {
    const foyer = foyersInfo[contact.foyer_id];

    foyer.membres.forEach((membre) => {
      const membreInvests = (investissementsByContact[membre.id] || []).filter(
        (inv) => inv.origine === "MON_CONSEIL"
      );
      const membreTotal = membreInvests.reduce(
        (sum, inv) => sum + (inv.montant_initial || 0),
        0
      );
      total += membreTotal;
      allInvests = [
        ...allInvests,
        ...membreInvests.map((inv) => ({
          ...inv,
          isCommun: false,
          ownerName: membre.prenom,
        })),
      ];
    });

    const foyerInvests = investissementsByFoyer[contact.foyer_id] || [];
    const foyerOnlyInvests = foyerInvests.filter(
      (inv) => !inv.contact_id && inv.origine === "MON_CONSEIL"
    );
    const foyerTotal = foyerOnlyInvests.reduce(
      (sum, inv) => sum + (inv.montant_initial || 0),
      0
    );
    total += foyerTotal;
    allInvests = [
      ...allInvests,
      ...foyerOnlyInvests.map((inv) => ({ ...inv, isCommun: true })),
    ];
    foyerAdded = true;
  } else {
    const contactInvests = (investissementsByContact[contact.id] || []).filter(
      (inv) => inv.origine === "MON_CONSEIL"
    );
    total = contactInvests.reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
    allInvests = contactInvests.map((inv) => ({ ...inv, isCommun: false }));
  }

  return { total, investissements: allInvests, foyerAdded };
}

export function buildPrescripteurTree(
  prescripteur: Contact,
  ctx: TreeContext,
  niveau: number = 0,
  visitedIds: Set<number> = new Set(),
  foyersProcessed: Set<number> = new Set(),
  foyerMembersInTree: Set<number> = new Set()
): PrescripteurNode {
  if (visitedIds.has(prescripteur.id)) {
    return {
      contact: prescripteur,
      patrimoine: 0,
      investissements: [],
      clientsRecommandes: [],
      niveau,
    };
  }

  const newVisitedIds = new Set(visitedIds);
  newVisitedIds.add(prescripteur.id);

  const newFoyerMembersInTree = new Set(foyerMembersInTree);
  if (prescripteur.foyer_id) {
    const foyerMembers = getFoyerMembersIds(ctx.contacts, prescripteur.foyer_id);
    foyerMembers.forEach((id) => newFoyerMembersInTree.add(id));
  }

  const { total, investissements, foyerAdded } = getContactPatrimoineWithInvests(
    prescripteur,
    foyersProcessed,
    ctx
  );

  if (foyerAdded && prescripteur.foyer_id) {
    foyersProcessed.add(prescripteur.foyer_id);
  }

  const prescripteurIds =
    prescripteur.foyer_id && ctx.foyersInfo[prescripteur.foyer_id]
      ? ctx.foyersInfo[prescripteur.foyer_id].membres.map((m) => m.id)
      : [prescripteur.id];

  const clientsRecommandesAll = ctx.contacts.filter(
    (c) =>
      prescripteurIds.includes(c.prescripteur_id!) &&
      !newFoyerMembersInTree.has(c.id)
  );

  const foyersClientsVus = new Set<number>();
  const clientsRecommandes = clientsRecommandesAll.filter((c) => {
    if (c.foyer_id) {
      if (foyersClientsVus.has(c.foyer_id)) return false;
      foyersClientsVus.add(c.foyer_id);
    }
    return true;
  });

  return {
    contact: prescripteur,
    patrimoine: total,
    investissements,
    clientsRecommandes: clientsRecommandes.map((client) =>
      buildPrescripteurTree(
        client,
        ctx,
        niveau + 1,
        newVisitedIds,
        foyersProcessed,
        newFoyerMembersInTree
      )
    ),
    niveau,
  };
}

export function computePrescripteursRacines(
  contacts: Contact[],
  investissementsByContact: Record<number, Investissement[]>,
  investissementsByFoyer: Record<number, Investissement[]>
): PrescripteurStats[] {
  const foyersInfo = buildFoyersInfo(contacts);
  const ctx: TreeContext = { contacts, investissementsByContact, investissementsByFoyer, foyersInfo };

  const prescripteurIds = new Set(
    contacts.filter((c) => c.prescripteur_id).map((c) => c.prescripteur_id!)
  );

  const foyerHasPrescripteur = (foyerId: number): boolean => {
    if (!foyerId || !foyersInfo[foyerId]) return false;
    return foyersInfo[foyerId].membres.some((m) => m.prescripteur_id);
  };

  const racinesAll = contacts.filter((c) => {
    const hasPrescripteur = c.prescripteur_id || (c.foyer_id && foyerHasPrescripteur(c.foyer_id));
    if (prescripteurIds.has(c.id) && !hasPrescripteur) return true;
    if (c.categorie === "PRESCRIPTEUR" && !hasPrescripteur) return true;
    return false;
  });

  const foyersVus = new Set<number>();
  const racines = racinesAll.filter((c) => {
    if (c.foyer_id) {
      if (foyersVus.has(c.foyer_id)) return false;
      foyersVus.add(c.foyer_id);
    }
    return true;
  });

  return racines
    .map((prescripteur) => {
      const foyersProcessedForTree = new Set<number>();
      const foyerMembersInTree = new Set<number>();
      const tree = buildPrescripteurTree(
        prescripteur,
        ctx,
        0,
        new Set(),
        foyersProcessedForTree,
        foyerMembersInTree
      );

      const { total: patrimoinePersonnel } = getContactPatrimoineWithInvests(
        prescripteur,
        new Set(),
        ctx
      );

      const clientsDirects = contacts.filter((c) => c.prescripteur_id === prescripteur.id);
      const foyersVusDirect = new Set<number>();
      let nombreClientsDirectsSansFoyerDoublons = 0;
      for (const client of clientsDirects) {
        if (client.foyer_id) {
          if (!foyersVusDirect.has(client.foyer_id)) {
            foyersVusDirect.add(client.foyer_id);
            nombreClientsDirectsSansFoyerDoublons++;
          }
        } else {
          nombreClientsDirectsSansFoyerDoublons++;
        }
      }

      return {
        contact: prescripteur,
        patrimoinePersonnel,
        nombreClientsDirects: nombreClientsDirectsSansFoyerDoublons,
        patrimoineApporteTotal: calculateTreePatrimoine(tree) - patrimoinePersonnel,
        nombreClientsTotal: countTreeClients(tree),
      };
    })
    .sort((a, b) => b.patrimoineApporteTotal - a.patrimoineApporteTotal);
}
