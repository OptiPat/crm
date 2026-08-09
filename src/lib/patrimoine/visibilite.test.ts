import { describe, expect, it } from "vitest";
import {
  filterInvestissementsVisibleToViewer,
  isContactMinorAt,
  isInvestissementVisibleToViewer,
  type FoyerMemberRef,
  type PatrimoineViewer,
} from "./visibilite";

const NOW = 1_700_000_000;

function adultBirthday(yearsAgo: number): number {
  const d = new Date(NOW * 1000);
  d.setFullYear(d.getFullYear() - yearsAgo);
  return Math.floor(d.getTime() / 1000);
}

const jean: PatrimoineViewer = {
  id: 1,
  foyer_id: 10,
  role_foyer: "DECLARANT_1",
};

const marie: PatrimoineViewer = {
  id: 2,
  foyer_id: 10,
  role_foyer: "DECLARANT_2",
};

const lucEnfant: FoyerMemberRef = {
  id: 3,
  role_foyer: "ENFANT",
  date_naissance: adultBirthday(12),
};

const lucMajeur: FoyerMemberRef = {
  id: 4,
  role_foyer: "ENFANT",
  date_naissance: adultBirthday(20),
};

const membersCoupleEnfantMineur: FoyerMemberRef[] = [
  { id: 1, role_foyer: "DECLARANT_1" },
  { id: 2, role_foyer: "DECLARANT_2" },
  lucEnfant,
];

const membersCoupleEnfantMajeur: FoyerMemberRef[] = [
  { id: 1, role_foyer: "DECLARANT_1" },
  { id: 2, role_foyer: "DECLARANT_2" },
  lucMajeur,
];

describe("isContactMinorAt", () => {
  it("détecte un mineur", () => {
    expect(isContactMinorAt(adultBirthday(10), NOW)).toBe(true);
    expect(isContactMinorAt(adultBirthday(18), NOW)).toBe(false);
  });
});

describe("isInvestissementVisibleToViewer — R2", () => {
  it("personne seule : uniquement son patrimoine personnel", () => {
    const solo: PatrimoineViewer = { id: 5, foyer_id: null };
    const perso = { contact_id: 5, foyer_id: null };
    const autre = { contact_id: 99, foyer_id: null };
    expect(
      isInvestissementVisibleToViewer(perso, solo, [], { nowUnix: NOW })
    ).toBe(true);
    expect(
      isInvestissementVisibleToViewer(autre, solo, [], { nowUnix: NOW })
    ).toBe(false);
  });

  it("couple : biens communs visibles des deux", () => {
    const commun = { contact_id: null, foyer_id: 10 };
    expect(
      isInvestissementVisibleToViewer(commun, jean, membersCoupleEnfantMineur, {
        nowUnix: NOW,
      })
    ).toBe(true);
    expect(
      isInvestissementVisibleToViewer(commun, marie, membersCoupleEnfantMineur, {
        nowUnix: NOW,
      })
    ).toBe(true);
  });

  it("couple : patrimoine personnel du conjoint invisible", () => {
    const persoMarie = { contact_id: 2, foyer_id: 10 };
    expect(
      isInvestissementVisibleToViewer(persoMarie, jean, membersCoupleEnfantMineur, {
        nowUnix: NOW,
      })
    ).toBe(false);
    expect(
      isInvestissementVisibleToViewer(persoMarie, marie, membersCoupleEnfantMineur, {
        nowUnix: NOW,
      })
    ).toBe(true);
  });

  it("enfant mineur : patrimoine visible des deux parents", () => {
    const persoEnfant = { contact_id: 3, foyer_id: 10 };
    expect(
      isInvestissementVisibleToViewer(
        persoEnfant,
        jean,
        membersCoupleEnfantMineur,
        { nowUnix: NOW }
      )
    ).toBe(true);
    expect(
      isInvestissementVisibleToViewer(
        persoEnfant,
        marie,
        membersCoupleEnfantMineur,
        { nowUnix: NOW }
      )
    ).toBe(true);
  });

  it("enfant mineur : patrimoine personnel sans foyer_id sur la ligne", () => {
    const persoEnfant = { contact_id: 3, foyer_id: null };
    expect(
      isInvestissementVisibleToViewer(
        persoEnfant,
        jean,
        membersCoupleEnfantMineur,
        { nowUnix: NOW }
      )
    ).toBe(true);
  });

  it("enfant sans date de naissance : invisible des parents (doute sur la majorité)", () => {
    const members = [
      { id: 1, role_foyer: "DECLARANT_1" as const },
      { id: 2, role_foyer: "DECLARANT_2" as const },
      { id: 3, role_foyer: "ENFANT" as const },
    ];
    const persoEnfant = { contact_id: 3, foyer_id: null };
    expect(
      isInvestissementVisibleToViewer(persoEnfant, jean, members, {
        nowUnix: NOW,
      })
    ).toBe(false);
  });

  it("enfant majeur : patrimoine non visible des parents", () => {
    const persoEnfant = { contact_id: 4, foyer_id: 10 };
    expect(
      isInvestissementVisibleToViewer(
        persoEnfant,
        jean,
        membersCoupleEnfantMajeur,
        { nowUnix: NOW }
      )
    ).toBe(false);
  });

  it("personne sans foyer : ignore le patrimoine de foyer", () => {
    const solo: PatrimoineViewer = { id: 5, foyer_id: null };
    const commun = { contact_id: null, foyer_id: 10 };
    expect(
      isInvestissementVisibleToViewer(commun, solo, [], { nowUnix: NOW })
    ).toBe(false);
  });

  it("investissement foyer sans contact_id : visible des membres du foyer", () => {
    const commun = { contact_id: null, foyer_id: 10 };
    expect(
      isInvestissementVisibleToViewer(commun, jean, membersCoupleEnfantMineur, {
        nowUnix: NOW,
      })
    ).toBe(true);
  });

  it("investissement rattaché au foyer avec contact_id tiers : invisible en cas de doute", () => {
    const douteux = { contact_id: 99, foyer_id: 10 };
    expect(
      isInvestissementVisibleToViewer(douteux, jean, membersCoupleEnfantMineur, {
        nowUnix: NOW,
      })
    ).toBe(false);
  });

  it("exclut les lignes clôturées par défaut", () => {
    const perso = { contact_id: 1, foyer_id: 10, statut: "CLOTURE" };
    expect(
      isInvestissementVisibleToViewer(perso, jean, membersCoupleEnfantMineur, {
        nowUnix: NOW,
      })
    ).toBe(false);
  });
});

describe("filterInvestissementsVisibleToViewer", () => {
  it("filtre une liste mixte", () => {
    const rows = [
      { id: 1, contact_id: 1, foyer_id: 10 },
      { id: 2, contact_id: 2, foyer_id: 10 },
      { id: 3, contact_id: null, foyer_id: 10 },
    ];
    const visible = filterInvestissementsVisibleToViewer(
      rows,
      jean,
      membersCoupleEnfantMineur,
      { nowUnix: NOW }
    );
    expect(visible.map((r) => r.id)).toEqual([1, 3]);
  });
});
