import { describe, expect, it } from "vitest";
import { formatClientFolderName } from "@/lib/client-onedrive/client-folder-name";

describe("client-folder-name", () => {
  it("formate NOM Prénom", () => {
    expect(formatClientFolderName("DUPONT", "Jean")).toBe("DUPONT Jean");
  });
});
