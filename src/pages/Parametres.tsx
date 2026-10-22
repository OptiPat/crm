import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SettingsShell,
  SettingsPageHeader,
  SettingsLoading,
  SettingsSaveBar,
} from "@/components/settings/parametres-ui";
import { ParametresOverview } from "@/components/settings/ParametresOverview";
import { ParametresProfileSection } from "@/components/settings/ParametresProfileSection";
import { ParametresEmailConnexionSection } from "@/components/settings/ParametresEmailConnexionSection";
import { ParametresEmailSignatureSection } from "@/components/settings/ParametresEmailSignatureSection";
import { ParametresEmailGoogleContactsSection } from "@/components/settings/ParametresEmailGoogleContactsSection";
import { ParametresEmailHistoriqueSection } from "@/components/settings/ParametresEmailHistoriqueSection";
import { StelliumExceltisSettingsPanel } from "@/components/settings/StelliumExceltisSettingsPanel";
import { ParametresSuiviSection } from "@/components/settings/ParametresSuiviSection";
import { ParametresFichesConseilSection } from "@/components/settings/ParametresFichesConseilSection";
import { ParametresRemunerationSection } from "@/components/settings/ParametresRemunerationSection";
import { ParametresDatabaseSection } from "@/components/settings/ParametresDatabaseSection";
import { ParametresApplicationSection } from "@/components/settings/ParametresApplicationSection";
import { ParametresIntegrationsSection } from "@/components/settings/ParametresIntegrationsSection";
import { ParametresEspaceClientSection } from "@/components/settings/ParametresEspaceClientSection";
import { ParametresCustomFieldsSection } from "@/components/settings/ParametresCustomFieldsSection";
import { ParametresSearchBar } from "@/components/settings/ParametresSearchBar";
import { normalizeAgendaLinks, type AgendaLink } from "@/lib/emails/agenda-links";
import { getCgpConfig, saveCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { notifyCgpConfigChanged } from "@/lib/settings/cgp-config-events";
import { notifyAppBrandingChanged } from "@/lib/api/tauri-app-branding";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { getAppInfo, listDbBackups, type DbBackupEntry } from "@/lib/api/tauri-system";
import type { SettingsSectionId } from "@/lib/settings/parametres-completion";
import {
  CRM_PARAMETRES_EMAIL_TAB_KEY,
  CRM_PARAMETRES_SCROLL_KEY,
  CRM_PARAMETRES_SECTION_KEY,
  requestOpenComptabilite,
  requestOpenNewsletterSettings,
} from "@/lib/navigation/app-navigation";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";
import { useAppUpdate } from "@/components/system/app-update-context";
import { toast } from "sonner";
import {
  isParametresExternalSection,
  SETTINGS_NAV_GROUPS,
} from "@/lib/settings/parametres-nav";
import type { ParametresSearchItem } from "@/lib/settings/parametres-search";
import { resolveSettingsSection, isEmailSettingsSection } from "@/lib/settings/parametres-section-resolve";
import { allowNextPageLeave, usePageLeaveGuard } from "@/lib/navigation/page-leave-guard";

const EMPTY_CGP_CONFIG: CgpConfig = {
  nom: "",
  prenom: "",
  cabinet: "",
  email: "",
  telephone: "",
  agenda_links: [] as AgendaLink[],
  logo_path: "",
  wizard_completed: true,
  wizard_step: 4,
  email_signature: "",
  email_signature_html: "",
  email_suivi_delai_jours: 5,
  site_web: "",
  adresse: "",
  code_postal: "",
  ville: "",
  cif_siren: "",
  cif_rcs_ville: "",
  cif_anacofi_numero: "",
  cif_orias: "",
  cif_pied_de_page: "",
  default_visio_link: "",
};

const SECTIONS_WITH_SAVE: SettingsSectionId[] = ["profil", "email-signature", "suivi"];

const SECTIONS_WITHOUT_CONFIG_LOAD: SettingsSectionId[] = [
  "accueil",
  "donnees",
  "champs",
  "email-connexion",
  "email-google-contacts",
  "email-historique",
  "email-stellium",
  "integrations",
  "fiches-conseil",
  "application",
  "remuneration",
];

function normalizeCgpConfig(config: CgpConfig): CgpConfig {
  return {
    nom: config.nom ?? "",
    prenom: config.prenom ?? "",
    cabinet: config.cabinet ?? "",
    email: config.email ?? "",
    telephone: config.telephone ?? "",
    agenda_links: normalizeAgendaLinks(config),
    logo_path: config.logo_path ?? "",
    wizard_completed: config.wizard_completed ?? true,
    wizard_step: config.wizard_step ?? 4,
    email_signature: config.email_signature ?? "",
    email_signature_html: config.email_signature_html ?? "",
    email_suivi_delai_jours: config.email_suivi_delai_jours ?? 5,
    site_web: config.site_web ?? "",
    adresse: config.adresse ?? "",
    code_postal: config.code_postal ?? "",
    ville: config.ville ?? "",
    cif_siren: config.cif_siren ?? "",
    cif_rcs_ville: config.cif_rcs_ville ?? "",
    cif_anacofi_numero: config.cif_anacofi_numero ?? "",
    cif_orias: config.cif_orias ?? "",
    cif_pied_de_page: config.cif_pied_de_page ?? "",
    default_visio_link: config.default_visio_link ?? "",
  };
}

function configSnapshotKey(config: CgpConfig): string {
  return JSON.stringify(normalizeCgpConfig(config));
}

type ParametresProps = {
  currentPage?: string;
  onNavigate?: (page: string) => void;
};

export function Parametres({ currentPage, onNavigate }: ParametresProps) {
  const { currentVersion, pendingUpdate } = useAppUpdate();
  const [cgpConfig, setCgpConfig] = useState<CgpConfig>(EMPTY_CGP_CONFIG);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configLoadFailed, setConfigLoadFailed] = useState(false);
  const [configReloadKey, setConfigReloadKey] = useState(0);
  const [savingProfile, setSavingProfile] = useState(false);
  const [emailConnected, setEmailConnected] = useState(false);
  const [dbPath, setDbPath] = useState("");
  const [secretsProtectionWarning, setSecretsProtectionWarning] = useState(false);
  const [legacySecretKeyCleanupAvailable, setLegacySecretKeyCleanupAvailable] = useState(false);
  const [backups, setBackups] = useState<DbBackupEntry[]>([]);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("accueil");
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);

  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false;
    return configSnapshotKey(cgpConfig) !== savedSnapshot;
  }, [cgpConfig, savedSnapshot]);

  const showSaveBar =
    isDirty && SECTIONS_WITH_SAVE.includes(activeSection) && !loadingConfig;

  // Sortie par le menu latéral / la recherche globale : App demande confirmation.
  usePageLeaveGuard(isDirty);

  /** Remet le formulaire dans l'état enregistré (vraie annulation des modifications). */
  const restoreSavedConfig = useCallback(() => {
    setCgpConfig(savedSnapshot ? (JSON.parse(savedSnapshot) as CgpConfig) : EMPTY_CGP_CONFIG);
  }, [savedSnapshot]);

  // Action en attente derrière la fenêtre « Quitter sans enregistrer ? ».
  const pendingLeaveRef = useRef<(() => void) | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  /** Exécute `action` tout de suite, ou après confirmation s'il y a des modifications. */
  const runAfterDiscardConfirm = useCallback(
    (action: () => void) => {
      if (!isDirty || !SECTIONS_WITH_SAVE.includes(activeSection)) {
        action();
        return;
      }
      pendingLeaveRef.current = action;
      setLeaveConfirmOpen(true);
    },
    [isDirty, activeSection]
  );

  const confirmLeaveWithoutSaving = () => {
    const action = pendingLeaveRef.current;
    pendingLeaveRef.current = null;
    setLeaveConfirmOpen(false);
    restoreSavedConfig();
    // L'état « modifié » n'est remis à zéro qu'au prochain rendu : sans ceci, App redemanderait.
    allowNextPageLeave();
    action?.();
  };

  const openExternalSettings = useCallback(
    (page: "newsletter" | "comptabilite") => {
      runAfterDiscardConfirm(() => {
        if (page === "newsletter") {
          requestOpenNewsletterSettings({ currentPage, setCurrentPage: onNavigate });
        } else {
          requestOpenComptabilite({ currentPage, setCurrentPage: onNavigate });
        }
      });
    },
    [runAfterDiscardConfirm, currentPage, onNavigate]
  );

  const redirectExternalSection = useCallback(
    (section: SettingsSectionId) => {
      if (!isParametresExternalSection(section)) return false;
      openExternalSettings(section === "newsletter" ? "newsletter" : "comptabilite");
      return true;
    },
    [openExternalSettings]
  );

  const applyParametresNavigation = useCallback(
    (rawSection: string, scrollToId?: string, emailTab?: string) => {
      const section = resolveSettingsSection(rawSection, emailTab);
      if (redirectExternalSection(section)) return;
      runAfterDiscardConfirm(() => {
        setActiveSection(section);
        setScrollTargetId(scrollToId ?? null);
      });
    },
    [redirectExternalSection, runAfterDiscardConfirm]
  );

  useEffect(() => {
    const section = sessionStorage.getItem(CRM_PARAMETRES_SECTION_KEY) ?? undefined;
    const scrollToId = sessionStorage.getItem(CRM_PARAMETRES_SCROLL_KEY) ?? undefined;
    const storedEmailTab = sessionStorage.getItem(CRM_PARAMETRES_EMAIL_TAB_KEY) ?? undefined;
    sessionStorage.removeItem(CRM_PARAMETRES_SECTION_KEY);
    sessionStorage.removeItem(CRM_PARAMETRES_SCROLL_KEY);
    sessionStorage.removeItem(CRM_PARAMETRES_EMAIL_TAB_KEY);
    if (section) {
      applyParametresNavigation(section, scrollToId, storedEmailTab);
    }
  }, [applyParametresNavigation]);

  useAppNavigationListener((detail) => {
    if (detail.type === "parametres") {
      applyParametresNavigation(detail.section, detail.scrollToId, detail.emailTab);
    }
  });

  useEffect(() => {
    if (!scrollTargetId || loadingConfig) return;
    const timer = window.setTimeout(() => {
      document.getElementById(scrollTargetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollTargetId(null);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [scrollTargetId, activeSection, loadingConfig]);

  useEffect(() => {
    const load = async () => {
      setLoadingConfig(true);
      setConfigLoadFailed(false);
      try {
        const [config, emailSt] = await Promise.all([
          getCgpConfig(),
          getEmailConnectionStatus().catch(() => null),
        ]);
        if (emailSt) {
          setEmailConnected(emailSt.method === "oauth" && emailSt.connected);
        }
        if (config) {
          const normalized = normalizeCgpConfig(config);
          setCgpConfig(normalized);
          setSavedSnapshot(configSnapshotKey(normalized));
        }
      } catch (error) {
        console.error("Erreur chargement config CGP:", error);
        // Pas de formulaire vide modifiable : un enregistrement écraserait le vrai profil.
        setConfigLoadFailed(true);
        toast.error("Impossible de charger le profil");
      } finally {
        setLoadingConfig(false);
      }
    };
    void load();
  }, [configReloadKey]);

  useEffect(() => {
    getAppInfo()
      .then((info) => {
        setDbPath(info.db_path);
        setSecretsProtectionWarning(info.secrets_protection_warning);
        setLegacySecretKeyCleanupAvailable(info.legacy_secret_key_cleanup_available);
      })
      .catch(() => {});
    listDbBackups()
      .then(setBackups)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (
      activeSection !== "accueil" &&
      activeSection !== "profil" &&
      !isEmailSettingsSection(activeSection)
    ) {
      return;
    }
    getEmailConnectionStatus()
      .then((st) => setEmailConnected(st.method === "oauth" && st.connected))
      .catch(() => setEmailConnected(false));
  }, [activeSection]);

  const patchCgpConfig = useCallback((patch: Partial<CgpConfig>) => {
    setCgpConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSaveProfile = useCallback(async () => {
    setSavingProfile(true);
    try {
      await saveCgpConfig(cgpConfig);
      setSavedSnapshot(configSnapshotKey(cgpConfig));
      notifyAppBrandingChanged();
      notifyCgpConfigChanged();
      toast.success("Paramètres enregistrés");
    } catch (error) {
      console.error("Erreur sauvegarde profil:", error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSavingProfile(false);
    }
  }, [cgpConfig]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (showSaveBar) void handleSaveProfile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSaveBar, handleSaveProfile]);

  const handleDiscard = () => {
    restoreSavedConfig();
    toast.message("Modifications annulées");
  };

  const handleNavigateToSection = useCallback(
    (section: SettingsSectionId, options?: { scrollToId?: string }) => {
      if (redirectExternalSection(section)) return;
      runAfterDiscardConfirm(() => {
        setActiveSection(section);
        if (options?.scrollToId) setScrollTargetId(options.scrollToId);
      });
    },
    [redirectExternalSection, runAfterDiscardConfirm]
  );

  const handleSectionChange = useCallback(
    (section: SettingsSectionId) => {
      handleNavigateToSection(section);
    },
    [handleNavigateToSection]
  );

  const handleSearchSelect = useCallback(
    (item: ParametresSearchItem) => {
      if (item.externalPage === "newsletter" || item.externalPage === "comptabilite") {
        openExternalSettings(item.externalPage);
        return;
      }
      handleNavigateToSection(item.section, { scrollToId: item.scrollToId });
    },
    [openExternalSettings, handleNavigateToSection]
  );

  const renderSection = () => {
    if (loadingConfig && !SECTIONS_WITHOUT_CONFIG_LOAD.includes(activeSection)) {
      return <SettingsLoading />;
    }
    if (configLoadFailed && !SECTIONS_WITHOUT_CONFIG_LOAD.includes(activeSection)) {
      return (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3 text-sm">
          <p className="font-medium">Impossible de charger votre profil.</p>
          <p className="text-muted-foreground">
            Vos informations ne sont pas perdues. Réessayez ; si le problème continue, redémarrez
            le CRM.
          </p>
          <Button type="button" variant="outline" onClick={() => setConfigReloadKey((k) => k + 1)}>
            Réessayer
          </Button>
        </div>
      );
    }

    switch (activeSection) {
      case "accueil":
        return (
          <ParametresOverview
            cgpConfig={cgpConfig}
            backups={backups}
            onNavigate={handleNavigateToSection}
            onNavigateExternal={(page) =>
              openExternalSettings(page === "newsletter" ? "newsletter" : "comptabilite")
            }
          />
        );
      case "profil":
        return (
          <ParametresProfileSection
            cgpConfig={cgpConfig}
            onConfigChange={patchCgpConfig}
            emailConnected={emailConnected}
          />
        );
      case "email-connexion":
        return <ParametresEmailConnexionSection />;
      case "email-signature":
        return (
          <ParametresEmailSignatureSection
            cgpConfig={cgpConfig}
            onConfigChange={patchCgpConfig}
          />
        );
      case "email-google-contacts":
        return <ParametresEmailGoogleContactsSection />;
      case "email-historique":
        return <ParametresEmailHistoriqueSection />;
      case "email-stellium":
        return <StelliumExceltisSettingsPanel />;
      case "champs":
        return <ParametresCustomFieldsSection />;
      case "suivi":
        return (
          <ParametresSuiviSection cgpConfig={cgpConfig} onConfigChange={patchCgpConfig} />
        );
      case "fiches-conseil":
        return <ParametresFichesConseilSection />;
      case "remuneration":
        return <ParametresRemunerationSection />;
      case "integrations":
        return <ParametresIntegrationsSection />;
      case "espace-client":
        return <ParametresEspaceClientSection />;
      case "donnees":
        return (
          <ParametresDatabaseSection
            dbPath={dbPath}
            secretsProtectionWarning={secretsProtectionWarning}
            legacySecretKeyCleanupAvailable={legacySecretKeyCleanupAvailable}
            backups={backups}
            onBackupsChanged={setBackups}
            onSecretsProtectionCleaned={() => {
              setSecretsProtectionWarning(false);
              setLegacySecretKeyCleanupAvailable(false);
            }}
          />
        );
      case "application":
        return <ParametresApplicationSection />;
      default:
        return null;
    }
  };

  return (
    <SettingsShell
      header={
        <SettingsPageHeader
          title="Paramètres"
          description="Configurez votre espace conseiller : profil, envois email, automatisations et données locales."
          badge={
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="font-normal tabular-nums">
                v{currentVersion}
              </Badge>
              {pendingUpdate && (
                <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 font-normal">
                  Mise à jour disponible
                </Badge>
              )}
              {isDirty && (
                <Badge variant="secondary" className="font-normal">
                  Non enregistré
                </Badge>
              )}
            </div>
          }
        />
      }
      search={<ParametresSearchBar onSelect={handleSearchSelect} />}
      navGroups={SETTINGS_NAV_GROUPS}
      activeSection={activeSection}
      onSectionChange={handleSectionChange}
      footer={
        <SettingsSaveBar
          visible={showSaveBar}
          saving={savingProfile}
          onSave={() => void handleSaveProfile()}
          onDiscard={handleDiscard}
        />
      }
    >
      <div className={showSaveBar ? "pb-20" : undefined}>{renderSection()}</div>
      <AlertDialog
        open={leaveConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            pendingLeaveRef.current = null;
            setLeaveConfirmOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitter sans enregistrer ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vos modifications de cette section seront perdues.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer l&apos;édition</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmLeaveWithoutSaving}
            >
              Quitter sans enregistrer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsShell>
  );
}
