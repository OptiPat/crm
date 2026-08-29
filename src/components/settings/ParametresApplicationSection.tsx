import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { ParametresAppBrandingSection } from "@/components/settings/ParametresAppBrandingSection";
import { ParametresBackgroundSection } from "@/components/settings/ParametresBackgroundSection";
import { ParametresLicenseSection } from "@/components/settings/ParametresLicenseSection";
import { CheckForUpdatesButton } from "@/components/system/AppUpdateChecker";
import { useAppUpdate } from "@/components/system/app-update-context";
import { ChangePasswordDialog } from "@/components/settings/ChangePasswordDialog";
import { SystemAuthSettings } from "@/components/settings/SystemAuthSettings";
import { AutoLockSettings } from "@/components/settings/AutoLockSettings";
import { Download, Lock, Shield } from "lucide-react";

export function ParametresApplicationSection() {
  const { pendingUpdate } = useAppUpdate();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  return (
    <div className="space-y-6">
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

      <ParametresLicenseSection />

      <ParametresAppBrandingSection />

      <ParametresBackgroundSection />

      <SettingsPanel
        title="Sécurité locale"
        description="Protection de l'accès au CRM sur ce poste."
      >
        <div className="space-y-4">
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
          <AutoLockSettings />
          <SystemAuthSettings />
        </div>
      </SettingsPanel>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </div>
  );
}
