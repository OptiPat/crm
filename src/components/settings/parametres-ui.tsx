import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import type { SettingsSectionId } from "@/lib/settings/parametres-completion";

export type SettingsNavItem = {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
};

type SettingsShellProps = {
  header: ReactNode;
  nav: SettingsNavItem[];
  activeSection: SettingsSectionId;
  onSectionChange: (id: SettingsSectionId) => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function SettingsShell({
  header,
  nav,
  activeSection,
  onSectionChange,
  children,
  footer,
}: SettingsShellProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {header}

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <aside className="lg:w-[220px] shrink-0">
          <nav
            className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0 lg:sticky lg:top-0"
            aria-label="Sections des paramètres"
          >
            {nav.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSectionChange(item.id)}
                  className={cn(
                    "flex min-w-[140px] lg:min-w-0 items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                    "hover:border-primary/30 hover:bg-card",
                    active
                      ? "border-primary/40 bg-card shadow-sm ring-1 ring-primary/15"
                      : "border-transparent bg-muted/40 lg:bg-transparent"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-sm font-medium leading-tight",
                        active ? "text-primary" : "text-foreground"
                      )}
                    >
                      {item.label}
                    </span>
                    <span className="hidden lg:block text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 space-y-6 pb-4">{children}</div>
      </div>

      {footer}
    </div>
  );
}

export function SettingsPageHeader({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge?: ReactNode;
}) {
  return (
    <header className="border-b border-border/60 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary tracking-tight">{title}</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl">{description}</p>
        </div>
        {badge}
      </div>
    </header>
  );
}

export function SettingsPanel({
  id,
  title,
  description,
  children,
  className,
  action,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden scroll-mt-6",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4 bg-muted/20">
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export function SettingsGroup({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {title && (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      )}
      <div className="rounded-xl border border-border/70 divide-y overflow-hidden bg-background">
        {children}
      </div>
    </div>
  );
}

export function SettingsRow({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,200px)_1fr] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-foreground leading-snug"
        >
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SettingsLoading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function SettingsSaveBar({
  visible,
  saving,
  onSave,
  onDiscard,
}: {
  visible: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-30 w-[min(32rem,calc(100%-2rem))] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-card/95 px-4 py-3 shadow-lg backdrop-blur-md supports-[backdrop-filter]:bg-card/90">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
        </span>
        <p className="flex-1 text-sm font-medium">Modifications non enregistrées</p>
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
            Annuler
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Enregistrement
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-1.5" />
                Enregistrer
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProfileHeroCard({
  initials,
  displayName,
  subtitle,
  completionPercent,
  logoSrc,
  children,
}: {
  initials: string;
  displayName: string;
  subtitle: string;
  completionPercent: number;
  /** URL asset locale (convertFileSrc) */
  logoSrc?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary via-primary to-[hsl(221_70%_18%)] text-primary-foreground shadow-md">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-12 left-1/3 h-32 w-32 rounded-full bg-[#C9A227]/10"
        aria-hidden
      />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-5 p-6">
        <div
          className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-2xl overflow-hidden shadow-md ring-2 ring-white/30 bg-white"
          aria-hidden
        >
          {logoSrc ? (
            <img
              src={logoSrc}
              alt=""
              className="max-h-[3.5rem] max-w-[3.5rem] w-auto h-auto object-contain p-1.5"
            />
          ) : (
            <span className="text-2xl font-serif font-bold text-primary">{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-serif font-bold tracking-tight truncate">{displayName}</h3>
          <p className="text-sm text-primary-foreground/80 mt-0.5 truncate">{subtitle || "Complétez votre profil"}</p>
          <div className="mt-4 space-y-1.5 max-w-md">
            <div className="flex justify-between text-xs text-primary-foreground/70">
              <span>Configuration</span>
              <span className="tabular-nums font-medium">{completionPercent} %</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#C9A227] transition-all duration-500"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatusTile({
  title,
  value,
  subtitle,
  icon: Icon,
  accentColor,
  iconBg,
  iconColor,
  onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  accentColor: string;
  iconBg: string;
  iconColor: string;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border/80 bg-card p-4 text-left shadow-sm transition-shadow",
        onClick && "hover:shadow-md hover:border-primary/25 cursor-pointer w-full"
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-lg font-serif font-bold text-primary mt-1 leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{subtitle}</p>
        </div>
        <div className={cn("p-2 rounded-xl shrink-0", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
    </Wrapper>
  );
}
