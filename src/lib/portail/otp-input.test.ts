import { describe, expect, it } from "vitest";
import { distributeOtpInput } from "./otp-input";

describe("distributeOtpInput", () => {
  it("répartit un autofill de 6 chiffres dans la première case", () => {
    expect(distributeOtpInput("", 0, "482915")).toBe("482915");
  });

  it("ne garde qu'un chiffre sur saisie unitaire", () => {
    expect(distributeOtpInput("12", 2, "3")).toBe("123");
  });

  it("accepte une saisie unitaire à un index donné", () => {
    expect(distributeOtpInput("12", 2, "9")).toBe("129");
  });

  it("vide la case courante", () => {
    expect(distributeOtpInput("123456", 2, "")).toBe("12456");
  });

  it("insère un bloc multi-chiffres à partir d'un index intermédiaire", () => {
    expect(distributeOtpInput("12", 2, "3456")).toBe("123456");
  });
});
