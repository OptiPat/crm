import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SettingsPanel, SettingsRow } from "@/components/settings/parametres-ui";
import { AgendaLinksEditor } from "@/components/settings/AgendaLinksEditor";
import type { CgpConfig } from "@/lib/api/tauri-settings";

const RELANCE_PRESETS = [3, 5, 7, 14, 21, 30] as const;

type ParametresSuiviSectionProps = {
  cgpConfig: CgpConfig;
  onConfigChange: (patch: Partial<CgpConfig>) => void;
};

export function ParametresSuiviSection({ cgpConfig, onConfigChange }: ParametresSuiviSectionProps) {
  const days = cgpConfig.email_suivi_delai_jours ?? 5;

  return (
    <div className="space-y-6">
      <SettingsPanel
        title="Relances automatiques"
        description="Délai avant proposition de relance dans Suivi → Envois, sans réponse mail ni RDV."
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Délai sans retour client</p>
          <div className="flex flex-wrap gap-2">
            {RELANCE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onConfigChange({ email_suivi_delai_jours: preset })}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm font-medium transition-all",
                  days === preset
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background hover:border-primary/40 hover:bg-muted/50"
                )}
              >
                {preset} j
              </button>
            ))}
          </div>
          <SettingsRow label="Valeur personnalisée" hint="Entre 1 et 90 jours" htmlFor="email_suivi_delai">
            <div className="flex items-center gap-2 max-w-[200px]">
              <Input
                id="email_suivi_delai"
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) =>
                  onConfigChange({
                    email_suivi_delai_jours: Math.min(
                      90,
                      Math.max(1, parseInt(e.target.value, 10) || 5)
                    ),
                  })
                }
              />
              <span className="text-sm text-muted-foreground shrink-0">jours</span>
            </div>
          </SettingsRow>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Liens Google Agenda"
        description="Pages de prise de RDV référencées dans vos templates via {{lien_agenda}}."
      >
        <AgendaLinksEditor
          links={cgpConfig.agenda_links ?? []}
          onChange={(agenda_links) => onConfigChange({ agenda_links })}
          embedded
        />
      </SettingsPanel>
    </div>
  );
}
