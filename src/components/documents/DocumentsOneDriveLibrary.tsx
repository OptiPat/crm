import { useEffect, useState } from "react";

import { ClientOneDriveBrowsePanel } from "@/components/client-onedrive/ClientOneDriveBrowsePanel";

import { getClientOneDriveStatus } from "@/lib/api/tauri-client-onedrive";

import {

  getClientOneDriveStatusCache,

  setClientOneDriveStatusCache,

} from "@/lib/client-onedrive/client-onedrive-cache";



function OneDriveBrowseSkeleton() {

  return (

    <div className="space-y-3">

      <div className="h-9 w-40 rounded bg-muted/50 animate-pulse" />

      <div className="h-9 rounded-lg bg-muted/50 animate-pulse" />

      <div className="space-y-2">

        {Array.from({ length: 6 }).map((_, index) => (

          <div key={index} className="h-10 rounded-lg bg-muted/50 animate-pulse" />

        ))}

      </div>

    </div>

  );

}



export function DocumentsOneDriveLibrary() {

  const [initialStatus] = useState(() => getClientOneDriveStatusCache());

  const [status, setStatus] = useState(initialStatus);

  const [initialLoad, setInitialLoad] = useState(!initialStatus);



  useEffect(() => {

    let cancelled = false;

    void (async () => {

      try {

        const next = await getClientOneDriveStatus();

        if (cancelled) return;

        setClientOneDriveStatusCache(next);

        setStatus(next);

      } catch {

        /* garde le cache affiché */

      } finally {

        if (!cancelled) setInitialLoad(false);

      }

    })();

    return () => {

      cancelled = true;

    };

  }, []);



  if (initialLoad && !status) {

    return <OneDriveBrowseSkeleton />;

  }



  if (!status?.connected) {

    return (

      <p className="text-sm text-muted-foreground py-10 text-center">

        Connectez Microsoft OneDrive dans Paramètres → Intégrations → Dossiers clients.

      </p>

    );

  }



  if (!status.rootFolderId) {

    return (

      <p className="text-sm text-muted-foreground py-10 text-center">

        Choisissez le dossier racine « Dossier clients » dans Paramètres → Intégrations.

      </p>

    );

  }



  return <ClientOneDriveBrowsePanel initialFolderId={status.rootFolderId} boundaryFolderId={status.rootFolderId} />;

}


