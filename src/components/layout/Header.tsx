import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Lock, User } from "lucide-react";
import { getPageHeader } from "@/lib/navigation/page-headers";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { subscribeCgpConfigChanged } from "@/lib/settings/cgp-config-events";
import { GlobalSearch } from "./GlobalSearch";

interface HeaderProps {
  onLogout: () => void;
  currentPage: string;
  onPageChange: (page: string) => void;
  /** Retour à la page précédente (absent s'il n'y en a pas). */
  onBack?: () => void;
}

export function Header({ onLogout, currentPage, onPageChange, onBack }: HeaderProps) {
  const { title, subtitle } = getPageHeader(currentPage);
  const [advisorName, setAdvisorName] = useState("");

  // Relu à chaque page et après l'enregistrement du profil dans Paramètres.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void getCgpConfig()
        .then((config) => {
          const name = [config.prenom, config.nom].map((part) => part?.trim()).filter(Boolean).join(" ");
          if (!cancelled) setAdvisorName(name);
        })
        .catch(() => {
          /* nom indisponible : libellé générique */
        });
    };
    load();
    const unsubscribe = subscribeCgpConfigChanged(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentPage]);

  return (
    <header className="bg-card border-b border-border px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-9 w-9 shrink-0"
              title="Retour à la page précédente (Alt+←)"
              aria-label="Retour à la page précédente"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-serif font-bold text-primary">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <GlobalSearch currentPage={currentPage} onPageChange={onPageChange} />

          <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{advisorName || "Conseiller"}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="gap-2"
            title="Verrouiller l'application (mot de passe demandé pour revenir)"
          >
            <Lock className="h-4 w-4" />
            Verrouiller
          </Button>
        </div>
      </div>
    </header>
  );
}
