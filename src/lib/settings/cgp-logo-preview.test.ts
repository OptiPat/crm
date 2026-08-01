import { beforeEach, describe, expect, it, vi } from "vitest";

const readPublicBrandingLogoDataUrl = vi.fn();
const readLocalImageDataUrl = vi.fn();
const getAppBranding = vi.fn();

vi.mock("@/lib/api/tauri-secure-files", () => ({
  readPublicBrandingLogoDataUrl: (...args: unknown[]) =>
    readPublicBrandingLogoDataUrl(...args),
  readLocalImageDataUrl: (...args: unknown[]) => readLocalImageDataUrl(...args),
}));

vi.mock("@/lib/api/tauri-app-branding", () => ({
  getAppBranding: (...args: unknown[]) => getAppBranding(...args),
}));

import { loadCgpLogoDataUrl } from "@/lib/settings/cgp-logo-preview";

describe("loadCgpLogoDataUrl", () => {
  beforeEach(() => {
    readPublicBrandingLogoDataUrl.mockReset();
    readLocalImageDataUrl.mockReset();
    getAppBranding.mockReset();
  });

  it("reads managed cabinet logo via public branding command", async () => {
    readPublicBrandingLogoDataUrl.mockResolvedValue("data:image/png;base64,abc");

    const url = await loadCgpLogoDataUrl("C:\\AppData\\logos\\cabinet-logo.png");

    expect(url).toBe("data:image/png;base64,abc");
    expect(readPublicBrandingLogoDataUrl).toHaveBeenCalledWith(
      "C:\\AppData\\logos\\cabinet-logo.png"
    );
    expect(getAppBranding).not.toHaveBeenCalled();
  });

  it("falls back to cabinet logo on disk when logo_path is empty", async () => {
    getAppBranding.mockResolvedValue({
      displayName: "CRM",
      logoMode: "cabinet",
      logoPath: "C:\\AppData\\logos\\cabinet-logo.png",
    });
    readPublicBrandingLogoDataUrl.mockResolvedValue("data:image/png;base64,cab");

    const url = await loadCgpLogoDataUrl("");

    expect(url).toBe("data:image/png;base64,cab");
    expect(getAppBranding).toHaveBeenCalled();
  });

  it("falls back to scoped read when public branding command fails", async () => {
    readPublicBrandingLogoDataUrl.mockRejectedValue(new Error("hors logos"));
    readLocalImageDataUrl.mockResolvedValue("data:image/jpeg;base64,legacy");

    const url = await loadCgpLogoDataUrl("D:\\legacy\\logo.jpg");

    expect(url).toBe("data:image/jpeg;base64,legacy");
    expect(readLocalImageDataUrl).toHaveBeenCalledWith("D:\\legacy\\logo.jpg");
  });
});
