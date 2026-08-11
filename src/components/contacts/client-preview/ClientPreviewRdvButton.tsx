import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { CP } from "./client-preview-theme";

/** Un rendez-vous proposé au client : ce qu'il lit, et où il atterrit. */
export interface ClientPreviewRdvLien {
  id: string;
  libelle: string;
  url: string;
}

interface ClientPreviewRdvButtonProps {
  liens: ClientPreviewRdvLien[];
}

/**
 * Bouton de prise de rendez-vous, indépendant des échéances.
 *
 * Un seul lien : le bouton y mène directement, sans menu à ouvrir pour un
 * choix unique. Plusieurs : les libellés du conseiller sont proposés tels
 * quels — c'est lui qui nomme ses types de rendez-vous, dans ses réglages.
 */
export function ClientPreviewRdvButton({ liens }: ClientPreviewRdvButtonProps) {
  const [ouvert, setOuvert] = useState(false);

  if (liens.length === 0) return null;

  if (liens.length === 1) {
    return (
      <a
        href={liens[0].url}
        target="_blank"
        rel="noreferrer noopener"
        className={CP.rdvButton}
      >
        <CalendarPlus className="h-4 w-4" aria-hidden />
        Prendre rendez-vous
      </a>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOuvert((etat) => !etat)}
        aria-expanded={ouvert}
        className={CP.rdvButton}
      >
        <CalendarPlus className="h-4 w-4" aria-hidden />
        Prendre rendez-vous
      </button>

      {ouvert ? (
        <div className={CP.rdvMenu}>
          {liens.map((lien) => (
            <a
              key={lien.id}
              href={lien.url}
              target="_blank"
              rel="noreferrer noopener"
              className={CP.rdvMenuItem}
              onClick={() => setOuvert(false)}
            >
              {lien.libelle}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
