import { useState, useEffect, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  SettingsShell,
  SettingsPageHeader,
  SettingsLoading,
  SettingsSaveBar,
  type SettingsNavItem,
} from "@/components/settings/parametres-ui";
import { ParametresOverview } from "@/components/settings/ParametresOverview";
import { ParametresProfileSection } from "@/components/settings/ParametresProfileSection";
import { ParametresEmailSection } from "@/components/settings/ParametresEmailSection";
import { ParametresSuiviSection } from "@/components/settings/ParametresSuiviSection";
import { ParametresDatabaseSection } from "@/components/settings/ParametresDatabaseSection";
import { ParametresApplicationSection } from "@/components/settings/ParametresApplicationSection";
import { ParametresNewsletterSection } from "@/components/settings/ParametresNewsletterSection";
import { ParametresCustomFieldsSection } from "@/components/settings/ParametresCustomFieldsSection";
import { normalizeAgendaLinks, type AgendaLink } from "@/lib/emails/agenda-links";
import { getCgpConfig, saveCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { getAppInfo, listDbBackups, type DbBackupEntry } from "@/lib/api/tauri-system";
import type { SettingsSectionId } from "@/lib/settings/parametres-completion";
import { useAppUpdate } from "@/components/system/app-update-context";
import { toast } from "sonner";
import {
  LayoutDashboard,
  User,
  Mail,
  Newspaper,
  CalendarClock,
  Database,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";

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
};

const SETTINGS_NAV: SettingsNavItem[] = [
  {
    id: "accueil",
    label: "Vue d'ensemble",
    description: "État du compte et checklist",
    icon: LayoutDashboard,
  },
  {
    id: "profil",
    label: "Profil",
    description: "Identité et coordonnées",
    icon: User,
  },
  {
    id: "email",
    label: "Email",
    description: "Connexion et signature",
    icon: Mail,
  },
  {
    id: "newsletter",
    label: "Newsletter",
    description: "Mistral et style de rédaction",
    icon: Newspaper,
  },
  {
    id: "suivi",
    label: "Suivi",
    description: "Liens Google Agenda",
    icon: CalendarClock,
  },
  {
    id: "champs",
    label: "Champs personnalisés",
    description: "Champs sur mesure des fiches contact",
    icon: SlidersHorizontal,
  },
  {
    id: "donnees",
    label: "Données",
    description: "Base locale et maintenance",
    icon: Database,
  },
  {
    id: "application",
    label: "Application",
    description: "Mises à jour et sécurité",
    icon: Sparkles,
  },
];

const SECTIONS_WITH_SAVE: SettingsSectionId[] = ["profil", "email", "suivi"];

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
  };
}

function configSnapshotKey(config: CgpConfig): string {
  return JSON.stringify(normalizeCgpConfig(config));
}

export function Parametres() {
  const { currentVersion, pendingUpdate } = useAppUpdate();
  const [cgpConfig, setCgpConfig] = useState<CgpConfig>(EMPTY_CGP_CONFIG);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [emailConnected, setEmailConnected] = useState(false);
  const [dbPath, setDbPath] = useState("");
  const [backups, setBackups] = useState<DbBackupEntry[]>([]);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("accueil");

  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false;
    return configSnapshotKey(cgpConfig) !== savedSnapshot;
  }, [cgpConfig, savedSnapshot]);

  const showSaveBar =
    isDirty && SECTIONS_WITH_SAVE.includes(activeSection) && !loadingConfig;

  useEffect(() => {
    const load = async () => {
      setLoadingConfig(true);
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
        toast.error("Impossible de charger le profil");
      } finally {
        setLoadingConfig(false);
      }
    };
    void load();
    getAppInfo()
      .then((info) => setDbPath(info.db_path))
      .catch(() => {});
    listDbBackups()
      .then(setBackups)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (
      activeSection !== "accueil" &&
      activeSection !== "profil" &&
      activeSection !== "email"
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
    if (!savedSnapshot) return;
    setCgpConfig(JSON.parse(savedSnapshot) as CgpConfig);
    toast.message("Modifications annulées");
  };

  const renderSection = () => {
    if (
      loadingConfig &&
      activeSection !== "accueil" &&
      activeSection !== "donnees" &&
      activeSection !== "champs"
    ) {
      return <SettingsLoading />;
    }

    switch (activeSection) {
      case "accueil":
        return (
          <ParametresOverview
            cgpConfig={cgpConfig}
            backups={backups}
            onNavigate={setActiveSection}
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
      case "email":
        return (
          <ParametresEmailSection cgpConfig={cgpConfig} onConfigChange={patchCgpConfig} />
        );
      case "newsletter":
        return <ParametresNewsletterSection />;
      case "champs":
        return <ParametresCustomFieldsSection />;
      case "suivi":
        return (
          <ParametresSuiviSection cgpConfig={cgpConfig} onConfigChange={patchCgpConfig} />
        );
      case "donnees":
        return (
          <ParametresDatabaseSection
            dbPath={dbPath}
            backups={backups}
            onBackupsChanged={setBackups}
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
          description="Configurez votre espace conseiller : profil, envois email, suivi client et données locales."
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
      nav={SETTINGS_NAV}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
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
    </SettingsShell>
  );
}
