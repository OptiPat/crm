import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

      <SettingsPanel title="Coordonnées" description="Email, téléphone et site — utilisés dans vos communications.">
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
          <SettingsRow label="Site web" hint="Optionnel — affichable dans le pied de page d'une newsletter (case à cocher par édition)" htmlFor="site_web">
            <Input
              id="site_web"
              type="url"
              placeholder="https://www.cabinet.fr"
              value={cgpConfig.site_web || ""}
              onChange={(e) => onConfigChange({ site_web: e.target.value })}
            />
          </SettingsRow>
        </SettingsGroup>
      </SettingsPanel>

      <SettingsPanel
        title="Adresse postale"
        description="Optionnelle — affichable en pied de page newsletter (case à cocher par édition)."
      >
        <SettingsGroup>
          <SettingsRow label="Adresse" htmlFor="adresse">
            <Input
              id="adresse"
              placeholder="12 rue de la Paix"
              value={cgpConfig.adresse || ""}
              onChange={(e) => onConfigChange({ adresse: e.target.value })}
            />
          </SettingsRow>
          <SettingsRow label="Code postal" htmlFor="code_postal">
            <Input
              id="code_postal"
              placeholder="75002"
              value={cgpConfig.code_postal || ""}
              onChange={(e) => onConfigChange({ code_postal: e.target.value })}
            />
          </SettingsRow>
          <SettingsRow label="Ville" htmlFor="ville">
            <Input
              id="ville"
              placeholder="Paris"
              value={cgpConfig.ville || ""}
              onChange={(e) => onConfigChange({ ville: e.target.value })}
            />
          </SettingsRow>
        </SettingsGroup>
      </SettingsPanel>

      <SettingsPanel
        id="parametres-documents-cif"
        title="Documents CIF"
        description="Informations légales utilisées dans les lettres de mission, rapports d'adéquation et pieds de page."
      >
        <SettingsGroup>
          <SettingsRow label="N° SIREN" htmlFor="cif_siren">
            <Input
              id="cif_siren"
              placeholder="843 139 148"
              value={cgpConfig.cif_siren || ""}
              onChange={(e) => onConfigChange({ cif_siren: e.target.value })}
            />
          </SettingsRow>
          <SettingsRow label="Ville RCS" htmlFor="cif_rcs_ville">
            <Input
              id="cif_rcs_ville"
              placeholder="Montpellier"
              value={cgpConfig.cif_rcs_ville || ""}
              onChange={(e) => onConfigChange({ cif_rcs_ville: e.target.value })}
            />
          </SettingsRow>
          <SettingsRow label="N° Anacofi CIF" htmlFor="cif_anacofi_numero">
            <Input
              id="cif_anacofi_numero"
              placeholder="E011507"
              value={cgpConfig.cif_anacofi_numero || ""}
              onChange={(e) => onConfigChange({ cif_anacofi_numero: e.target.value })}
            />
          </SettingsRow>
          <SettingsRow label="N° ORIAS" htmlFor="cif_orias">
            <Input
              id="cif_orias"
              placeholder="19000736"
              value={cgpConfig.cif_orias || ""}
              onChange={(e) => onConfigChange({ cif_orias: e.target.value })}
            />
          </SettingsRow>
          <SettingsRow
            label="Pied de page personnalisé"
            hint="Optionnel — remplace le modèle par défaut. Vous pouvez utiliser {{cgp_orias}}, {{cgp_siren}}, etc."
            htmlFor="cif_pied_de_page"
          >
            <Textarea
              id="cif_pied_de_page"
              rows={6}
              className="font-mono text-xs"
              placeholder="Laissez vide pour utiliser le pied de page SCPI par défaut…"
              value={cgpConfig.cif_pied_de_page || ""}
              onChange={(e) => onConfigChange({ cif_pied_de_page: e.target.value })}
            />
          </SettingsRow>
        </SettingsGroup>
      </SettingsPanel>
    </div>
  );
}
