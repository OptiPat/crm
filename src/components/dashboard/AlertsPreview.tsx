import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { getAlertesWithContacts, type AlerteWithContact } from "@/lib/api/tauri-dashboard";
import {
  CONTACT_DISPLAY_CATEGORY_LABELS,
  getDisplayCategorieBadgeClass,
} from "@/lib/contacts/contact-category-display";
import {
  getTypeAlerteBadgeClass,
  getTypeAlerteLabel,
} from "@/lib/alertes/alerte-labels";
import { navigateToSuivi } from "@/lib/navigation/suivi-navigation";
import { getAlerteTraceInfo } from "@/lib/alertes/alerte-trace";
import { subscribeAlertesChanged } from "@/lib/alertes/alert-events";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import type { DashboardDrillDownOpenContact } from "@/lib/dashboard/dashboard-drill-down";
import { ContactInitialsAvatar, DashboardPanel } from "./dashboard-ui";

interface AlertsPreviewProps {
  currentPage?: string;
  onNavigate?: (page: string) => void;
  onOpenContact?: DashboardDrillDownOpenContact;
}

function formatLastContact(timestamp: number | null) {
  if (!timestamp) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

export function AlertsPreview({ currentPage, onNavigate, onOpenContact }: AlertsPreviewProps) {
  const [alertes, setAlertes] = useState<AlerteWithContact[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPreview = useCallback(async () => {
    try {
      setLoading(true);
      setAlertes(await getAlertesWithContacts(5));
    } catch (error) {
      console.error("Erreur alertes:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    const debounceRef = { id: null as number | null };
    const schedule = () => {
      if (debounceRef.id != null) window.clearTimeout(debounceRef.id);
      debounceRef.id = window.setTimeout(() => {
        debounceRef.id = null;
        void loadPreview();
      }, 120);
    };
    const unsubAlertes = subscribeAlertesChanged(schedule);
    const unsubContacts = subscribeContactsChanged(schedule);
    return () => {
      unsubAlertes();
      unsubContacts();
      if (debounceRef.id != null) window.clearTimeout(debounceRef.id);
    };
  }, [loadPreview]);

  const openAlert = (alerte: AlerteWithContact) => {
    if (onOpenContact) {
      onOpenContact(
        alerte.contact_id,
        alertes.map((a) => a.contact_id)
      );
      return;
    }
    if (onNavigate) {
      navigateToSuivi(onNavigate, "alertes", undefined, alerte.contact_id, currentPage);
    }
  };

  const panelDescription = loading
    ? "Chargement…"
    : alertes.length > 0
      ? `${alertes.length} contact${alertes.length > 1 ? "s" : ""} — clic pour ouvrir la fiche`
      : "Rien à traiter pour le moment";

  return (
    <DashboardPanel
      title="Contacts à recontacter"
      description={panelDescription}
      className="h-full"
      action={
        onNavigate && alertes.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1"
            onClick={() => onNavigate("suivi")}
          >
            Tout le suivi
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : alertes.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-center">
          <div className="inline-flex p-3 rounded-full bg-emerald-50 mb-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="font-medium text-foreground">Suivi à jour</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Aucune alerte en attente.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {alertes.map((alerte) => {
            const lastContact = formatLastContact(alerte.date_dernier_contact);
            const typeLabel = getTypeAlerteLabel(alerte.type_alerte);
            const trace = getAlerteTraceInfo(alerte);

            return (
              <li key={alerte.alerte_id}>
                <button
                  type="button"
                  onClick={() => openAlert(alerte)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-background/80 hover:bg-muted/40 hover:border-primary/25 transition-colors text-left group"
                >
                  <ContactInitialsAvatar
                    prenom={alerte.contact_prenom}
                    nom={alerte.contact_nom}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground truncate">
                        {alerte.contact_prenom} {alerte.contact_nom}
                      </p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-5 shrink-0 ${getDisplayCategorieBadgeClass(alerte.contact_categorie)}`}
                      >
                        {CONTACT_DISPLAY_CATEGORY_LABELS[alerte.contact_categorie] ||
                          alerte.contact_categorie}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-5 shrink-0 ${getTypeAlerteBadgeClass(alerte.type_alerte)}`}
                      >
                        {typeLabel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {trace.rule}
                      {trace.daysOpen != null && trace.daysOpen > 0
                        ? ` · +${trace.daysOpen} j`
                        : ""}
                    </p>
                    {lastContact ? (
                      <p className="text-xs text-muted-foreground/80 mt-0.5">
                        Dernier contact : {lastContact}
                      </p>
                    ) : null}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-40 group-hover:opacity-100 group-hover:text-primary transition-all" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPanel>
  );
}
