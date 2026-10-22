import { describe, expect, it } from "vitest";
import {
  EMPTY_IMPORT_QUEUE,
  carryOverTypeDocument,
  dequeueImportPath,
  enqueueImportPaths,
  fileNameFromPath,
  formatFilesCount,
  formatImportQueueLabel,
  normalizeDocumentPath,
  resolveQueuedTypeDocument,
} from "./document-import-queue";

describe("document-import-queue", () => {
  it("enfile, ignore doublons et vides, puis défile dans l'ordre", () => {
    const { queue, added } = enqueueImportPaths(EMPTY_IMPORT_QUEUE, [
      "C:\\a.pdf",
      "",
      "C:\\b.pdf",
      "C:\\a.pdf",
    ]);
    expect(added).toBe(2);
    expect(queue.total).toBe(2);

    const first = dequeueImportPath(queue);
    expect(first.path).toBe("C:\\a.pdf");
    expect(first.queue.position).toBe(1);

    const more = enqueueImportPaths(first.queue, ["C:\\c.pdf", "C:\\b.pdf"]);
    expect(more.added).toBe(1);
    expect(more.queue.total).toBe(3);
    expect(more.queue.pending).toEqual(["C:\\b.pdf", "C:\\c.pdf"]);

    const second = dequeueImportPath(more.queue);
    expect(second.path).toBe("C:\\b.pdf");
    expect(formatImportQueueLabel(second.queue, "b.pdf")).toBe("Fichier 2 sur 3 — b.pdf");
  });

  it("file vide : rien à défiler", () => {
    const { queue, path } = dequeueImportPath(EMPTY_IMPORT_QUEUE);
    expect(path).toBeNull();
    expect(queue).toBe(EMPTY_IMPORT_QUEUE);
  });

  it("pas de libellé pour un fichier unique", () => {
    const { queue } = dequeueImportPath(enqueueImportPaths(EMPTY_IMPORT_QUEUE, ["x.pdf"]).queue);
    expect(formatImportQueueLabel(queue, "x.pdf")).toBeUndefined();
  });

  it("nom de fichier et pluriel", () => {
    expect(fileNameFromPath("C:\\Users\\moi\\relevé.pdf")).toBe("relevé.pdf");
    expect(fileNameFromPath("/tmp/a/b.png")).toBe("b.png");
    expect(formatFilesCount(1)).toBe("1 fichier");
    expect(formatFilesCount(3)).toBe("3 fichiers");
  });

  it("report du type : la détection prime, identité/RIO/QPI non propagés", () => {
    expect(carryOverTypeDocument("FISCAL")).toBe("FISCAL");
    expect(carryOverTypeDocument("IDENTITE")).toBeUndefined();
    expect(carryOverTypeDocument("PATRIMOINE")).toBeUndefined();
    expect(resolveQueuedTypeDocument("AUTRE", "FISCAL")).toBe("FISCAL");
    expect(resolveQueuedTypeDocument("IDENTITE", "FISCAL")).toBe("IDENTITE");
    expect(resolveQueuedTypeDocument("AUTRE")).toBe("AUTRE");
  });

  it("normalise les chemins pour la comparaison", () => {
    expect(normalizeDocumentPath("C:\\Data\\Documents\\A.pdf")).toBe(
      normalizeDocumentPath("c:/data/documents/a.pdf")
    );
  });
});
