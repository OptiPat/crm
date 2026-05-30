import { open } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, mkdir, remove } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";

const LOGO_BASENAME = "cabinet-logo";

/** Choisit une image et la copie dans AppData/logos/ (chemin persisté dans logo_path). */
export async function pickAndStoreCgpLogo(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp"],
      },
    ],
  });

  if (!selected || typeof selected !== "string") {
    return null;
  }

  const appData = await appDataDir();
  const logosDir = await join(appData, "logos");
  if (!(await exists(logosDir))) {
    await mkdir(logosDir, { recursive: true });
  }

  const extMatch = selected.match(/\.(png|jpe?g|webp)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase().replace("jpeg", "jpg") : "png";
  const destinationPath = await join(logosDir, `${LOGO_BASENAME}.${ext}`);

  for (const oldExt of ["png", "jpg", "webp"]) {
    const oldPath = await join(logosDir, `${LOGO_BASENAME}.${oldExt}`);
    if (await exists(oldPath)) {
      await remove(oldPath);
    }
  }

  await copyFile(selected, destinationPath);
  return destinationPath;
}

export async function removeStoredCgpLogo(logoPath: string | undefined | null): Promise<void> {
  if (!logoPath?.trim()) return;
  try {
    if (await exists(logoPath)) {
      await remove(logoPath);
    }
  } catch {
    /* fichier déjà absent */
  }
}
