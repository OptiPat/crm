import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const writeDownloadsFileBytes = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/api/tauri-arbitrage-fiche", () => ({
  writeDownloadsFileBytes: (...args: unknown[]) => writeDownloadsFileBytes(...args),
}));
vi.mock("@/lib/api/tauri-system", () => ({ openDocumentFile: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

import { downloadBlobFile } from "@/lib/export/download-file";

const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/130.0";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("downloadBlobFile", () => {
  const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() },
    });
    vi.stubGlobal("window", { setTimeout: vi.fn() });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("macOS : écrit dans Téléchargements au lieu d'un <a download> (annulé par WKWebView)", async () => {
    vi.stubGlobal("navigator", { userAgent: MAC_UA, platform: "MacIntel" });
    writeDownloadsFileBytes.mockResolvedValue("/Users/x/Downloads/export.csv");

    downloadBlobFile("export.csv", new Blob(["a;b"], { type: "text/csv" }));
    await flush();

    expect(anchor.click).not.toHaveBeenCalled();
    expect(writeDownloadsFileBytes).toHaveBeenCalledTimes(1);
    const [name, bytes] = writeDownloadsFileBytes.mock.calls[0]!;
    expect(name).toBe("export.csv");
    expect(new TextDecoder().decode(bytes as Uint8Array)).toBe("a;b");
    expect(toastSuccess).toHaveBeenCalledWith(
      "export.csv enregistré dans Téléchargements.",
      expect.objectContaining({ action: expect.objectContaining({ label: "Ouvrir" }) })
    );
  });

  it("macOS : signale l'échec d'écriture", async () => {
    vi.stubGlobal("navigator", { userAgent: MAC_UA, platform: "MacIntel" });
    writeDownloadsFileBytes.mockRejectedValue(new Error("Operation not permitted"));

    downloadBlobFile("export.pdf", new Blob(["%PDF"]));
    await flush();

    expect(toastError).toHaveBeenCalledWith("Export impossible : Operation not permitted");
  });

  it("Windows : garde le téléchargement natif de la WebView", () => {
    vi.stubGlobal("navigator", { userAgent: WIN_UA, platform: "Win32" });

    downloadBlobFile("export.csv", new Blob(["a;b"]));

    expect(writeDownloadsFileBytes).not.toHaveBeenCalled();
    expect(anchor.download).toBe("export.csv");
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });
});
