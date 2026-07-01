import { describe, expect, it } from "vitest";
import {
  computeAgeAtDate,
  isBirthdayToday,
  listContactsWithBirthdayToday,
} from "./contact-birthday";
import type { Contact } from "@/lib/api/tauri-contacts";
import { dateInputToUnix } from "@/lib/dates/calendar-date";

function contact(partial: Partial<Contact> & Pick<Contact, "id" | "nom" | "prenom">): Contact {
  return {
    categorie: "CLIENT",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("contact-birthday", () => {
  it("détecte l'anniversaire du jour", () => {
    const ref = new Date(2026, 5, 5); // 5 juin 2026 local
    const unix = dateInputToUnix("1990-06-05")!;
    expect(isBirthdayToday(unix, ref)).toBe(true);
    expect(isBirthdayToday(dateInputToUnix("1990-06-06")!, ref)).toBe(false);
  });

  it("calcule l'âge le jour de l'anniversaire", () => {
    const ref = new Date(2026, 5, 5);
    const unix = dateInputToUnix("1990-06-05")!;
    expect(computeAgeAtDate(unix, ref)).toBe(36);
  });

  it("inclut les naissances avant 1970 (timestamp Unix négatif)", () => {
    const ref = new Date(2026, 6, 1); // 1er juillet 2026 local
    const unix = dateInputToUnix("1963-07-01")!;
    expect(unix).toBeLessThan(0);
    expect(isBirthdayToday(unix, ref)).toBe(true);
    const list = listContactsWithBirthdayToday(
      [contact({ id: 9, prenom: "Bruno", nom: "DUPONT", date_naissance: unix })],
      ref
    );
    expect(list).toHaveLength(1);
  });

  it("liste les contacts concernés", () => {
    const ref = new Date(2026, 2, 10);
    const unix = dateInputToUnix("1985-03-10")!;
    const list = listContactsWithBirthdayToday(
      [
        contact({ id: 1, prenom: "A", nom: "Z", date_naissance: unix }),
        contact({ id: 2, prenom: "B", nom: "A", date_naissance: unix }),
        contact({ id: 3, prenom: "C", nom: "M" }),
        contact({
          id: 4,
          prenom: "D",
          nom: "X",
          date_naissance: unix,
          statut_suivi: "ARCHIVE",
        }),
      ],
      ref
    );
    expect(list.map((c) => c.id)).toEqual([2, 1]);
    expect(list[0].age).toBe(41);
  });
});
