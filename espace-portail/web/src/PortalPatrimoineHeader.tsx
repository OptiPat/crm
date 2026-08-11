import { LogOut } from "lucide-react";
import { CP } from "@/components/contacts/client-preview/client-preview-theme";

export interface PortalPatrimoineHeaderProps {
  /** Client connecté (affiché côté session, pas à côté du logo). */
  prenom: string;
  nom: string;
  logoUrl?: string;
  /** Titre portail à côté du logo — aligné sur l'écran de connexion. */
  portalTitle?: string;
  lastSyncLabel?: string | null;
  onLogout: () => void;
}

export function PortalPatrimoineHeader({
  prenom,
  nom,
  logoUrl,
  portalTitle = "Espace investisseur",
  lastSyncLabel,
  onLogout,
}: PortalPatrimoineHeaderProps) {
  const clientLabel = `${prenom} ${nom}`.trim();

  return (
    <header className="flex w-full max-w-5xl flex-col gap-3 px-4 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo du cabinet"
              className="cp-login-logo h-9 max-w-[2.75rem]"
            />
          ) : null}
          <div className="min-w-0">
            <p className={`${CP.body} font-medium text-[var(--cp-ink)]`}>
              {portalTitle}
            </p>
            {lastSyncLabel ? (
              <p className={`${CP.caption} mt-0.5 text-[var(--cp-ink-muted)]`}>
                Mis à jour le {lastSyncLabel}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <p className={`${CP.caption} text-[var(--cp-ink-muted)]`}>
            Connecté en tant que{" "}
            <span className="text-[var(--cp-ink)]">{clientLabel}</span>
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 text-sm text-[var(--cp-ink)] transition-colors hover:bg-[var(--cp-surface-raised)]"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}
