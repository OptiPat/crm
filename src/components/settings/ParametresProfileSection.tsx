import { Input } from "@/components/ui/input";
import {
  ProfileHeroCard,
  SettingsGroup,
  SettingsPanel,
  SettingsRow,
} from "@/components/settings/parametres-ui";
import { CgpLogoUpload } from "@/components/settings/CgpLogoUpload";
import { useCgpLogoPreview } from "@/hooks/useCgpLogoPreview";
import {
  getCompletionPercent,
  getDisplayName,
  getInitials,
  getSetupChecklist,
} from "@/lib/settings/parametres-completion";
import type { CgpConfig } from "@/lib/api/tauri-settings";

type ParametresProfileSectionProps = {
  cgpConfig: CgpConfig;
  onConfigChange: (patch: Partial<CgpConfig>) => void;
  emailConnected?: boolean;
};

export function ParametresProfileSection({
  cgpConfig,
  onConfigChange,
  emailConnected = false,
}: ParametresProfileSectionProps) {
  const { src: heroLogoSrc } = useCgpLogoPreview(cgpConfig.logo_path);

  const profileItems = getSetupChecklist(cgpConfig, emailConnected).filter(
    (i) => i.section === "profil"
  );
  const profileCompletion = getCompletionPercent(profileItems);
  const subtitle = [cgpConfig.cabinet, cgpConfig.email].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <ProfileHeroCard
        initials={getInitials(cgpConfig)}
        displayName={getDisplayName(cgpConfig)}
        subtitle={subtitle}
        completionPercent={profileCompletion}
        logoSrc={heroLogoSrc}
      />

      <SettingsPanel
        title="Logo & identité visuelle"
        description="Personnalisez l'affichage de votre cabinet dans le CRM."
      >
        <CgpLogoUpload
          logoPath={cgpConfig.logo_path}
          fallbackInitials={getInitials(cgpConfig)}
          onLogoPathChange={(path) => onConfigChange({ logo_path: path })}
          onLogoRemoved={() => onConfigChange({ logo_path: "" })}
        />
      </SettingsPanel>

      <SettingsPanel
        title="Identité"
        description="Utilisée dans les emails, la signature et l'affichage du conseiller."
      >
        <SettingsGroup>
          <SettingsRow label="Prénom" htmlFor="prenom">
            <Input
              id="prenom"
              placeholder="Jean"
              value={cgpConfig.prenom || ""}
              onChange={(e) => onConfigChange({ prenom: e.target.value })}
            />
          </SettingsRow>
          <SettingsRow label="Nom" htmlFor="nom">
            <Input
              id="nom"
              placeholder="Dupont"
              value={cgpConfig.nom || ""}
              onChange={(e) => onConfigChange({ nom: e.target.value })}
            />
          </SettingsRow>
          <SettingsRow label="Cabinet / société" hint="Raison sociale affichée aux clients" htmlFor="cabinet">
            <Input
              id="cabinet"
              placeholder="Cabinet Dupont Patrimoine"
              value={cgpConfig.cabinet || ""}
              onChange={(e) => onConfigChange({ cabinet: e.target.value })}
            />
          </SettingsRow>
        </SettingsGroup>
      </SettingsPanel>

      <SettingsPanel title="Coordonnées" description="Email et téléphone insérés dans vos communications.">
        <SettingsGroup>
          <SettingsRow label="Email professionnel" htmlFor="email">
            <Input
              id="email"
              type="email"
              placeholder="jean.dupont@cabinet.fr"
              value={cgpConfig.email || ""}
              onChange={(e) => onConfigChange({ email: e.target.value })}
            />
          </SettingsRow>
          <SettingsRow label="Téléphone" htmlFor="telephone">
            <Input
              id="telephone"
              placeholder="01 23 45 67 89"
              value={cgpConfig.telephone || ""}
              onChange={(e) => onConfigChange({ telephone: e.target.value })}
            />
          </SettingsRow>
        </SettingsGroup>
      </SettingsPanel>
    </div>
  );
}
