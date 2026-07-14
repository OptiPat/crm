import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTemplateCategoryMeta } from "@/lib/emails/template-email-meta";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Etiquette } from "@/lib/api/tauri-etiquettes";
import {
  getTemplateActivationFlags,
  getTemplateActivationPreviewHint,
  getTemplateRelanceBadgeLabel,
  getTemplatePipeRdvBadgeLabel,
  getTemplatePlacementConformeBadgeLabel,
  getEphemeralCampaignBadgeLabel,
  getTemplateTriggerShortLabel,
  TEMPLATE_ACTIVATION_MODE_OPTIONS,
  type TemplateActivationFlags,
  type TemplateActivationStatFilter,
} from "@/lib/emails/template-email-activation";
import type {
  TemplatesEmailActiveFilterChip,
  TemplatesEmailActiveFilterId,
} from "@/lib/emails/templates-email-active-filters";
import type { ContactRegistre } from "@/lib/emails/template-email-formality";
import { parseTemplateEmailAttachments } from "@/lib/emails/template-email-attachments";
import type { EmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { navigateToSuivi } from "@/lib/navigation/suivi-navigation";
import { requestOpenParametres } from "@/lib/navigation/app-navigation";
import {
  ArrowRight,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Copy,
  Mail,
  MessageCircle,
  Paperclip,
  Pencil,
  RefreshCw,
  Tag,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { PARAMETRES_PATH } from "@/lib/settings/parametres-labels";

/** Statut boîte mail discret (barre d’actions Modèles email). */
export function TemplatesEmailMailboxStatus({
  emailStatus,
  onNavigate,
  currentPage,
}: {
  emailStatus: EmailConnectionStatus | null;
  onNavigate?: (page: string) => void;
  currentPage?: string;
}) {
  const connected = Boolean(emailStatus?.connected && emailStatus.method === "oauth");
  const providerLabel =
    emailStatus?.provider === "google"
      ? "Google"
      : emailStatus?.provider === "microsoft"
        ? "Microsoft"
        : null;

  if (!connected) {
    if (!onNavigate) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-800">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Boîte non connectée
        </span>
      );
    }
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-amber-800 hover:text-amber-950 hover:underline"
        onClick={() =>
          requestOpenParametres("email-connexion", {
            currentPage,
            setCurrentPage: onNavigate,
          })
        }
      >
        <AlertTriangle className="h-3 w-3 shrink-0" />
        Boîte non connectée
      </button>
    );
  }

  return (
    <span
      className="inline-flex max-w-[min(100%,14rem)] items-center gap-1.5 text-xs text-muted-foreground"
      title={emailStatus?.email ?? undefined}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
      <span className="truncate">
        {providerLabel ?? "OAuth"}
        {emailStatus?.email ? ` · ${emailStatus.email}` : ""}
      </span>
    </span>
  );
}

export function TemplatesEmailDeliveryBanner({
  emailStatus,
  onNavigate,
  currentPage,
}: {
  emailStatus: EmailConnectionStatus | null;
  onNavigate?: (page: string) => void;
  currentPage?: string;
}) {
  const connected = Boolean(emailStatus?.connected && emailStatus.method === "oauth");

  if (connected || !onNavigate) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2">
      <p className="text-xs text-amber-900 flex items-center gap-1.5 min-w-0 flex-1">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>
          Connectez votre boîte dans <strong>{PARAMETRES_PATH.emailConnexion}</strong> pour envoyer
          depuis Suivi → Envois.
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 h-8"
          onClick={() =>
            requestOpenParametres("email-connexion", {
              currentPage,
              setCurrentPage: onNavigate,
            })
          }
        >
          Configurer OAuth
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 h-8 text-muted-foreground"
          onClick={() =>
            navigateToSuivi(onNavigate, "envois", "ready", undefined, "templates-email")
          }
        >
          Suivi → Envois
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function TemplatesEmailHelp() {
  return (
    <details className="group rounded-xl border bg-muted/20 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        <Mail className="h-4 w-4 text-primary shrink-0" />
        À quoi servent les modèles ?
        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 space-y-2 text-xs text-muted-foreground leading-relaxed border-t pt-3">
        <p>
          <strong className="text-foreground">1. Créer</strong> un modèle ici (vouvoiement + onglet{" "}
          <strong className="text-foreground">Tutoiement</strong> pour lier une variante). Variables{" "}
          {"{{prenom}}"}, etc.
        </p>
        <p>
          <strong className="text-foreground">2. Déclencheur</strong> (onglet du modèle) : événement
          ex. nouvelle souscription + délai/heure — <em>sans créer d&apos;étiquette</em>.
        </p>
        <p>
          <strong className="text-foreground">3. Étiquettes</strong> (optionnel) : liez le modèle
          pour les campagnes classiques par étiquette.
        </p>
        <p>
          <strong className="text-foreground">4. Envoyer</strong> depuis Suivi → Envois (CRM ouvert,
          compte email connecté).
        </p>
      </div>
    </details>
  );
}

function TemplateSouscriptionDuplicateBadge({ title }: { title?: string }) {
  return (
    <TemplateActivationBadge
      className="border-amber-300 bg-amber-50 text-amber-950"
      title={title}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" />
      Doublon possible
    </TemplateActivationBadge>
  );
}

function TemplateActivationBadge({
  className,
  children,
  title,
}: {
  className: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}

export function TemplateActivationBadges({
  template,
  etiquetteLinkCount,
  souscriptionDuplicateWarning,
}: {
  template: TemplateEmail;
  etiquetteLinkCount: number;
  souscriptionDuplicateWarning?: string;
}) {
  const flags = getTemplateActivationFlags(template, etiquetteLinkCount);
  const attachmentCount = parseTemplateEmailAttachments(template.variables).length;
  const triggerLabel = getTemplateTriggerShortLabel(template);
  const relanceLabel = getTemplateRelanceBadgeLabel(template);
  const pipeRdvLabel = getTemplatePipeRdvBadgeLabel(template);
  const placementConformeLabel = getTemplatePlacementConformeBadgeLabel(template);
  const ephemeralLabel = getEphemeralCampaignBadgeLabel(template);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ephemeralLabel ? (
        <TemplateActivationBadge className="border-violet-300 bg-violet-50 text-violet-950">
          <Mail className="h-3 w-3 shrink-0" />
          {ephemeralLabel}
        </TemplateActivationBadge>
      ) : null}
      {souscriptionDuplicateWarning ? (
        <TemplateSouscriptionDuplicateBadge title={souscriptionDuplicateWarning} />
      ) : null}
      {attachmentCount > 0 && (
        <TemplateActivationBadge className="border-slate-200 bg-slate-50 text-slate-800">
          <Paperclip className="h-3 w-3 shrink-0" />
          {attachmentCount} PJ
        </TemplateActivationBadge>
      )}
      {flags.hasTrigger && triggerLabel && (
        <TemplateActivationBadge className="border-amber-200 bg-amber-50 text-amber-900">
          <Zap className="h-3 w-3 shrink-0" />
          {triggerLabel}
        </TemplateActivationBadge>
      )}
      {flags.hasEtiquetteLink && (
        <TemplateActivationBadge className="border-sky-200 bg-sky-50 text-sky-900">
          <Tag className="h-3 w-3 shrink-0" />
          {etiquetteLinkCount} étiquette{etiquetteLinkCount > 1 ? "s" : ""}
        </TemplateActivationBadge>
      )}
      {relanceLabel && (
        <TemplateActivationBadge className="border-orange-200 bg-orange-50 text-orange-900">
          <RefreshCw className="h-3 w-3 shrink-0" />
          {relanceLabel}
        </TemplateActivationBadge>
      )}
      {pipeRdvLabel && (
        <TemplateActivationBadge className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CalendarClock className="h-3 w-3 shrink-0" />
          {pipeRdvLabel}
        </TemplateActivationBadge>
      )}
      {placementConformeLabel && (
        <TemplateActivationBadge className="border-teal-200 bg-teal-50 text-teal-900">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          {placementConformeLabel}
        </TemplateActivationBadge>
      )}
      {flags.hasTutoiement && (
        <TemplateActivationBadge className="border-violet-200 bg-violet-50 text-violet-900">
          <MessageCircle className="h-3 w-3 shrink-0" />
          Tu
        </TemplateActivationBadge>
      )}
      {flags.isLibraryOnly && (
        <TemplateActivationBadge className="border-border bg-muted/40 text-muted-foreground">
          Sans canal
        </TemplateActivationBadge>
      )}
    </div>
  );
}

export function TemplatePreviewActivationStatus({
  template,
  linkedEtiquettes,
  flags,
  onOpenEtiquette,
  souscriptionDuplicateWarning,
}: {
  template: TemplateEmail;
  linkedEtiquettes: Etiquette[];
  flags: TemplateActivationFlags;
  onOpenEtiquette?: (etiquetteId: number) => void;
  souscriptionDuplicateWarning?: string;
}) {
  return (
    <div className="space-y-2">
      {souscriptionDuplicateWarning ? (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
          {souscriptionDuplicateWarning}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {getTemplateActivationPreviewHint(flags)}
      </p>
      <TemplateActivationBadges
        template={template}
        etiquetteLinkCount={linkedEtiquettes.length}
      />
      {linkedEtiquettes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {linkedEtiquettes.map((e) => {
            const chipClassName =
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors";
            const chipStyle = {
              borderColor: `${e.couleur}55`,
              backgroundColor: `${e.couleur}18`,
            };
            if (onOpenEtiquette) {
              return (
                <button
                  key={e.id}
                  type="button"
                  className={cn(
                    chipClassName,
                    "hover:ring-1 hover:ring-primary/30 cursor-pointer"
                  )}
                  style={chipStyle}
                  onClick={() => onOpenEtiquette(e.id)}
                  title="Ouvrir la fiche étiquette"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: e.couleur }}
                  />
                  {e.nom}
                </button>
              );
            }
            return (
              <span key={e.id} className={chipClassName} style={chipStyle}>
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: e.couleur }}
                />
                {e.nom}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TemplateActivationModeFilters({
  active,
  onChange,
}: {
  active: TemplateActivationStatFilter | null;
  onChange: (id: TemplateActivationStatFilter | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Mode d&apos;activation
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            active == null
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted/50"
          )}
        >
          Tous
        </button>
        {TEMPLATE_ACTIVATION_MODE_OPTIONS.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(active === mode.id ? null : mode.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active === mode.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/50"
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TemplatesEmailActiveFilterChips({
  chips,
  onRemove,
  onReset,
}: {
  chips: TemplatesEmailActiveFilterChip[];
  onRemove: (id: TemplatesEmailActiveFilterId) => void;
  onReset: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
      <span className="text-muted-foreground shrink-0">Filtres actifs :</span>
      {chips.map((chip) => (
        <button
          key={`${chip.id}-${chip.label}`}
          type="button"
          className="inline-flex items-center gap-1 rounded-full bg-background border px-2 py-0.5 text-xs font-medium hover:bg-muted/60 transition-colors"
          onClick={() => onRemove(chip.id)}
          aria-label={`Retirer le filtre ${chip.label}`}
        >
          {chip.label}
          <X className="h-3 w-3 opacity-60" />
        </button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-xs ml-auto gap-1"
        onClick={onReset}
      >
        <X className="h-3.5 w-3.5" />
        Tout effacer
      </Button>
    </div>
  );
}

export function TemplatePreviewContactControls({
  contacts,
  previewContactId,
  onPreviewContactIdChange,
  previewRegistre,
  onPreviewRegistreChange,
  showRegistreToggle,
}: {
  contacts: Contact[];
  previewContactId: string;
  onPreviewContactIdChange: (value: string) => void;
  previewRegistre: ContactRegistre;
  onPreviewRegistreChange: (value: ContactRegistre) => void;
  showRegistreToggle: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Aperçu sur</Label>
        <Select value={previewContactId} onValueChange={onPreviewContactIdChange}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sample">Marie Dupont (exemple)</SelectItem>
            {contacts.slice(0, 200).map((contact) => (
              <SelectItem key={contact.id} value={String(contact.id)}>
                {contact.prenom} {contact.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showRegistreToggle && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Registre (exemple)</Label>
          <Select
            value={previewRegistre}
            onValueChange={(value) => onPreviewRegistreChange(value as ContactRegistre)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="VOUS">Vouvoiement</SelectItem>
              <SelectItem value="TU">Tutoiement</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

export function TemplateCategoryFilters({
  categories,
  active,
  counts,
  onChange,
}: {
  categories: { id: string; label: string }[];
  active: string;
  counts: Record<string, number>;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={cn(
          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
          active === "all"
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-muted/50"
        )}
      >
        Tous
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            active === c.id
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted/50"
          )}
        >
          {c.label}
          {counts[c.id] != null && counts[c.id] > 0 ? ` (${counts[c.id]})` : ""}
        </button>
      ))}
    </div>
  );
}

export function TemplateListRow({
  template,
  selected,
  etiquetteLinkCount = 0,
  souscriptionDuplicateWarning,
  onSelect,
  onEdit,
  onDuplicate,
  onDeleteRequest,
}: {
  template: TemplateEmail;
  selected: boolean;
  etiquetteLinkCount?: number;
  souscriptionDuplicateWarning?: string;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDeleteRequest: () => void;
}) {
  const meta = getTemplateCategoryMeta(template.categorie);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "p-3 border rounded-xl transition-all text-left w-full",
        "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/15 shadow-sm" : "bg-card"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium truncate">{template.nom}</span>
            <Badge className={cn("text-[10px]", meta.badgeClass)}>{meta.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1 mb-1.5">
            {template.sujet || "—"}
          </p>
          <TemplateActivationBadges
            template={template}
            etiquetteLinkCount={etiquetteLinkCount}
            souscriptionDuplicateWarning={souscriptionDuplicateWarning}
          />
        </div>
        <div
          className="flex gap-0.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Modifier">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onDuplicate} aria-label="Dupliquer">
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDeleteRequest}
            aria-label="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TemplatePreviewActions({
  onEdit,
  onDuplicate,
  children,
}: {
  onEdit: () => void;
  onDuplicate: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="gap-1.5" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Modifier
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
          Dupliquer
        </Button>
      </div>
      {children}
    </div>
  );
}
