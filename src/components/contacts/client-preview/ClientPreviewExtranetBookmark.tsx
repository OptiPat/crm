import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { normalizeExtranetBookmarkUrl } from "@/lib/espace-client/client-extranet-bookmark";
import { CP } from "./client-preview-theme";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 text-sm text-[var(--cp-ink)]";

export const EXTRANET_BOOKMARK_ERROR =
  "Indiquez une adresse https, sans identifiant ni mot de passe.";

export interface ClientPreviewExtranetBookmarkFieldProps {
  draft: string;
  onDraftChange: (value: string) => void;
  error?: string | null;
  savedUrl?: string | null;
}

/** Champ seul — le parent enregistre (formulaire « Mettre à jour »). */
export function ClientPreviewExtranetBookmarkField({
  draft,
  onDraftChange,
  error,
  savedUrl,
}: ClientPreviewExtranetBookmarkFieldProps) {
  return (
    <div>
      <label className="block">
        <span className={CP.meta}>
          Lien vers votre espace en ligne — optionnel
        </span>
        <span className={`${CP.caption} mt-0.5 block`}>
          Comme un favori — l&apos;adresse seulement, jamais vos identifiants.
        </span>
        <input
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://espace.assureur.fr"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          className={INPUT_CLASS}
        />
      </label>
      {error ? (
        <p className={`${CP.caption} mt-1 text-red-400`}>{error}</p>
      ) : null}
      {savedUrl ? (
        <a
          href={savedUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={`${CP.caption} mt-1.5 inline-flex items-center gap-1 underline-offset-2 hover:underline`}
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          Ouvrir l&apos;espace en ligne
        </a>
      ) : null}
    </div>
  );
}

export interface ClientPreviewExtranetBookmarkProps {
  currentUrl?: string | null;
  submitting?: boolean;
  onSave: (url: string | null) => Promise<void>;
}

/** Fiche sans « Mettre à jour » : le lien a son propre enregistrement. */
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
      setError(EXTRANET_BOOKMARK_ERROR);
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
    <div className="space-y-2 py-3">
      <ClientPreviewExtranetBookmarkField
        draft={draft}
        onDraftChange={(value) => {
          setDraft(value);
          setError(null);
        }}
        error={error}
      />
      <div className="flex flex-wrap items-center gap-2">
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
