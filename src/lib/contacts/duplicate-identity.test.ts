import { describe, expect, it } from "vitest";
import {
  getPairIdentityConflictMessages,
  namesAreSamePerson,
} from "./duplicate-identity";

describe("duplicate-identity", () => {
  it("namesAreSamePerson tolère nom/prénom inversés", () => {
    expect(namesAreSamePerson({ nom: "PLAZA", prenom: "Gabin" }, { nom: "Gabin", prenom: "Plaza" })).toBe(
      true
    );
  });

  it("namesAreSamePerson distingue des prénoms proches", () => {
    expect(
      namesAreSamePerson({ nom: "PLAZA", prenom: "Gabin" }, { nom: "PLAZA", prenom: "Gabriel" })
    ).toBe(false);
  });

  it("getPairIdentityConflictMessages signale noms différents avec même email", () => {
    const reasons = getPairIdentityConflictMessages(
      {
        nom: "PLAZA",
        prenom: "Gabriel",
        email: "famille@example.com",
        telephone: undefined,
      },
      {
        nom: "PLAZA",
        prenom: "Gabin",
        email: "famille@example.com",
        telephone: undefined,
      }
    );
    expect(reasons).toContain("noms différents");
    expect(reasons).not.toContain("emails différents");
  });

  it("getPairIdentityConflictMessages conserve homonyme email différent", () => {
    const reasons = getPairIdentityConflictMessages(
      {
        nom: "BERNARD",
        prenom: "Luc",
        email: "luc@example.com",
      },
      {
        nom: "BERNARD",
        prenom: "Luc",
        email: "autre@example.com",
      }
    );
    expect(reasons).toContain("emails différents");
    expect(reasons).not.toContain("noms différents");
  });
});
