import { useState } from "react";
import { Lock } from "lucide-react";
import { CP } from "@/components/contacts/client-preview/client-preview-theme";
import { PortalOtpInput } from "./PortalOtpInput";

export interface PortalLoginBranding {
  logoUrl?: string;
  loginTagline: string;
}

export interface PortalLoginProps {
  email: string;
  code: string;
  codeSent: boolean;
  loading: boolean;
  error: string | null;
  info: string | null;
  branding: PortalLoginBranding;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onRequestCode: () => void;
  onSubmit: () => void;
  onOpenPrivacy: () => void;
}

type LoginStep = "email" | "code";

export function PortalLogin({
  email,
  code,
  codeSent,
  loading,
  error,
  info,
  branding,
  onEmailChange,
  onCodeChange,
  onRequestCode,
  onSubmit,
  onOpenPrivacy,
}: PortalLoginProps) {
  const [step, setStep] = useState<LoginStep>(email.trim() ? "code" : "email");

  const goToCodeStep = () => {
    if (!email.trim().includes("@")) return;
    setStep("code");
  };

  return (
    <main
      className={`${CP.root} cp-login-shell flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10`}
    >
      <div className="w-full max-w-sm space-y-6">
        <header className="cp-login-header">
          <div className="cp-login-brand">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt="Logo du cabinet"
                className="cp-login-logo"
              />
            ) : null}
            <h1 className="text-xl font-medium tracking-tight text-[var(--cp-ink)]">
              Espace investisseur
            </h1>
          </div>
          <p className="cp-login-tagline text-sm leading-relaxed text-[var(--cp-ink-muted)]">
            {branding.loginTagline}
          </p>
        </header>

        <form
          className="cp-login-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (step === "email") {
              goToCodeStep();
              return;
            }
            onSubmit();
          }}
        >
          {step === "email" ? (
            <div className="space-y-4">
              <label className="block space-y-2" htmlFor="portal-login-email">
                <span className="cp-kicker">Votre email</span>
                <input
                  id="portal-login-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  className="cp-login-field"
                  placeholder="vous@example.com"
                />
              </label>
              <button
                type="submit"
                disabled={loading || !email.trim().includes("@")}
                className="w-full rounded-xl bg-[var(--cp-ink)] px-4 py-2.5 text-sm font-medium text-[var(--cp-bg)] transition-opacity disabled:opacity-40"
              >
                Continuer
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="truncate text-[var(--cp-ink-muted)]">{email}</p>
                <button
                  type="button"
                  className="shrink-0 text-[var(--cp-ink-muted)] underline-offset-2 hover:text-[var(--cp-ink)] hover:underline"
                  onClick={() => setStep("email")}
                >
                  Modifier
                </button>
              </div>

              <div className="space-y-2">
                <span className="cp-kicker">Code à 6 chiffres</span>
                <PortalOtpInput
                  value={code}
                  onChange={onCodeChange}
                  disabled={loading}
                />
                <p className="cp-login-code-hint text-[var(--cp-ink-muted)]">
                  {codeSent
                    ? "Vous n'avez rien reçu ? Vérifiez vos indésirables."
                    : "Première connexion : saisissez le code communiqué par votre conseiller."}
                </p>
              </div>

              <button
                type="button"
                disabled={loading || !email.trim()}
                onClick={onRequestCode}
                className="text-sm text-[var(--cp-ink-muted)] underline-offset-2 hover:text-[var(--cp-ink)] hover:underline disabled:opacity-40"
              >
                {loading ? "Envoi…" : "Recevoir un code par email"}
              </button>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full rounded-xl bg-[var(--cp-ink)] px-4 py-2.5 text-sm font-medium text-[var(--cp-bg)] transition-opacity disabled:opacity-40"
              >
                {loading ? "Connexion…" : "Se connecter"}
              </button>
            </div>
          )}

          {info ? (
            <p className="mt-3 text-sm text-[var(--cp-ink-muted)]" role="status">
              {info}
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 text-sm text-amber-600 dark:text-amber-400/90" role="alert">
              {error}
            </p>
          ) : null}

          <footer className="mt-5 space-y-3 border-t border-[var(--cp-line)] pt-4">
            <div className="cp-login-trust">
              <span className="cp-login-trust-item">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Connexion chiffrée
              </span>
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="underline-offset-2 hover:text-[var(--cp-ink)] hover:underline"
              >
                Protection des données personnelles
              </button>
            </div>
          </footer>
        </form>
      </div>
    </main>
  );
}
