import { openExternalUrl } from "@/lib/api/tauri-system";

export function driveFileViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export async function openComptaDriveLink(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;
  await openExternalUrl(trimmed);
}
