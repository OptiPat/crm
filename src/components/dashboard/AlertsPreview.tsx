import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, ChevronRight, Sparkles } from "lucide-react";
import { getAlertesWithContacts, AlerteWithContact } from "@/lib/api/tauri-dashboard";
import {
  CONTACT_DISPLAY_CATEGORY_LABELS,
  getDisplayCategorieBadgeClass,
} from "@/lib/contacts/contact-category-display";

interface AlertsPreviewProps {
  onNavigate?: (page: string) => void;
}

export function AlertsPreview({ onNavigate }: AlertsPreviewProps) {
  const [alertes, setAlertes] = useState<AlerteWithContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setAlertes(await getAlertesWithContacts(5));
      } catch (error) {
        console.error("Erreur alertes:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "Jamais contacté";
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(timestamp * 1000));
  };

  return (
    <Card className="shadow-sm border-border/80 h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="font-serif text-xl flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-red-50">
                <Bell className="h-4 w-4 text-red-600" />
              </span>
              Contacts à recontacter
            </CardTitle>
            <CardDescription className="mt-1.5">
              {loading
                ? "Chargement…"
                : alertes.length > 0
                  ? `${alertes.length} alerte${alertes.length > 1 ? "s" : ""} prioritaire${alertes.length > 1 ? "s" : ""}`
                  : "Tous vos contacts sont à jour"}
            </CardDescription>
          </div>
          {onNavigate && alertes.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground shrink-0"
              onClick={() => onNavigate("suivi")}
            >
              Tout voir
              <ChevronRight className="h-4 w-4 ml-0.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Chargement…</div>
        ) : alertes.length === 0 ? (
          <div className="py-10 text-center">
            <div className="inline-flex p-4 rounded-full bg-emerald-50 mb-3">
              <Sparkles className="h-8 w-8 text-emerald-600 opacity-80" />
            </div>
            <p className="font-medium text-foreground/90">Rien à traiter</p>
            <p className="text-sm text-muted-foreground mt-1">Votre suivi est à jour.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {alertes.map((alerte) => (
              <li key={alerte.alerte_id}>
                <button
                  type="button"
                  onClick={() => onNavigate?.("suivi")}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/80 bg-card hover:bg-accent/60 hover:border-primary/20 transition-colors text-left group"
                >
                  <div className="w-1 self-stretch rounded-full bg-red-400/80 shrink-0 min-h-[2.5rem]" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium truncate">
                        {alerte.contact_prenom} {alerte.contact_nom}
                      </p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-5 shrink-0 ${getDisplayCategorieBadgeClass(alerte.contact_categorie)}`}
                      >
                        {CONTACT_DISPLAY_CATEGORY_LABELS[alerte.contact_categorie] ||
                          alerte.contact_categorie}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Dernier contact : {formatDate(alerte.date_dernier_contact)}
                    </p>
                    {alerte.message && (
                      <p className="text-sm text-primary/90 line-clamp-1">{alerte.message}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
