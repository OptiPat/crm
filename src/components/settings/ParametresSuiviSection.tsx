import { SettingsPanel } from "@/components/settings/parametres-ui";
import { AgendaLinksEditor } from "@/components/settings/AgendaLinksEditor";
import type { CgpConfig } from "@/lib/api/tauri-settings";

type ParametresSuiviSectionProps = {
  cgpConfig: CgpConfig;
  onConfigChange: (patch: Partial<CgpConfig>) => void;
};

export function ParametresSuiviSection({ cgpConfig, onConfigChange }: ParametresSuiviSectionProps) {
  return (
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
  );
}
