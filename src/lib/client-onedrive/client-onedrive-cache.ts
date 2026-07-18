import type {
  ClientOneDriveBrowseResult,
  ClientOneDriveStatus,
} from "@/lib/api/tauri-client-onedrive";

let statusCache: ClientOneDriveStatus | null = null;
const browseCache = new Map<string, ClientOneDriveBrowseResult>();

function browseCacheKey(folderId: string | null): string {
  return folderId ?? "root";
}

export function getClientOneDriveStatusCache(): ClientOneDriveStatus | null {
  return statusCache;
}

export function setClientOneDriveStatusCache(status: ClientOneDriveStatus): void {
  statusCache = status;
}

export function clearClientOneDriveCache(): void {
  statusCache = null;
  browseCache.clear();
}

export function getClientOneDriveBrowseCache(
  folderId: string | null
): ClientOneDriveBrowseResult | null {
  return browseCache.get(browseCacheKey(folderId)) ?? null;
}

export function setClientOneDriveBrowseCache(
  folderId: string | null,
  result: ClientOneDriveBrowseResult
): void {
  browseCache.set(browseCacheKey(folderId), result);
}

export function clearClientOneDriveBrowseCache(): void {
  browseCache.clear();
}
