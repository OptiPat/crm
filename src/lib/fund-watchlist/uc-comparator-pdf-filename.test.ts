import { describe, expect, it } from "vitest";
import {
  buildUcComparatorPdfFilename,
  buildUcComparatorPdfFilenameStem,
  shortenFundNameForPdf,
} from "@/lib/fund-watchlist/uc-comparator-pdf-filename";

describe("uc-comparator-pdf-filename", () => {
  it("construit un nom de fichier avec les noms des UC", () => {
    const at = Math.floor(new Date("2026-08-03T12:00:00Z").getTime() / 1000);
    expect(
      buildUcComparatorPdfFilename(
        ["Templeton Asian Growth Fund A(acc)EUR", "Carmignac Portfolio Asia Discovery A EUR Acc"],
        at
      )
    ).toBe(
      "Comparatif UC - Templeton Asian Growth Fund vs Carmignac Portfolio Asia Discovery - 2026-08-03.pdf"
    );
    expect(
      buildUcComparatorPdfFilenameStem(
        ["Pictet - Robotics P EUR", "Fidelity Funds - Global Technology Fund A-DIST-EUR"],
        at
      )
    ).toBe("Comparatif UC - Pictet - Robotics vs Fidelity Funds - Global Technology Fund - 2026-08-03");
  });

  it("raccourcit les suffixes de part", () => {
    expect(shortenFundNameForPdf("Fidelity Funds - Global Technology Fund A-DIST-EUR")).toBe(
      "Fidelity Funds - Global Technology Fund"
    );
  });
});
