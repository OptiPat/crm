import { CP } from "@/components/contacts/client-preview/client-preview-theme";

export interface PortalDevGateProps {
  inputId: string;
  loading: boolean;
  error: string | null;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
}

export function PortalDevGate({
  inputId,
  loading,
  error,
  onInputChange,
  onSubmit,
}: PortalDevGateProps) {
  return (
    <main className={`${CP.root} flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10`}>
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-medium tracking-tight text-[var(--cp-ink)]">
            Espace investisseur
          </h1>
          <p className="cp-caption text-[var(--cp-ink-muted)]">
            Mode développement — accès temporaire par identifiant contact
            synchronisé depuis le CRM.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--cp-line)] bg-[var(--cp-surface)] p-4 shadow-sm">
          <label className="block space-y-2" htmlFor="portal-dev-contact-id">
            <span className="cp-kicker">Identifiant contact</span>
            <input
              id="portal-dev-contact-id"
              type="number"
              min={1}
              value={inputId}
              onChange={(e) => onInputChange(e.target.value)}
              className="w-full rounded-xl border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-3 py-2.5 text-sm text-[var(--cp-ink)] outline-none ring-[var(--cp-ink-faint)] focus:ring-2"
              placeholder="ex. 112"
            />
          </label>

          <button
            type="button"
            disabled={loading || !inputId.trim()}
            onClick={onSubmit}
            className="mt-4 w-full rounded-xl bg-[var(--cp-ink)] px-4 py-2.5 text-sm font-medium text-[var(--cp-bg)] transition-opacity disabled:opacity-40"
          >
            {loading ? "Chargement…" : "Afficher mon patrimoine"}
          </button>

          {error ? (
            <p className="mt-3 text-sm text-amber-400/90" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
