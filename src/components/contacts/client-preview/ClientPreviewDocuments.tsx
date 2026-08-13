import { useRef } from "react";

export interface ClientPreviewDocumentDemande {
  id: number;
  libelle: string;
  demandeAt: number;
}

export interface ClientPreviewDocumentsProps {
  demandes: ClientPreviewDocumentDemande[];
  loading?: boolean;
  error?: string | null;
  uploadingId?: number | null;
  /**
   * Absent dans l'aperçu conseiller : le bouton reste dessiné, pour que
   * l'écran soit celui du client, mais il n'ouvre aucun sélecteur de fichier.
   */
  onUpload?: (demandeId: number, file: File) => void;
  /** Proposé seulement quand le portail réclame une reconnexion. */
  onReconnect?: () => void;
}

function formatDemandeDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("fr-FR", {
    dateStyle: "medium",
  });
}

/**
 * Pièces attendues du client. Rendu partagé par le portail et l'aperçu du CRM :
 * le conseiller doit voir l'écran tel qu'il est, section documents comprise.
 */
export function ClientPreviewDocuments({
  demandes,
  loading = false,
  error = null,
  uploadingId = null,
  onUpload,
  onReconnect,
}: ClientPreviewDocumentsProps) {
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  if (loading) {
    return (
      <section className="w-full px-4 pb-6">
        <p className="cp-caption text-[var(--cp-ink-muted)]">Documents demandés…</p>
      </section>
    );
  }

  if (demandes.length === 0 && !error) {
    return null;
  }

  return (
    <section className="w-full px-4 pb-6">
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
            {onReconnect ? (
              <button
                type="button"
                onClick={onReconnect}
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
                  {onUpload ? (
                    <input
                      ref={(el) => {
                        fileInputs.current[demande.id] = el;
                      }}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onUpload(demande.id, file);
                        e.target.value = "";
                      }}
                    />
                  ) : null}
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
