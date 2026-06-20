import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactInitialsAvatar } from "@/components/dashboard/dashboard-ui";
import { AlerteEtiquetteHint } from "@/components/suivi/AlerteEtiquetteHint";
import {
  getTypeAlerteBadgeClass,
  getTypeAlerteLabel,
} from "@/lib/alertes/alerte-labels";
import {
  CONTACT_DISPLAY_CATEGORY_LABELS,
  getDisplayCategorieBadgeClass,
} from "@/lib/contacts/contact-category-display";
import type { AlerteWithContact } from "@/lib/api/tauri-dashboard";
import type { EtiquetteWithCount } from "@/lib/api/tauri-etiquettes";
import { formatAlerteContactLabel } from "@/lib/api/tauri-alertes";
import {
  ALERTE_ETIQUETTE_NOM,
  getEtiquetteNomForAlerte,
} from "@/lib/alertes/alerte-etiquette-links";
import { getAlerteTraceInfo } from "@/lib/alertes/alerte-trace";
import { Calendar, Check, Clock, ExternalLink, History, Info, ListTodo, Mail, X } from "lucide-react";

function formatLastContact(timestamp: number | null) {
  if (!timestamp) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

function formatAlerteDate(dateAlerte: string | number) {
  const ts =
    typeof dateAlerte === "string" ? parseInt(dateAlerte, 10) : dateAlerte;
  if (!Number.isFinite(ts) || ts <= 0) return null;
  return new Date(ts * 1000).toLocaleDateString("fr-FR");
}

function contactDisplayName(alerte: AlerteWithContact) {
  return `${alerte.contact_prenom} ${alerte.contact_nom}`.trim();
}

export function SuiviAlerteCard({
  alerte,
  etiquettes,
  reporterSelectKey,
  showEmailAction,
  emailLoading,
  onOpenContact,
  onOpenHistorique,
  onTraiter,
  onReporter,
  onEnvoyerEmail,
  onPlanifierRdv,
  onCreateTache,
  onSupprimer,
  onOpenEtiquettesTab,
}: {
  alerte: AlerteWithContact;
  etiquettes: EtiquetteWithCount[];
  reporterSelectKey: number;
  showEmailAction: boolean;
  emailLoading: boolean;
  onOpenContact?: (contactId: number) => void;
  onOpenHistorique?: (contactId: number) => void;
  onTraiter: () => void;
  onReporter: (mois: number) => void;
  onEnvoyerEmail: () => void;
  onPlanifierRdv?: () => void;
  onCreateTache?: () => void;
  onSupprimer: () => void;
  onOpenEtiquettesTab: () => void;
}) {
  const typeLabel = getTypeAlerteLabel(alerte.type_alerte);
  const lastContact = formatLastContact(alerte.date_dernier_contact);
  const alerteDate = formatAlerteDate(alerte.date_alerte);
  const name = contactDisplayName(alerte);
  const detailLabel = formatAlerteContactLabel(alerte.message, alerte.type_alerte);
  const showMessageDetail =
    detailLabel !== name && alerte.message.trim().length > 0;
  const trace = getAlerteTraceInfo(alerte);
  const linkedEtiquetteNom = getEtiquetteNomForAlerte(alerte.type_alerte);
  const linkedEtiquette = linkedEtiquetteNom
    ? etiquettes.find((e) => e.nom === linkedEtiquetteNom)
    : undefined;
  const showEtiquetteHint = linkedEtiquetteNom != null && !linkedEtiquette;
  const showLastContactLine =
    lastContact != null && !(alerte.type_alerte in ALERTE_ETIQUETTE_NOM);

  return (
    <article className="rounded-xl border border-border/70 bg-card overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <ContactInitialsAvatar
          prenom={alerte.contact_prenom}
          nom={alerte.contact_nom}
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground truncate">{name}</h3>
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
            {trace.daysOpen != null && trace.daysOpen > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 shrink-0 border-amber-300 text-amber-900 bg-amber-50"
              >
                +{trace.daysOpen} j
              </Badge>
            )}
            {alerteDate && (
              <span className="text-xs text-muted-foreground ml-auto shrink-0">
                {alerteDate}
              </span>
            )}
          </div>
          <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
            <p className="flex items-start gap-1.5 font-medium text-foreground/90">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {trace.rule}
            </p>
            <p>{trace.detail}</p>
            <p className="text-[10px] opacity-80">Source : {trace.source}</p>
          </div>
          {showLastContactLine && (
            <p className="text-xs text-muted-foreground mt-1">
              Dernier contact : {lastContact}
            </p>
          )}
          {showMessageDetail && (
            <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
              {alerte.message}
            </p>
          )}
          {showEtiquetteHint && (
            <AlerteEtiquetteHint
              typeAlerte={alerte.type_alerte}
              etiquettes={etiquettes}
              onOpenEtiquettesTab={onOpenEtiquettesTab}
            />
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {onOpenContact && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => onOpenContact(alerte.contact_id)}
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">Fiche</span>
            </Button>
          )}
          {onOpenHistorique && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => onOpenHistorique(alerte.contact_id)}
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Historique</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-0 border-t border-border/50 bg-muted/20">
        <Button type="button" size="sm" className="gap-1" onClick={onTraiter}>
          <Check className="h-4 w-4" />
          Traité
        </Button>

        <Select
          key={`reporter-${alerte.alerte_id}-${reporterSelectKey}`}
          onValueChange={(value) => onReporter(parseInt(value, 10))}
        >
          <SelectTrigger className="w-[180px] h-9 bg-background">
            <Clock className="h-4 w-4 mr-2 shrink-0" />
            <SelectValue placeholder="Reporter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Dans 3 mois</SelectItem>
            <SelectItem value="6">Dans 6 mois</SelectItem>
            <SelectItem value="12">Dans 12 mois</SelectItem>
          </SelectContent>
        </Select>

        {showEmailAction && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={emailLoading}
            onClick={onEnvoyerEmail}
          >
            <Mail className="h-4 w-4" />
            {emailLoading ? "Préparation…" : "Email"}
          </Button>
        )}

        {onPlanifierRdv && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={onPlanifierRdv}
          >
            <Calendar className="h-4 w-4" />
            Planifier RDV
          </Button>
        )}

        {onCreateTache && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={onCreateTache}
          >
            <ListTodo className="h-4 w-4" />
            Créer une tâche
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 sm:ml-auto"
          onClick={onSupprimer}
        >
          <X className="h-4 w-4" />
          Supprimer
        </Button>
      </div>
    </article>
  );
}
