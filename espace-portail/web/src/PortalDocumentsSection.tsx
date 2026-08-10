import { useCallback, useEffect, useRef, useState } from "react";
import { CP } from "@/components/contacts/client-preview/client-preview-theme";

interface ClientDemande {
  id: number;
  libelle: string;
  typeDocument: string;
  demandeAt: number;
}

interface ClientDemandesResponse {
  demandes: ClientDemande[];
}

function formatDemandeDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("fr-FR", {
    dateStyle: "medium",
  });
}

export function PortalDocumentsSection() {
  const [demandes, setDemandes] = useState<ClientDemande[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

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

  if (loading) {
    return (
      <section className="w-full max-w-5xl px-4 pb-6">
        <p className="cp-caption text-[var(--cp-ink-muted)]">Documents demandés…</p>
      </section>
    );
  }

  if (demandes.length === 0 && !error) {
    return null;
  }

  return (
    <section className="w-full max-w-5xl px-4 pb-6">
      <div className="rounded-2xl border border-[var(--cp-line)] bg-[var(--cp-surface)] p-4 shadow-sm">
        <p className="cp-kicker">Documents</p>
        <h2 className="mt-1 text-base font-medium text-[var(--cp-ink)]">
          Pièces à déposer
        </h2>
        <p className="cp-caption mt-1 text-[var(--cp-ink-muted)]">
          PDF, JPEG ou PNG — 10 Mo maximum, un fichier par demande.
        </p>
        {error ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            {needsReauth ? (
              <button
                type="button"
                onClick={() => void reconnect()}
                className="rounded-xl border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-4 py-2 text-sm font-medium text-[var(--cp-ink)]"
              >
                Se reconnecter
              </button>
            ) : null}
          </div>
        ) : null}
        {demandes.length === 0 ? (
          <p className="cp-caption mt-3 text-[var(--cp-ink-muted)]">
            Aucune demande en attente.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {demandes.map((demande) => (
              <li
                key={demande.id}
                className="flex flex-col gap-2 rounded-xl border border-[var(--cp-line)] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--cp-ink)]">
                    {demande.libelle}
                  </p>
                  <p className="cp-caption text-[var(--cp-ink-muted)]">
                    Demandé le {formatDemandeDate(demande.demandeAt)}
                  </p>
                </div>
                <div>
                  <input
                    ref={(el) => {
                      fileInputs.current[demande.id] = el;
                    }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUpload(demande.id, file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-xl bg-[var(--cp-ink)] px-4 py-2 text-sm font-medium text-[var(--cp-bg)] disabled:opacity-60"
                    disabled={uploadingId === demande.id}
                    onClick={() => fileInputs.current[demande.id]?.click()}
                  >
                    {uploadingId === demande.id ? "Envoi…" : "Déposer le fichier"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
