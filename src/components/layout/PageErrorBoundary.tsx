import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageErrorBoundaryProps {
  children: ReactNode;
  /** Titre affiché à la place du contenu planté. */
  title?: string;
  /** Si fourni : bouton « Revenir au tableau de bord ». */
  onGoHome?: () => void;
  /** `app` : dernier filet au-dessus de toute l'application (écran plein + « Recharger »). */
  variant?: "page" | "app";
}

interface PageErrorBoundaryState {
  error: unknown;
  hasError: boolean;
}

/** Remplace une page (ou une partie) qui plante par un message lisible : le menu reste utilisable. */
export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  public state: PageErrorBoundaryState = { error: null, hasError: false };

  public static getDerivedStateFromError(error: unknown): PageErrorBoundaryState {
    return { error, hasError: true };
  }

  public componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Erreur d'affichage :", error, errorInfo.componentStack);
  }

  public render() {
    const { error, hasError } = this.state;
    if (!hasError) return this.props.children;

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (this.props.variant === "app") {
      return (
        <div role="alert" className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="max-w-md space-y-3 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive" aria-hidden />
            <p className="text-lg font-semibold text-foreground">Le CRM a rencontré une erreur</p>
            <p className="text-sm text-muted-foreground">
              Vos données enregistrées ne sont pas touchées. Rechargez l'application pour continuer.
            </p>
            <Button onClick={() => window.location.reload()}>Recharger</Button>
            <p className="break-words text-xs text-muted-foreground">{errorMessage}</p>
          </div>
        </div>
      );
    }

    const { title = "Cette page n'a pas pu s'afficher", onGoHome } = this.props;
    return (
      <div role="alert" className="mx-auto max-w-2xl rounded-lg border border-destructive/30 bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-lg font-semibold text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground">
              Une erreur inattendue s'est produite. Vos données enregistrées ne sont pas touchées.
              Vous pouvez réessayer ou passer à une autre page.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" onClick={() => this.setState({ error: null, hasError: false })}>
                Réessayer
              </Button>
              {onGoHome && (
                <Button size="sm" variant="outline" onClick={onGoHome}>
                  Revenir au tableau de bord
                </Button>
              )}
            </div>
            <details className="pt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">Détails techniques</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                {errorMessage}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }
}
