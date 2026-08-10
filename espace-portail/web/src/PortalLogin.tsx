import { CP } from "@/components/contacts/client-preview/client-preview-theme";

export interface PortalLoginProps {
  email: string;
  code: string;
  codeSent: boolean;
  loading: boolean;
  error: string | null;
  info: string | null;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onRequestCode: () => void;
  onSubmit: () => void;
}

export function PortalLogin({
  email,
  code,
  codeSent,
  loading,
  error,
  info,
  onEmailChange,
  onCodeChange,
  onRequestCode,
  onSubmit,
}: PortalLoginProps) {
  return (
    <main
      className={`${CP.root} flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10`}
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <p className="cp-kicker">Patrimoine CRM</p>
          <h1 className="text-xl font-medium tracking-tight text-[var(--cp-ink)]">
            Espace client
          </h1>
          <p className="cp-caption text-[var(--cp-ink-muted)]">
            Saisissez votre email et votre code à 6 chiffres.
          </p>
        </div>

        <form
          className="rounded-2xl border border-[var(--cp-line)] bg-[var(--cp-surface)] p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-4">
            <label className="block space-y-2" htmlFor="portal-login-email">
              <span className="cp-kicker">Email</span>
              <input
                id="portal-login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                className="w-full rounded-xl border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-3 py-2.5 text-sm text-[var(--cp-ink)] outline-none ring-[var(--cp-ink-faint)] focus:ring-2"
                placeholder="vous@example.com"
              />
            </label>

            {/* Toujours visible : a la premiere connexion, le client possede
                deja le code que son conseiller lui a dicte et n'a aucun code a
                demander — le portail refuse d'ailleurs d'en envoyer avant. */}
            <label className="block space-y-2" htmlFor="portal-login-code">
              <span className="cp-kicker">Code à 6 chiffres</span>
              <input
                id="portal-login-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  onCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="w-full rounded-xl border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] text-[var(--cp-ink)] outline-none ring-[var(--cp-ink-faint)] focus:ring-2"
                placeholder="000000"
              />
            </label>

            <button
              type="submit"
              disabled={loading || !email.trim() || code.length !== 6}
              className="w-full rounded-xl bg-[var(--cp-ink)] px-4 py-2.5 text-sm font-medium text-[var(--cp-bg)] transition-opacity disabled:opacity-40"
            >
              {loading ? "Connexion…" : "Se connecter"}
            </button>

            <div className="space-y-2 border-t border-[var(--cp-line)] pt-4">
              <p className="cp-caption text-[var(--cp-ink-muted)]">
                {codeSent
                  ? "Vous n'avez rien reçu ? Vérifiez vos indésirables."
                  : "Première connexion : utilisez le code communiqué par votre conseiller."}
              </p>
              <button
                type="button"
                disabled={loading || !email.trim()}
                onClick={onRequestCode}
                className="w-full rounded-xl border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-4 py-2.5 text-sm font-medium text-[var(--cp-ink)] transition-opacity disabled:opacity-40"
              >
                {loading ? "Envoi…" : "Recevoir un code par email"}
              </button>
            </div>
          </div>

          {info ? (
            <p className="mt-3 text-sm text-[var(--cp-ink-muted)]" role="status">
              {info}
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 text-sm text-amber-400/90" role="alert">
              {error}
            </p>
          ) : null}

          <p className="mt-4 text-center text-xs text-[var(--cp-ink-muted)]">
            <a
              href="/confidentialite"
              className="underline-offset-2 hover:text-[var(--cp-ink)] hover:underline"
            >
              Protection des données personnelles
            </a>
          </p>
        </form>
      </div>
    </main>
  );
}
