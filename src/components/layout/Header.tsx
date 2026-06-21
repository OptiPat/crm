import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { getPageHeader } from "@/lib/navigation/page-headers";
import { GlobalSearch } from "./GlobalSearch";

interface HeaderProps {
  onLogout: () => void;
  currentPage: string;
  onPageChange: (page: string) => void;
}

export function Header({ onLogout, currentPage, onPageChange }: HeaderProps) {
  const { title, subtitle } = getPageHeader(currentPage);

  return (
    <header className="bg-card border-b border-border px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <GlobalSearch currentPage={currentPage} onPageChange={onPageChange} />

          <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Conseiller</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </div>
    </header>
  );
}
