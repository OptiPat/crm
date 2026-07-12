import { SettingsPanel } from "@/components/settings/parametres-ui";
import { AgendaLinksEditor } from "@/components/settings/AgendaLinksEditor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Video } from "lucide-react";
import type { CgpConfig } from "@/lib/api/tauri-settings";

type ParametresSuiviSectionProps = {
  cgpConfig: CgpConfig;
  onConfigChange: (patch: Partial<CgpConfig>) => void;
};

export function ParametresSuiviSection({ cgpConfig, onConfigChange }: ParametresSuiviSectionProps) {
  return (
    <SettingsPanel
      title="Agenda & RDV"
      description="Liens Google Agenda pour vos templates. Lien Zoom/Teams pour les RDV visio (Google Meet se crée seul)."
    >
      <div className="space-y-8">
        <AgendaLinksEditor
          links={cgpConfig.agenda_links ?? []}
          onChange={(agenda_links) => onConfigChange({ agenda_links })}
          embedded
        />

        <div className="space-y-2 rounded-xl border border-border/80 bg-background p-4 shadow-sm">
          <Label className="text-base flex items-center gap-1.5">
            <Video className="h-4 w-4 text-muted-foreground" />
            Lien Zoom / Teams
          </Label>
          <p className="text-sm text-muted-foreground">
            Votre salle permanente Zoom ou Microsoft Teams — préremplie à chaque RDV visio.
            Google Meet n&apos;a pas besoin d&apos;être renseigné ici : le lien se crée
            automatiquement dans Google Agenda.
          </p>
          <Input
            type="url"
            value={cgpConfig.default_visio_link ?? ""}
            onChange={(e) =>
              onConfigChange({ default_visio_link: e.target.value.trim() || null })
            }
            placeholder="https://zoom.us/j/… ou https://teams.microsoft.com/l/meetup-join/…"
          />
        </div>

        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Emails RDV Pipe</p>
          <p className="mt-1">
            Configurez les modèles dans <strong>Modèles email → onglet Pipe RDV</strong> : choisissez
            les étapes (R1, R2, R3), le message de confirmation et un rappel planifié (ex. 24 h
            avant). Variables :{" "}
            <code className="text-xs">{"{{date_rdv}}"}</code>,{" "}
            <code className="text-xs">{"{{lien_visio}}"}</code>,{" "}
            <code className="text-xs">{"{{co_contact}}"}</code>…
          </p>
        </div>
      </div>
    </SettingsPanel>
  );
}
