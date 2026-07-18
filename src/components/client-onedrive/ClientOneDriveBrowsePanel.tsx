import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChevronLeft, ExternalLink, Folder, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import {

  browseClientOneDrive,

  type ClientOneDriveItem,

} from "@/lib/api/tauri-client-onedrive";

import {

  getClientOneDriveBrowseCache,

  setClientOneDriveBrowseCache,

} from "@/lib/client-onedrive/client-onedrive-cache";

import { openExternalUrl } from "@/lib/api/tauri-system";

import { invokeErrorMessage } from "@/lib/api/invoke-error";

import {
  beginRefreshGeneration,
  isRefreshGenerationCurrent,
} from "@/lib/refresh-generation";

import { cn } from "@/lib/utils";

import { toast } from "sonner";



interface ClientOneDriveBrowsePanelProps {

  initialFolderId?: string | null;

  boundaryFolderId?: string | null;

  onPickFolder?: (item: ClientOneDriveItem) => void;

  pickFolderLabel?: string;

}



function BrowseListSkeleton() {

  return (

    <div className="space-y-2">

      {Array.from({ length: 6 }).map((_, index) => (

        <div key={index} className="h-10 rounded-lg bg-muted/50 animate-pulse" />

      ))}

    </div>

  );

}



export function ClientOneDriveBrowsePanel({

  initialFolderId = null,

  boundaryFolderId = null,

  onPickFolder,

  pickFolderLabel = "Choisir ce dossier",

}: ClientOneDriveBrowsePanelProps) {

  const cachedInitial = getClientOneDriveBrowseCache(initialFolderId);

  const loadGenRef = useRef(0);

  const [loading, setLoading] = useState(!cachedInitial);

  const [refreshing, setRefreshing] = useState(false);

  const [folderName, setFolderName] = useState(cachedInitial?.folderName ?? "");

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(

    cachedInitial?.folderId ?? initialFolderId

  );

  const [parentFolderId, setParentFolderId] = useState<string | null>(

    cachedInitial?.parentFolderId ?? null

  );

  const [items, setItems] = useState<ClientOneDriveItem[]>(cachedInitial?.items ?? []);

  const [search, setSearch] = useState("");



  const loadFolder = useCallback(async (folderId: string | null) => {

    const token = beginRefreshGeneration(loadGenRef);

    const cached = getClientOneDriveBrowseCache(folderId);

    if (cached) {

      setFolderName(cached.folderName);

      setCurrentFolderId(cached.folderId);

      setParentFolderId(cached.parentFolderId);

      setItems(cached.items);

      setLoading(false);

      setRefreshing(true);

    } else {

      setLoading(true);

      setRefreshing(false);

    }



    try {

      const result = await browseClientOneDrive(folderId);

      if (!isRefreshGenerationCurrent(loadGenRef, token)) return;

      setClientOneDriveBrowseCache(folderId, result);

      setFolderName(result.folderName);

      setCurrentFolderId(result.folderId);

      setParentFolderId(result.parentFolderId);

      setItems(result.items);

    } catch (e) {

      if (!isRefreshGenerationCurrent(loadGenRef, token)) return;

      if (!cached) {

        toast.error(invokeErrorMessage(e) || "Impossible d'ouvrir OneDrive");

        setItems([]);

      } else {

        toast.error("Impossible de rafraîchir OneDrive — données affichées en cache.");

      }

    } finally {

      if (isRefreshGenerationCurrent(loadGenRef, token)) {

        setLoading(false);

        setRefreshing(false);

      }

    }

  }, []);



  useEffect(() => {

    void loadFolder(initialFolderId);

  }, [initialFolderId, loadFolder]);



  const filteredItems = useMemo(() => {

    const q = search.trim().toLowerCase();

    if (!q) return items;

    return items.filter((item) => item.name.toLowerCase().includes(q));

  }, [items, search]);



  const showSkeleton = loading && items.length === 0;

  const atBoundary =

    boundaryFolderId != null &&

    boundaryFolderId.length > 0 &&

    currentFolderId === boundaryFolderId;

  const canGoBack =

    !atBoundary && (parentFolderId != null || currentFolderId !== "root");



  return (

    <div className="space-y-3">

      <div className="flex flex-wrap items-center gap-2">

        {canGoBack ? (

          <Button

            type="button"

            variant="outline"

            size="sm"

            className="gap-1"

            disabled={refreshing}

            onClick={() => void loadFolder(parentFolderId)}

          >

            <ChevronLeft className="h-4 w-4" />

            Retour

          </Button>

        ) : null}

        <div className="min-w-0 flex-1 font-medium truncate flex items-center gap-2">

          <span className="truncate">{folderName || "OneDrive"}</span>

          {refreshing ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}

        </div>

      </div>

      <div className="relative">

        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />

        <Input

          value={search}

          onChange={(e) => setSearch(e.target.value)}

          placeholder="Rechercher…"

          className="pl-8"

        />

      </div>

      {showSkeleton ? (

        <BrowseListSkeleton />

      ) : filteredItems.length === 0 ? (

        <p className="text-sm text-muted-foreground py-8 text-center">

          {loading ? "Chargement…" : "Dossier vide"}

        </p>

      ) : (

        <ul

          className={cn(

            "space-y-1 max-h-[420px] overflow-y-auto pr-1 transition-opacity",

            refreshing && "opacity-70"

          )}

        >

          {filteredItems.map((item) => (

            <li

              key={item.id}

              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm bg-card"

            >

              {item.isFolder ? (

                <Folder className="h-4 w-4 text-sky-600 shrink-0" />

              ) : (

                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />

              )}

              <button

                type="button"

                className="flex-1 text-left truncate hover:underline min-w-0"

                onClick={() => {

                  if (item.isFolder) {

                    void loadFolder(item.id);

                    return;

                  }

                  if (item.webUrl) void openExternalUrl(item.webUrl);

                }}

              >

                {item.name}

              </button>

              {item.isFolder && onPickFolder ? (

                <Button type="button" size="sm" variant="secondary" onClick={() => onPickFolder(item)}>

                  {pickFolderLabel}

                </Button>

              ) : null}

            </li>

          ))}

        </ul>

      )}

    </div>

  );

}


