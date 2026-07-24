import { useCallback, useEffect, useState } from "react";
import { Cloud, Database, Loader2, PlugZap, ShieldAlert, Unplug, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { useTeamWorkspace } from "@/components/team/TeamWorkspaceProvider";
import {
  connectMicrosoftTeamOAuth,
  disconnectMicrosoftTeamOAuth,
  getMicrosoftTeamConnectionStatus,
  previewTeamMigration,
  saveWorkspaceConfig,
  testMicrosoftTeamSharePointConnection,
  uploadTeamMigrationSnapshot,
  validateTeamRemoteSnapshot,
  type MicrosoftTeamConnectionStatus,
} from "@/lib/api/tauri-team";
import { provisionTeamWorkspace } from "@/lib/api/tauri-team-collaboration";
import { getOAuthAppSettings, saveMicrosoftOAuthClientId } from "@/lib/api/tauri-email-oauth";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import type {
  TeamRole,
  TeamMigrationPreview,
  TeamMigrationUploadReport,
  TeamMigrationValidateReport,
  WorkspaceConfig,
} from "@/lib/team/team-capabilities";
import { toast } from "sonner";

export function TeamWorkspaceSettingsPanel() {
  const { config, teamConfigured, capabilities, authorityError, refresh } = useTeamWorkspace();
  const canManage = capabilities.canManageMembers;

  const [connection, setConnection] = useState<MicrosoftTeamConnectionStatus | null>(null);
  const [microsoftClientId, setMicrosoftClientId] = useState("");
  const [clientIdConfigured, setClientIdConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [savingClientId, setSavingClientId] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingSharePoint, setTestingSharePoint] = useState(false);
  const [provisioningSharePoint, setProvisioningSharePoint] = useState(false);
  const [preparingMigration, setPreparingMigration] = useState(false);
  const [uploadingMigration, setUploadingMigration] = useState(false);
  const [validatingRestore, setValidatingRestore] = useState(false);
  const [migrationPreview, setMigrationPreview] = useState<TeamMigrationPreview | null>(null);
  const [migrationUploadReport, setMigrationUploadReport] =
    useState<TeamMigrationUploadReport | null>(null);
  const [migrationValidateReport, setMigrationValidateReport] =
    useState<TeamMigrationValidateReport | null>(null);

  const [teamEnabled, setTeamEnabled] = useState(false);
  const [role, setRole] = useState<TeamRole>("advisor");
  const [siteHostname, setSiteHostname] = useState("");
  const [sitePath, setSitePath] = useState("");
  const [siteId, setSiteId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [officeMailboxEmail, setOfficeMailboxEmail] = useState("");
  const [advisorGroupId, setAdvisorGroupId] = useState("");
  const [secretaryGroupId, setSecretaryGroupId] = useState("");

  const syncFormFromConfig = useCallback((next: WorkspaceConfig) => {
    setTeamEnabled(next.mode === "team_sharepoint");
    setRole(next.role ?? "advisor");
    setSiteHostname(next.siteHostname ?? "");
    setSitePath(next.sitePath ?? "");
    setSiteId(next.siteId ?? "");
    setSiteName(next.siteName ?? "");
    setOfficeMailboxEmail(next.officeMailboxEmail ?? "");
    setAdvisorGroupId(next.advisorGroupId ?? "");
    setSecretaryGroupId(next.secretaryGroupId ?? "");
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [status, oauthSettings] = await Promise.all([
        getMicrosoftTeamConnectionStatus(),
        getOAuthAppSettings(),
      ]);
      setConnection(status);
      setMicrosoftClientId(oauthSettings.microsoft_client_id ?? "");
      setClientIdConfigured(Boolean(oauthSettings.microsoft_client_id?.trim()));
    } catch (error) {
      console.error(error);
      toast.error(invokeErrorMessage(error) || "Impossible de charger le mode équipe.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    syncFormFromConfig(config);
  }, [config, syncFormFromConfig]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleSaveClientId = async () => {
    const trimmed = microsoftClientId.trim();
    if (!trimmed) {
      toast.error("Collez le Client ID Azure (UUID).");
      return;
    }
    setSavingClientId(true);
    try {
      await saveMicrosoftOAuthClientId(trimmed);
      await refreshAll();
      toast.success("Client ID Microsoft enregistré.");
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Enregistrement impossible.");
    } finally {
      setSavingClientId(false);
    }
  };

  const handleConnect = async () => {
    if (!clientIdConfigured && !microsoftClientId.trim()) {
      toast.error("Enregistrez d'abord le Client ID Microsoft (Azure).");
      return;
    }
    if (!clientIdConfigured) {
      setSavingClientId(true);
      try {
        await saveMicrosoftOAuthClientId(microsoftClientId.trim());
        await refreshAll();
      } catch (error) {
        toast.error(invokeErrorMessage(error) || "Enregistrement du Client ID impossible.");
        return;
      } finally {
        setSavingClientId(false);
      }
    }
    setConnecting(true);
    try {
      const next = await connectMicrosoftTeamOAuth({ forceConsent: false });
      setConnection(next);
      toast.success("Compte Microsoft équipe connecté.");
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Connexion impossible.");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectMicrosoftTeamOAuth();
      setConnection({ connected: false, email: null, expiresAt: null });
      toast.success("Compte Microsoft équipe déconnecté.");
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Déconnexion impossible.");
    }
  };

  const buildConfigPayload = (): WorkspaceConfig => {
    if (!teamEnabled) {
      return { mode: "local" };
    }
    return {
      mode: "team_sharepoint",
      role,
      siteHostname: siteHostname.trim() || null,
      sitePath: sitePath.trim() || null,
      siteId: siteId.trim() || null,
      siteName: siteName.trim() || null,
      officeMailboxEmail: officeMailboxEmail.trim() || null,
      advisorGroupId: advisorGroupId.trim() || null,
      secretaryGroupId: secretaryGroupId.trim() || null,
    };
  };

  const handleSaveConfig = async () => {
    if (teamEnabled && !connection?.connected) {
      toast.error("Connectez d'abord un compte Microsoft professionnel nominatif.");
      return;
    }
    setSavingConfig(true);
    try {
      await saveWorkspaceConfig(buildConfigPayload());
      await refresh();
      toast.success("Configuration équipe enregistrée.");
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Enregistrement impossible.");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestSharePoint = async () => {
    if (!connection?.connected) {
      toast.error("Connectez d'abord un compte Microsoft équipe.");
      return;
    }
    const hostname = siteHostname.trim();
    const path = sitePath.trim();
    if (!hostname || !path) {
      toast.error("Renseignez le hostname et le chemin du site SharePoint.");
      return;
    }
    setTestingSharePoint(true);
    try {
      const result = await testMicrosoftTeamSharePointConnection({
        siteHostname: hostname,
        sitePath: path,
      });
      setSiteId(result.siteId);
      setSiteName(result.siteName);
      toast.success(
        `Connexion OK — ${result.listCount} liste(s), ${result.driveCount} bibliothèque(s). Enregistrez pour conserver l'ID site.`
      );
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Test SharePoint impossible.");
    } finally {
      setTestingSharePoint(false);
    }
  };

  const handleProvisionSharePoint = async () => {

    if (!connection?.connected) {
      toast.error("Connectez d'abord un compte Microsoft équipe.");
      return;
    }
    if (!config.siteHostname?.trim() || !config.sitePath?.trim()) {
      toast.error("Enregistrez d'abord la configuration équipe (hostname et chemin du site).");
      return;
    }
    setProvisioningSharePoint(true);
    try {
      await provisionTeamWorkspace();
      await refresh();
      toast.success("Espace équipe provisionné (listes CRM sur SharePoint).");
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Provisionnement SharePoint impossible.");
    } finally {
      setProvisioningSharePoint(false);
    }
  };

  const handlePrepareMigration = async () => {
    if (!connection?.connected) {
      toast.error("Connectez d'abord un compte Microsoft équipe.");
      return;
    }
    if (!config.siteId?.trim()) {
      toast.error("Provisionnez d'abord l'espace équipe SharePoint.");
      return;
    }
    setPreparingMigration(true);
    try {
      const preview = await previewTeamMigration();
      setMigrationPreview(preview);
      setMigrationUploadReport(null);
      setMigrationValidateReport(null);
      toast.success("Aperçu migration généré (aucune donnée envoyée).");
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Préparation migration impossible.");
    } finally {
      setPreparingMigration(false);
    }
  };

  const handleUploadMigration = async () => {
    if (!migrationPreview) {
      toast.error("Générez d'abord l'aperçu migration.");
      return;
    }
    const confirmed = window.confirm(
      "Envoyer une copie test de vos données locales vers la liste CRM_Data SharePoint ?\n\n" +
        "Aucune bascule en mode synchronisation ne sera effectuée. " +
        "Les enregistrements déjà identiques seront ignorés. " +
        "En cas d'erreur, vous pourrez relancer l'envoi."
    );
    if (!confirmed) {
      return;
    }
    setUploadingMigration(true);
    try {
      const report = await uploadTeamMigrationSnapshot(migrationPreview.checksumSha256);
      setMigrationUploadReport(report);
      setMigrationValidateReport(null);
      if (report.complete) {
        toast.success(
          `Copie test envoyée — ${report.created} créé(s), ${report.updated} mis à jour, ${report.skipped} ignoré(s).`
        );
      } else {
        toast.error(
          `Envoi partiel — ${report.failed} échec(s). Consultez le rapport et relancez après correction.`
        );
      }
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Envoi SharePoint impossible.");
    } finally {
      setUploadingMigration(false);
    }
  };

  const handleValidateRestore = async () => {
    if (!migrationPreview) {
      toast.error("Générez d'abord l'aperçu migration.");
      return;
    }
    if (!migrationUploadReport?.complete) {
      toast.error("Terminez d'abord l'envoi SharePoint sans échec.");
      return;
    }
    const confirmed = window.confirm(
      "Valider la restauration test depuis SharePoint ?\n\n" +
        "Le CRM téléchargera la liste CRM_Data distante, reconstruira un snapshot " +
        "et vérifiera l'intégrité en mémoire uniquement.\n\n" +
        "Aucune donnée brute ne sera affichée. Aucune modification locale ni distante."
    );
    if (!confirmed) {
      return;
    }
    setValidatingRestore(true);
    try {
      const report = await validateTeamRemoteSnapshot(migrationPreview.checksumSha256);
      setMigrationValidateReport(report);
      if (report.valid) {
        toast.success(
          `Restauration test valide — ${report.totalRecords} enregistrement(s), checksum OK.`
        );
      } else {
        toast.error(
          `Validation échouée — ${report.errors.length} problème(s). Consultez le rapport.`
        );
      }
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Validation restauration impossible.");
    } finally {
      setValidatingRestore(false);
    }
  };

  const teamSwitchDisabled = teamConfigured && !canManage;

  if (loading) {
    return (
      <SettingsPanel title="Mode équipe SharePoint" description="Chargement…">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </SettingsPanel>
    );
  }

  return (
    <SettingsPanel
      title="Mode équipe SharePoint"
      description="Prototype : base partagée sur un site SharePoint d'équipe, avec rôles conseiller / secrétaire."
      action={<Users className="h-5 w-5 text-muted-foreground" aria-hidden />}
    >
      <div className="space-y-6">
        {authorityError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {authorityError}
          </div>
        ) : null}
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
          <div className="flex gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium">Identité Microsoft nominative requise</p>
              <p className="text-xs opacity-90">
                Utilisez un compte professionnel Microsoft 365 (tenant organisation).
                La MFA est un prérequis côté Microsoft Entra — elle n&apos;est pas vérifiée
                par le CRM.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Compte Microsoft équipe</p>
              <p className="text-xs text-muted-foreground">
                Flux OAuth distinct de l&apos;email personnel et de OneDrive clients.
              </p>
            </div>
            {connection?.connected ? (
              <Badge variant="secondary" className="gap-1">
                <Cloud className="h-3 w-3" />
                {connection.email ?? "Connecté"}
              </Badge>
            ) : (
              <Badge variant="outline">Non connecté</Badge>
            )}
          </div>

          <div className="grid gap-2 max-w-xl">
            <Label htmlFor="team-ms-client-id">Client ID Azure (application CRM)</Label>
            <Input
              id="team-ms-client-id"
              value={microsoftClientId}
              onChange={(event) => setMicrosoftClientId(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="font-mono text-sm"
              disabled={!canManage}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleSaveClientId()}
              disabled={savingClientId || !canManage}
            >
              Enregistrer Client ID
            </Button>
            <Button
              type="button"
              onClick={() => void handleConnect()}
              disabled={connecting || !canManage}
              className="gap-2"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlugZap className="h-4 w-4" />
              )}
              Connecter Microsoft
            </Button>
            {connection?.connected ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDisconnect()}
                disabled={!canManage}
                className="gap-2"
              >
                <Unplug className="h-4 w-4" />
                Déconnecter
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium">Activer le mode équipe SharePoint</p>
            <p className="text-xs text-muted-foreground">
              Désactivé par défaut — le CRM reste en mode local conseiller.
            </p>
          </div>
          <Switch
            checked={teamEnabled}
            onCheckedChange={setTeamEnabled}
            disabled={teamSwitchDisabled}
          />
        </div>

        {teamEnabled ? (
          <div className="grid gap-4 max-w-xl">
            <div className="grid gap-2">
              <Label htmlFor="team-role">Rôle sur cette installation</Label>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as TeamRole)}
                disabled={!canManage}
              >
                <SelectTrigger id="team-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="advisor">Conseiller</SelectItem>
                  <SelectItem value="secretary">Secrétaire</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Indication locale pour le premier paramétrage. Le rôle effectif est déterminé
                par votre appartenance aux groupes Microsoft Entra configurés ci-dessous.
                Le secrétaire ne peut pas exporter les données ni modifier cette configuration
                une fois le mode équipe activé.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="team-advisor-group-id">Groupe Entra — conseillers</Label>
              <Input
                id="team-advisor-group-id"
                value={advisorGroupId}
                onChange={(event) => setAdvisorGroupId(event.target.value)}
                placeholder="00000000-0000-0000-0000-000000000001"
                className="font-mono text-sm"
                disabled={!canManage}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="team-secretary-group-id">Groupe Entra — secrétaires</Label>
              <Input
                id="team-secretary-group-id"
                value={secretaryGroupId}
                onChange={(event) => setSecretaryGroupId(event.target.value)}
                placeholder="00000000-0000-0000-0000-000000000002"
                className="font-mono text-sm"
                disabled={!canManage}
              />
              <p className="text-xs text-muted-foreground">
                Identifiants UUID des groupes Microsoft Entra (Azure). Deux groupes distincts
                sont requis avant les opérations sensibles sur un espace SharePoint provisionné
                (export, migration, déconnexion OAuth, etc.). Seul un conseiller peut les
                configurer.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="team-office-mailbox">Boîte cabinet Microsoft 365</Label>
              <Input
                id="team-office-mailbox"
                type="email"
                value={officeMailboxEmail}
                onChange={(event) => setOfficeMailboxEmail(event.target.value)}
                placeholder="cabinet@example.com"
                disabled={!canManage}
              />
              <p className="text-xs text-muted-foreground">
                Boîte partagée du cabinet — requise pour l&apos;envoi en mode secrétaire.
                Le conseiller peut aussi choisir cette adresse à l&apos;envoi.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="team-site-hostname">Hostname SharePoint</Label>
              <Input
                id="team-site-hostname"
                value={siteHostname}
                onChange={(event) => setSiteHostname(event.target.value)}
                placeholder="cabinet.sharepoint.com"
                disabled={!canManage}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="team-site-path">Chemin du site</Label>
              <Input
                id="team-site-path"
                value={sitePath}
                onChange={(event) => setSitePath(event.target.value)}
                placeholder="/sites/crm-patrimoine"
                disabled={!canManage}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="team-site-id">ID site Graph (optionnel)</Label>
              <Input
                id="team-site-id"
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
                placeholder="contoso.sharepoint.com,guid,guid"
                className="font-mono text-sm"
                disabled={!canManage}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="team-site-name">Nom / espace d&apos;équipe</Label>
              <Input
                id="team-site-name"
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                placeholder="CRM Patrimoine — équipe"
                disabled={!canManage}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleTestSharePoint()}
                disabled={testingSharePoint || !canManage || !connection?.connected}
                className="gap-2"
              >
                {testingSharePoint ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Cloud className="h-4 w-4" />
                )}
                Tester SharePoint
              </Button>
              <Button
                type="button"
                onClick={() => void handleProvisionSharePoint()}
                disabled={
                  provisioningSharePoint ||
                  !canManage ||
                  !connection?.connected ||
                  !teamConfigured
                }
                className="gap-2"
              >
                {provisioningSharePoint ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                Provisionner listes CRM
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handlePrepareMigration()}
                disabled={
                  preparingMigration ||
                  !canManage ||
                  !connection?.connected ||
                  !config.siteId?.trim()
                }
                className="gap-2"
              >
                {preparingMigration ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                Préparer la migration
              </Button>
            </div>
            {migrationPreview ? (
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3 text-sm">
                <p className="font-medium">Aperçu migration (local, lecture seule)</p>
                <p className="text-xs text-muted-foreground">
                  Généré le {new Date(migrationPreview.generatedAt).toLocaleString("fr-FR")} —
                  schéma v{migrationPreview.schemaVersion}
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Enregistrements</dt>
                  <dd className="font-mono">{migrationPreview.totalRecords}</dd>
                  <dt className="text-muted-foreground">Checksum SHA-256</dt>
                  <dd className="font-mono break-all col-span-1">{migrationPreview.checksumSha256}</dd>
                </dl>
                {migrationPreview.tableCounts.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Tables exportables</p>
                    <ul className="max-h-40 overflow-y-auto text-xs font-mono space-y-0.5">
                      {migrationPreview.tableCounts.map((entry) => (
                        <li key={entry.tableName}>
                          {entry.tableName}: {entry.count}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {migrationPreview.warnings.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                      Avertissements
                    </p>
                    <ul className="text-xs text-amber-900/90 dark:text-amber-100/90 list-disc pl-4 space-y-0.5">
                      {migrationPreview.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    onClick={() => void handleUploadMigration()}
                    disabled={
                      uploadingMigration ||
                      !canManage ||
                      !connection?.connected ||
                      !config.siteId?.trim()
                    }
                    className="gap-2"
                  >
                    {uploadingMigration ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Cloud className="h-4 w-4" />
                    )}
                    Envoyer la copie test vers SharePoint
                  </Button>
                  {migrationUploadReport?.complete ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleValidateRestore()}
                      disabled={
                        validatingRestore ||
                        !canManage ||
                        !connection?.connected ||
                        !config.siteId?.trim()
                      }
                      className="gap-2"
                    >
                      {validatingRestore ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Database className="h-4 w-4" />
                      )}
                      Valider la restauration test
                    </Button>
                  ) : null}
                </div>
                {migrationUploadReport ? (
                  <div className="rounded-lg border border-border bg-background/60 p-3 space-y-2 text-xs">
                    <p className="font-medium">
                      Rapport d&apos;envoi{" "}
                      {migrationUploadReport.complete ? (
                        <Badge variant="secondary" className="ml-1">
                          terminé
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="ml-1">
                          partiel
                        </Badge>
                      )}
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <dt className="text-muted-foreground">Créés</dt>
                      <dd className="font-mono">{migrationUploadReport.created}</dd>
                      <dt className="text-muted-foreground">Mis à jour</dt>
                      <dd className="font-mono">{migrationUploadReport.updated}</dd>
                      <dt className="text-muted-foreground">Ignorés</dt>
                      <dd className="font-mono">{migrationUploadReport.skipped}</dd>
                      <dt className="text-muted-foreground">Échecs</dt>
                      <dd className="font-mono">{migrationUploadReport.failed}</dd>
                    </dl>
                    {migrationUploadReport.errors.length > 0 ? (
                      <ul className="max-h-32 overflow-y-auto list-disc pl-4 space-y-0.5 text-amber-900/90 dark:text-amber-100/90">
                        {migrationUploadReport.errors.map((entry) => (
                          <li key={`${entry.syncKey}-${entry.message}`}>
                            {entry.tableName} / {entry.recordKey} — {entry.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {migrationValidateReport ? (
                  <div className="rounded-lg border border-border bg-background/60 p-3 space-y-2 text-xs">
                    <p className="font-medium">
                      Rapport validation restauration{" "}
                      {migrationValidateReport.valid ? (
                        <Badge variant="secondary" className="ml-1">
                          valide
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="ml-1">
                          échec
                        </Badge>
                      )}
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <dt className="text-muted-foreground">Enregistrements</dt>
                      <dd className="font-mono">{migrationValidateReport.totalRecords}</dd>
                      <dt className="text-muted-foreground">Tombstones</dt>
                      <dd className="font-mono">{migrationValidateReport.tombstoneCount}</dd>
                      <dt className="text-muted-foreground">Checksum</dt>
                      <dd className="font-mono break-all">
                        {migrationValidateReport.checksumMatch ? "OK" : " divergent"}
                      </dd>
                      <dt className="text-muted-foreground">Clés étrangères</dt>
                      <dd className="font-mono">
                        {migrationValidateReport.foreignKeyOk ? "OK" : " violation(s)"}
                      </dd>
                      <dt className="text-muted-foreground">Intégrité SQLite</dt>
                      <dd className="font-mono">
                        {migrationValidateReport.integrityOk ? "OK" : " échec"}
                      </dd>
                    </dl>
                    {migrationValidateReport.errors.length > 0 ? (
                      <ul className="max-h-32 overflow-y-auto list-disc pl-4 space-y-0.5 text-amber-900/90 dark:text-amber-100/90">
                        {migrationValidateReport.errors.map((entry) => (
                          <li key={entry}>{entry}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Aucune bascule sync automatique. Relancez l&apos;envoi pour reprendre après échec.
                </p>
              </div>
            ) : null}
            {!config.siteId?.trim() ? (
              <p className="text-xs text-muted-foreground">
                Après enregistrement de la configuration, le conseiller peut provisionner les
                listes techniques CRM (présence, verrous, audit) sur le site SharePoint.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Espace collaboratif provisionné (site Graph : {config.siteId}).
              </p>
            )}
          </div>
        ) : null}

        {!canManage && teamConfigured ? (
          <p className="text-xs text-muted-foreground">
            Configuration verrouillée en mode secrétaire. Seul un conseiller peut modifier
            ou désactiver le mode équipe.
          </p>
        ) : null}

        <Button
          type="button"
          onClick={() => void handleSaveConfig()}
          disabled={savingConfig || !canManage}
        >
          {savingConfig ? "Enregistrement…" : "Enregistrer la configuration équipe"}
        </Button>
      </div>
    </SettingsPanel>
  );
}
