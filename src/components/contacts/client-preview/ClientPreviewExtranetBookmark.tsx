import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { normalizeExtranetBookmarkUrl } from "@/lib/espace-client/client-extranet-bookmark";
import { CP } from "./client-preview-theme";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 text-sm text-[var(--cp-ink)]";

export interface ClientPreviewExtranetBookmarkProps {
  currentUrl?: string | null;
  submitting?: boolean;
  onSave: (url: string | null) => Promise<void>;
}

export function ClientPreviewExtranetBookmark({
  currentUrl,
  submitting = false,
  onSave,
}: ClientPreviewExtranetBookmarkProps) {
  const [editing, setEditing] = useState(!currentUrl);
  const [draft, setDraft] = useState(currentUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  const persist = async (raw: string) => {
    const normalized = normalizeExtranetBookmarkUrl(raw);
    if (normalized === "invalid") {
      setError("Indiquez une adresse https, sans identifiant ni mot de passe.");
      return;
    }
    setError(null);
    await onSave(normalized);
    setDraft(normalized ?? "");
    setEditing(!normalized);
  };

  if (currentUrl && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
        <a
          href={currentUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-3 py-1.5 text-sm text-[var(--cp-ink)] transition-colors hover:border-[var(--cp-ink-muted)]"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Ouvrir l&apos;espace en ligne
        </a>
        <button
          type="button"
          className={`${CP.caption} underline-offset-2 hover:underline`}
          onClick={() => {
            setDraft(currentUrl);
            setEditing(true);
          }}
        >
          Modifier
        </button>
      </div>
    );
  }

  return (
    <div className="py-3">
      <p className={CP.meta}>Lien vers votre espace en ligne — optionnel</p>
      <p className={`${CP.caption} mt-0.5`}>
        Comme un favori — l&apos;adresse seulement, jamais vos identifiants.
      </p>
      <input
        type="url"
        inputMode="url"
        autoComplete="url"
        placeholder="https://espace.assureur.fr"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className={INPUT_CLASS}
      />
      {error ? <p className={`${CP.caption} mt-1 text-red-400`}>{error}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void persist(draft)}
          className="rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-3 py-1.5 text-sm text-[var(--cp-ink)] disabled:opacity-60"
        >
          {submitting ? "Enregistrement…" : "Enregistrer"}
        </button>
        {currentUrl ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setEditing(false);
              setDraft(currentUrl);
              setError(null);
            }}
            className={`${CP.caption} underline-offset-2 hover:underline`}
          >
            Annuler
          </button>
        ) : null}
      </div>
    </div>
  );
}
