import { useEffect, useState } from "react";
import {
  SettingsPanel,
  StatusTile,
} from "@/components/settings/parametres-ui";
import {
  getSetupChecklist,
  getCompletionPercent,
  getDisplayName,
  type SettingsSectionId,
  type SetupCheckItem,
} from "@/lib/settings/parametres-completion";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import { getComptaConfig } from "@/lib/api/tauri-compta";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import type { DbBackupEntry } from "@/lib/api/tauri-system";
import type { ComptaConfig } from "@/lib/api/tauri-compta";
import { useAppUpdate } from "@/components/system/app-update-context";
import {
  CheckCircle2,
  Circle,
  Mail,
  Database,
  User,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type ParametresOverviewProps = {
  cgpConfig: CgpConfig;
  backups: DbBackupEntry[];
  onNavigate: (section: SettingsSectionId) => void;
};

export function ParametresOverview({ cgpConfig, backups, onNavigate }: ParametresOverviewProps) {
  const { currentVersion, pendingUpdate } = useAppUpdate();
  const [emailConnected, setEmailConnected] = useState(false);
  const [emailLabel, setEmailLabel] = useState("Non connecté");
  const [comptaConfig, setComptaConfig] = useState<ComptaConfig | null>(null);

  useEffect(() => {
    void getComptaConfig()
      .then(setComptaConfig)
      .catch(() => setComptaConfig(null));
  }, []);

  useEffect(() => {
    getEmailConnectionStatus()
      .then((st) => {
        const ok = st.method === "oauth" && st.connected;
        setEmailConnected(ok);
        if (ok && st.email) {
          setEmailLabel(st.email);
        } else {
          setEmailLabel("Non connecté");
        }
      })
      .catch(() => {
        setEmailConnected(false);
        setEmailLabel("Non connecté");
      });
  }, []);

  const checklist = getSetupChecklist(cgpConfig, emailConnected, comptaConfig);
  const completion = getCompletionPercent(checklist);
  const displayName = getDisplayName(cgpConfig);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatusTile
          title="Profil"
          value={`${completion} %`}
          subtitle={displayName}
          icon={User}
          accentColor="#1E3A5F"
          iconBg="bg-primary/10"
          iconColor="text-primary"
          onClick={() => onNavigate("profil")}
        />
        <StatusTile
          title="Email"
          value={emailConnected ? "Connecté" : "À configurer"}
          subtitle={emailLabel}
          icon={Mail}
          accentColor={emailConnected ? "#059669" : "#D97706"}
          iconBg={emailConnected ? "bg-emerald-50" : "bg-amber-50"}
          iconColor={emailConnected ? "text-emerald-600" : "text-amber-600"}
          onClick={() => onNavigate("email")}
        />
        <StatusTile
          title="Sauvegardes"
          value={String(backups.length)}
          subtitle={
            backups.length > 0
              ? "Copies automatiques avant migration"
              : "Aucune sauvegarde listée"
          }
          icon={Database}
          accentColor="#3B82F6"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          onClick={() => onNavigate("donnees")}
        />
        <StatusTile
          title="Application"
          value={`v${currentVersion}`}
          subtitle={
            pendingUpdate
              ? `Mise à jour ${pendingUpdate.version} disponible`
              : "Logiciel à jour"
          }
          icon={Sparkles}
          accentColor="#8B5CF6"
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          onClick={() => onNavigate("application")}
        />
      </div>

      <SettingsPanel
        title="Checklist de configuration"
        description="Complétez ces étapes pour tirer le meilleur parti du CRM (emails, suivi, templates)."
      >
        <ul className="space-y-1">
          {checklist.map((item) => (
            <ChecklistRow key={item.id} item={item} onGo={() => onNavigate(item.section)} />
          ))}
        </ul>
        {completion === 100 && (
          <p className="mt-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            Tout est prêt — vous pouvez vous concentrer sur vos clients.
          </p>
        )}
      </SettingsPanel>
    </div>
  );
}

function ChecklistRow({
  item,
  onGo,
}: {
  item: SetupCheckItem;
  onGo: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onGo}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-muted/60 transition-colors group"
      >
        {item.done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground/50 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className={cn("text-sm font-medium", item.done && "text-muted-foreground")}>
            {item.label}
          </span>
          <span className="block text-xs text-muted-foreground">{item.hint}</span>
        </div>
        {!item.done && (
          <Badge variant="outline" className="shrink-0 font-normal text-xs group-hover:border-primary/40">
            Configurer
          </Badge>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </li>
  );
}
