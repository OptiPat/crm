import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { ParametresAppBrandingSection } from "@/components/settings/ParametresAppBrandingSection";
import { ParametresLicenseSection } from "@/components/settings/ParametresLicenseSection";
import { CheckForUpdatesButton } from "@/components/system/AppUpdateChecker";
import { useAppUpdate } from "@/components/system/app-update-context";
import { ChangePasswordDialog } from "@/components/settings/ChangePasswordDialog";
import { Bell, Download, Lock, Shield } from "lucide-react";

export function ParametresApplicationSection() {
  const { pendingUpdate } = useAppUpdate();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  return (
    <div className="space-y-6">
      <ParametresLicenseSection />

      <ParametresAppBrandingSection />

      <SettingsPanel
        title="Mises à jour"
        description="Vérification au démarrage. Vos données restent sur cet ordinateur."
        action={
          pendingUpdate ? (
            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 font-normal">
              {pendingUpdate.version} disponible
            </Badge>
          ) : null
        }
      >
        <div className="space-y-4">
          <CheckForUpdatesButton />
          <p className="text-xs text-muted-foreground flex items-start gap-2">
            <Download className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Un backup SQLite (base + dossier documents PDF) est créé automatiquement avant chaque
            migration de schéma, et au plus une fois par jour.
          </p>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Sécurité locale"
        description="Protection de l'accès au CRM sur ce poste."
      >
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <Shield className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="space-y-3 flex-1">
            <p className="text-sm text-muted-foreground">
              L'accès à l'application est protégé par un mot de passe sur ce poste.
              Vos données restent stockées localement sur cet ordinateur.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChangePasswordOpen(true)}
            >
              <Lock className="h-4 w-4 mr-1.5" />
              Changer le mot de passe
            </Button>
          </div>
        </div>
      </SettingsPanel>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />

      <SettingsPanel title="Notifications" description="Rappels et alertes dans le CRM.">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-foreground">
              Les alertes actives sont centralisées dans{" "}
              <span className="font-medium">Suivi → Alertes</span>.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              La personnalisation fine des notifications (email desktop, sons, filtres) sera ajoutée
              ultérieurement.
            </p>
            <Badge variant="outline" className="mt-3 font-normal">
              À venir
            </Badge>
          </div>
        </div>
      </SettingsPanel>
    </div>
  );
}
