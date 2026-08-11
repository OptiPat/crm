import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/api/tauri-contacts";
import { openExternalUrl } from "@/lib/api/tauri-system";
import {
  activateEspaceAcces,
  getEspaceAcces,
  getEspaceClientSyncConfig,
  getEspaceConnexionLog,
  pushEspaceClientContact,
  revokeEspaceAcces,
  saveEspaceClientSyncConfig,
  type EspaceAcces,
  type EspaceConnexionLogEntry,
} from "@/lib/api/tauri-espace-client";
import { ESPACE_CLIENT_CHANGED_EVENT } from "@/lib/espace-client/espace-client-events";
import {
  ESPACE_ACCES_STATUT,
  formatEspaceAccesStatut,
  formatEspaceConnexionEvent,
  formatEspaceTimestamp,
} from "@/lib/espace-client/espace-client-format";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContactEspaceDemandesPanel } from "@/components/espace-client/ContactEspaceDemandesPanel";
import { ContactEspaceEcheancesPanel } from "@/components/espace-client/ContactEspaceEcheancesPanel";
import { cn } from "@/lib/utils";
import { invokeErrorMessage } from "@/lib/api/invoke-error";

export interface ContactEspaceAccesPanelProps {
  contact: Contact;
  onChanged?: () => void;
}

function statutBadgeClass(statut: string): string {
  switch (statut) {
    case ESPACE_ACCES_STATUT.ACTIF:
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
    case ESPACE_ACCES_STATUT.REVOQUE:
      return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300";
    default:
      return "";
  }
}

export function ContactEspaceAccesPanel({
  contact,
  onChanged,
}: ContactEspaceAccesPanelProps) {
  const [acces, setAcces] = useState<EspaceAcces | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(contact.email?.trim() ?? "");
  const [saving, setSaving] = useState(false);
  /** Code d'activation a dicter au client, affiche une seule fois. */
  const [activationCode, setActivationCode] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [portalUrl, setPortalUrl] = useState("");
  const [syncSecret, setSyncSecret] = useState("");
  const [hasSyncSecret, setHasSyncSecret] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connexionLog, setConnexionLog] = useState<EspaceConnexionLogEntry[]>(
    []
  );
  const [logLoading, setLogLoading] = useState(false);

  const loadConnexionLog = useCallback(async (contactId: number) => {
    setLogLoading(true);
    try {
      const rows = await getEspaceConnexionLog(contactId);
      setConnexionLog(rows);
    } catch {
      setConnexionLog([]);
    } finally {
      setLogLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!contact.id) return;
    setLoading(true);
    try {
      const [row, config] = await Promise.all([
        getEspaceAcces(contact.id),
        getEspaceClientSyncConfig(),
      ]);
      setAcces(row);
      setPortalUrl(config.portal_url?.trim() ?? "");
      setHasSyncSecret(config.has_sync_secret);
      if (row?.email_utilise) {
        setEmail(row.email_utilise);
      } else if (contact.email?.trim()) {
        setEmail(contact.email.trim());
      }
      if (row?.statut === ESPACE_ACCES_STATUT.ACTIF) {
        void loadConnexionLog(contact.id);
      } else {
        setConnexionLog([]);
      }
    } catch {
      setAcces(null);
      toast.error("Impossible de charger l'accès espace client");
    } finally {
      setLoading(false);
    }
  }, [contact.email, contact.id, loadConnexionLog]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handler = () => void load();
    window.addEventListener(ESPACE_CLIENT_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ESPACE_CLIENT_CHANGED_EVENT, handler);
  }, [load]);

  useEffect(() => {
    if (!acces?.email_utilise && contact.email?.trim()) {
      setEmail(contact.email.trim());
    }
  }, [acces?.email_utilise, contact.email]);

  const statut = acces?.statut ?? ESPACE_ACCES_STATUT.INACTIF;
  const isActif = statut === ESPACE_ACCES_STATUT.ACTIF;
  const isRevoque = statut === ESPACE_ACCES_STATUT.REVOQUE;

  const handleActivate = async () => {
    if (!contact.id) return;
    setSaving(true);
    try {
      const { acces: next, activationCode } = await activateEspaceAcces(
        contact.id,
        email
      );
      setAcces(next);
      setActivationCode(activationCode);
      onChanged?.();
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Activation impossible");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!contact.id) return;
    setSaving(true);
    try {
      const next = await revokeEspaceAcces(contact.id);
      setAcces(next);
      setRevokeOpen(false);
      setConnexionLog([]);
      toast.success("Accès espace client révoqué");
      onChanged?.();
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Révocation impossible");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePortalConfig = async () => {
    setSaving(true);
    try {
      const config = await saveEspaceClientSyncConfig(
        portalUrl,
        syncSecret.trim() || undefined
      );
      setHasSyncSecret(config.has_sync_secret);
      setSyncSecret("");
      toast.success("Connexion portail enregistrée");
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const handlePush = async () => {
    if (!contact.id) return;
    setSyncing(true);
    try {
      const result = await pushEspaceClientContact(contact.id);
      toast.success(
        `Synchronisé (séq. ${result.sequence}) — ${result.investissement_count} placement(s), ${result.timeline_count} événement(s)`
      );
      onChanged?.();
      void loadConnexionLog(contact.id);
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Synchronisation impossible");
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenPortal = async () => {
    const base = portalUrl.trim().replace(/\/$/, "");
    if (!base) {
      toast.error("Enregistrez d'abord l'URL du portail");
      return;
    }
    try {
      await openExternalUrl(base);
    } catch {
      toast.error("Impossible d'ouvrir le navigateur");
    }
  };

  return (
    <div className="w-full max-w-3xl rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">Accès espace client</p>
            <Badge
              variant="outline"
              className={cn("font-normal", statutBadgeClass(statut))}
            >
              {formatEspaceAccesStatut(statut)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            La première connexion se fait avec un code que vous lui dictez.
            Ensuite, le portail lui envoie un code par email à chaque connexion.
          </p>
          {acces?.active_at ? (
            <p className="text-xs text-muted-foreground">
              Activé le{" "}
              <span className="text-foreground">
                {formatEspaceTimestamp(acces.active_at)}
              </span>
            </p>
          ) : null}
          {acces?.premiere_connexion_at ? (
            <p className="text-xs text-muted-foreground">
              Première connexion :{" "}
              <span className="text-foreground">
                {formatEspaceTimestamp(acces.premiere_connexion_at)}
              </span>
            </p>
          ) : isActif ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              En attente de la première connexion client
            </p>
          ) : null}
          {activationCode ? (
            <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
              <p className="text-xs text-emerald-900 dark:text-emerald-100">
                Code de première connexion à dicter au client :
              </p>
              <p className="mt-1 font-mono text-2xl tracking-[0.4em] text-emerald-950 dark:text-emerald-50">
                {activationCode}
              </p>
              <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
                Notez-le maintenant : il ne sera plus affiché. Sans lui, le client
                ne peut pas ouvrir son espace, même avec son email.
              </p>
            </div>
          ) : null}
          {acces?.derniere_connexion ? (
            <p className="text-xs text-muted-foreground">
              Dernière connexion :{" "}
              <span className="text-foreground">
                {formatEspaceTimestamp(acces.derniere_connexion)}
              </span>
            </p>
          ) : null}
        </div>

        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="espace-client-email" className="text-xs">
            Email de connexion
          </Label>
          <Input
            id="espace-client-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            disabled={loading || saving || isActif}
            className="h-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {!isActif ? (
            <Button
              type="button"
              size="sm"
              className="h-9"
              disabled={loading || saving || !email.trim()}
              onClick={() => void handleActivate()}
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isRevoque ? "Réactiver" : "Activer l'accès"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={loading || saving}
              onClick={() => setRevokeOpen(true)}
            >
              <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
              Révoquer
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
        <p className="text-xs font-medium text-foreground">Connexion portail</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="espace-portal-url" className="text-xs">
              URL du portail
            </Label>
            <Input
              id="espace-portal-url"
              type="url"
              value={portalUrl}
              onChange={(e) => setPortalUrl(e.target.value)}
              placeholder="https://espace.example.com"
              disabled={loading || saving || syncing}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="espace-sync-secret" className="text-xs">
              Clé de synchronisation
              {hasSyncSecret ? (
                <span className="ml-1 font-normal text-muted-foreground">
                  (déjà configurée — laissez vide pour conserver)
                </span>
              ) : null}
            </Label>
            <Input
              id="espace-sync-secret"
              type="password"
              autoComplete="new-password"
              value={syncSecret}
              onChange={(e) => setSyncSecret(e.target.value)}
              placeholder="Clé partagée CRM ↔ portail"
              disabled={loading || saving || syncing}
              className="h-9"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={loading || saving || syncing || !portalUrl.trim()}
            onClick={() => void handleSavePortalConfig()}
          >
            Enregistrer la connexion
          </Button>
          {isActif ? (
            <Button
              type="button"
              size="sm"
              className="h-9"
              disabled={loading || saving || syncing}
              onClick={() => void handlePush()}
            >
              {syncing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-3.5 w-3.5" />
              )}
              Synchroniser vers le portail
            </Button>
          ) : null}
          {isActif && portalUrl.trim() ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => void handleOpenPortal()}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Ouvrir le portail
            </Button>
          ) : null}
        </div>
      </div>

      {isActif ? (
        <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">
              Journal des connexions
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={logLoading || !contact.id}
              onClick={() => contact.id && void loadConnexionLog(contact.id)}
            >
              {logLoading ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Actualiser
            </Button>
          </div>
          {connexionLog.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucune connexion enregistrée pour l'instant.
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
              {connexionLog.map((entry) => (
                <li
                  key={`${entry.id}-${entry.created_at}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-muted-foreground"
                >
                  <span className="text-foreground">
                    {formatEspaceConnexionEvent(entry.event)}
                  </span>
                  <span>{formatEspaceTimestamp(entry.created_at)}</span>
                  {entry.ip ? (
                    <span className="font-mono text-[10px]">{entry.ip}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {isActif && contact.id != null ? (
        <ContactEspaceEcheancesPanel contactId={contact.id} />
      ) : null}

      {isActif && contact.id != null ? (
        <ContactEspaceDemandesPanel contactId={contact.id} accesActif={isActif} />
      ) : null}

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent stacked>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer l'accès espace client ?</AlertDialogTitle>
            <AlertDialogDescription>
              {contact.prenom} {contact.nom} ne pourra plus se connecter. Vous
              pourrez réactiver l'accès plus tard avec la même procédure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void handleRevoke();
              }}
            >
              Révoquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
