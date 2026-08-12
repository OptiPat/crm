import { useCallback, useEffect, useState } from "react";
import {
  ClientPreviewDocuments,
  type ClientPreviewDocumentDemande,
} from "@/components/contacts/client-preview/ClientPreviewDocuments";

interface ClientDemandesResponse {
  demandes: ClientPreviewDocumentDemande[];
}

export function PortalDocumentsSection() {
  const [demandes, setDemandes] = useState<ClientPreviewDocumentDemande[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  const reconnect = useCallback(async () => {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.reload();
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/demandes/me", {
        credentials: "include",
      });
      const body = (await response.json()) as ClientDemandesResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Chargement impossible");
      }
      setDemandes(body.demandes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
      setDemandes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpload = async (demandeId: number, file: File) => {
    setUploadingId(demandeId);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/v1/demandes/${demandeId}/upload`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const body = (await response.json()) as { error?: string; reauth?: boolean };
      if (!response.ok) {
        // Session trop ancienne pour une action sensible : le client doit
        // reprouver son identité avant de déposer une pièce.
        setNeedsReauth(body.reauth === true);
        throw new Error(body.error ?? "Dépôt impossible");
      }
      setNeedsReauth(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dépôt impossible");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <ClientPreviewDocuments
      demandes={demandes}
      loading={loading}
      error={error}
      uploadingId={uploadingId}
      onUpload={(demandeId, file) => void handleUpload(demandeId, file)}
      onReconnect={needsReauth ? () => void reconnect() : undefined}
    />
  );
}
