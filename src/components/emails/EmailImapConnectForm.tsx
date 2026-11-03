import { useState } from "react";
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
import { ChevronDown, Loader2, Server } from "lucide-react";
import {
  connectImapMailbox,
  suggestImapMailboxServers,
  type EmailConnectionStatus,
  type ImapMailboxServers,
  type ImapServerSuggestion,
} from "@/lib/api/tauri-email-oauth";
import { userErrorMessage } from "@/lib/api/invoke-error";
import { toast } from "sonner";

type EmailImapConnectFormProps = {
  initialEmail?: string | null;
  /** Derniers serveurs enregistrés (reconnexion / changement de mot de passe). */
  savedServers?: ImapMailboxServers | null;
  onConnected: (status: EmailConnectionStatus) => void;
  onCancel: () => void;
};

function emailDomain(email: string | null | undefined): string {
  return (email ?? "").trim().split("@")[1]?.toLowerCase() ?? "";
}

/** Port saisi borné à la plage TCP (0 = invalide, refusé côté Rust). */
function parsePort(value: string): number {
  return Math.min(65535, Math.max(0, Math.trunc(Number(value)) || 0));
}

const EMPTY_SERVERS: ImapMailboxServers = {
  imap_host: "",
  imap_port: 993,
  smtp_host: "",
  smtp_port: 587,
  smtp_security: "starttls",
  username: "",
};

/** Connexion d'une boîte hors Google / Microsoft 365 : adresse + mot de passe. */
export function EmailImapConnectForm({
  initialEmail,
  savedServers,
  onConnected,
  onCancel,
}: EmailImapConnectFormProps) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [suggestion, setSuggestion] = useState<ImapServerSuggestion | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  /** Serveurs saisis à la main : utilisés tels quels au lieu de la détection. */
  const [manual, setManual] = useState(Boolean(savedServers));
  const [servers, setServers] = useState<ImapMailboxServers>(savedServers ?? EMPTY_SERVERS);
  /** Serveurs modifiés à la main dans ce formulaire (sinon : enregistrés ou détectés). */
  const [userEdited, setUserEdited] = useState(false);

  const detect = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed.includes("@")) {
      setSuggestion(null);
      return;
    }
    setDetecting(true);
    try {
      const sug = await suggestImapMailboxServers(trimmed);
      setSuggestion(sug);
      // Serveurs enregistrés valables pour la même adresse seulement : autre domaine → détection.
      const keepSaved = Boolean(savedServers) && emailDomain(trimmed) === emailDomain(initialEmail);
      if (!userEdited && !keepSaved) {
        setManual(false);
        setServers(sug.candidates[0] ?? EMPTY_SERVERS);
      }
    } catch {
      setSuggestion(null);
    } finally {
      setDetecting(false);
    }
  };

  const updateServers = (patch: Partial<ImapMailboxServers>) => {
    setManual(true);
    setUserEdited(true);
    setServers((s) => ({ ...s, ...patch }));
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const st = await connectImapMailbox(email.trim(), password, manual ? servers : null);
      setPassword("");
      toast.success(`Connecté : ${st.email ?? email.trim()}`);
      onConnected(st);
    } catch (e) {
      toast.error(userErrorMessage(e, "Connexion à la messagerie impossible"));
    } finally {
      setConnecting(false);
    }
  };

  const noCandidates = suggestion !== null && suggestion.candidates.length === 0;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-semibold">Autre messagerie (OVH, Ionos, Orange…)</p>
        <p className="text-xs text-muted-foreground mt-1">
          L&apos;adresse et le mot de passe utilisés pour lire vos emails (webmail ou Outlook).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="imap-email">Adresse email</Label>
          <Input
            id="imap-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => void detect(e.target.value)}
            placeholder="vous@votre-cabinet.fr"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="imap-password">Mot de passe de la messagerie</Label>
          <Input
            id="imap-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
      </div>

      {detecting ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Recherche de l&apos;hébergeur…
        </p>
      ) : suggestion?.provider_label && suggestion.candidates.length > 0 && !manual ? (
        <p className="flex items-center gap-2 text-xs text-emerald-800">
          <Server className="h-3.5 w-3.5" />
          Hébergeur détecté : <strong>{suggestion.provider_label}</strong> — serveurs réglés
          automatiquement.
        </p>
      ) : null}
      {suggestion?.hint ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {suggestion.hint}
        </p>
      ) : noCandidates && !suggestion?.hint && !manual ? (
        <p className="text-xs text-amber-800">
          Hébergeur non reconnu : renseignez les serveurs ci-dessous (fournis par votre hébergeur).
        </p>
      ) : null}

      <details
        className="group rounded-lg border border-border/80 bg-background/60"
        open={(noCandidates && !suggestion?.hint) || undefined}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium [&::-webkit-details-marker]:hidden">
          <span>Serveurs (avancé){manual ? " — saisis manuellement" : ""}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-3 border-t border-border/60 p-3 sm:grid-cols-[1fr_6rem]">
          <div className="space-y-1">
            <Label htmlFor="imap-host" className="text-xs">Serveur IMAP (réception)</Label>
            <Input
              id="imap-host"
              value={servers.imap_host}
              onChange={(e) => updateServers({ imap_host: e.target.value.trim() })}
              placeholder="pro2.mail.ovh.net"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="imap-port" className="text-xs">Port</Label>
            <Input
              id="imap-port"
              type="number"
              value={servers.imap_port}
              onChange={(e) => updateServers({ imap_port: parsePort(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="smtp-host" className="text-xs">Serveur SMTP (envoi)</Label>
            <Input
              id="smtp-host"
              value={servers.smtp_host}
              onChange={(e) => updateServers({ smtp_host: e.target.value.trim() })}
              placeholder="pro2.mail.ovh.net"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="smtp-port" className="text-xs">Port</Label>
            <Input
              id="smtp-port"
              type="number"
              value={servers.smtp_port}
              onChange={(e) => {
                const port = parsePort(e.target.value);
                updateServers({
                  smtp_port: port,
                  smtp_security: port === 465 ? "tls" : "starttls",
                });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sécurité SMTP</Label>
            <Select
              value={servers.smtp_security}
              onValueChange={(v) => updateServers({ smtp_security: v as "starttls" | "tls" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starttls">STARTTLS (port 587)</SelectItem>
                <SelectItem value="tls">SSL/TLS (port 465)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="imap-username" className="text-xs">
              Identifiant (si différent de l&apos;adresse)
            </Label>
            <Input
              id="imap-username"
              value={servers.username ?? ""}
              onChange={(e) => updateServers({ username: e.target.value })}
              autoComplete="off"
            />
          </div>
          {manual ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto justify-start px-0 text-xs sm:col-span-2"
              onClick={() => {
                setManual(false);
                setUserEdited(false);
                setServers(suggestion?.candidates[0] ?? EMPTY_SERVERS);
              }}
            >
              Revenir à la détection automatique
            </Button>
          ) : null}
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void handleConnect()}
          disabled={connecting || !email.trim() || !password}
        >
          {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {connecting ? "Vérification…" : "Connecter"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={connecting}>
          Annuler
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Le mot de passe est chiffré sur cet ordinateur. S&apos;il change chez votre hébergeur,
        reconnectez la boîte ici.
      </p>
    </div>
  );
}
