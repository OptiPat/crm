import { LogOut } from "lucide-react";
import { CP } from "@/components/contacts/client-preview/client-preview-theme";

export interface PortalPatrimoineHeaderProps {
  /** Client connecté (affiché sous le titre, pas en concurrence avec le logo). */
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
    <header className="flex w-full max-w-5xl flex-col gap-2 px-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo du cabinet"
              className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9"
            />
          ) : null}
          <div className="min-w-0">
            <p
              className={`${CP.body} truncate font-medium text-[var(--cp-ink)]`}
            >
              {portalTitle}
            </p>
            {clientLabel ? (
              <p className={`${CP.caption} mt-0.5 truncate text-[var(--cp-ink-muted)]`}>
                {clientLabel}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-2.5 py-2 text-sm text-[var(--cp-ink)] transition-colors hover:bg-[var(--cp-surface-raised)] sm:px-3"
          aria-label="Déconnexion"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </div>
      {lastSyncLabel ? (
        <p className={`${CP.caption} text-[var(--cp-ink-muted)]`}>
          Mis à jour le {lastSyncLabel}
        </p>
      ) : null}
    </header>
  );
}
