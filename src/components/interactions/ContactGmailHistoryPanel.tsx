import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, Inbox, Loader2, Mail, RefreshCw, Send } from "lucide-react";
import {
  getContactGmailMessages,
  syncContactGmailMessages,
  type ContactGmailMessage,
} from "@/lib/api/tauri-contact-gmail";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { groupContactGmailMessages } from "@/lib/contacts/gmail-history-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ContactGmailHistoryPanelProps {
  contactId: number;
  contactEmail?: string | null;
}

function formatSentAt(ts: number): string {
  return new Date(ts * 1000).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function directionLabel(direction: string): string {
  if (direction === "inbound") return "Reçu";
  if (direction === "outbound") return "Envoyé";
  return "Email";
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === "outbound") return <Send className="h-3.5 w-3.5" />;
  return <Inbox className="h-3.5 w-3.5" />;
}

function GmailMessageRow({ message }: { message: ContactGmailMessage }) {
  const [expanded, setExpanded] = useState(false);
  const preview =
    message.snippet?.trim() ||
    message.body_text?.trim().slice(0, 280) ||
    "(aucun aperçu)";
  const fullBody = message.body_text?.trim();

  return (
    <div className="rounded-md border bg-card/50 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-start gap-2 justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 gap-1 text-xs",
              message.direction === "inbound" && "border-emerald-300 text-emerald-800",
              message.direction === "outbound" && "border-blue-300 text-blue-800"
            )}
          >
            <DirectionIcon direction={message.direction} />
            {directionLabel(message.direction)}
          </Badge>
          <span className="font-medium truncate">
            {message.subject?.trim() || "(sans objet)"}
          </span>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatSentAt(message.sent_at)}
        </span>
      </div>
      <p className="mt-1.5 text-muted-foreground line-clamp-2">{preview}</p>
      {fullBody && fullBody.length > preview.length && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 px-2 text-xs gap-1"
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
            />
            {expanded ? "Réduire" : "Lire le message"}
          </Button>
          {expanded && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-foreground/90 font-sans max-h-48 overflow-y-auto rounded bg-muted/40 p-2">
              {fullBody}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

export function ContactGmailHistoryPanel({
  contactId,
  contactEmail,
}: ContactGmailHistoryPanelProps) {
  const [messages, setMessages] = useState<ContactGmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [list, status] = await Promise.all([
        getContactGmailMessages(contactId),
        getEmailConnectionStatus(),
      ]);
      setMessages(list);
      setGoogleConnected(
        status.connected && status.method === "oauth" && status.provider === "google"
      );
    } catch (error) {
      console.error(error);
      setMessages([]);
      toast.error("Impossible de charger l'historique Gmail");
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    if (!contactEmail?.trim()) {
      toast.error("Ajoutez une adresse email au contact pour synchroniser Gmail.");
      return;
    }
    try {
      setSyncing(true);
      const result = await syncContactGmailMessages(contactId);
      await load();
      if (result.imported === 0 && result.skipped > 0) {
        toast.info("Historique à jour — aucun nouveau message.");
      } else {
        toast.success(
          `${result.imported} message${result.imported > 1 ? "s" : ""} importé${result.imported > 1 ? "s" : ""} (${result.scanned} analysé${result.scanned > 1 ? "s" : ""})`
        );
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSyncing(false);
    }
  };

  const groups = groupContactGmailMessages(messages);
  const hasEmail = Boolean(contactEmail?.trim());

  return (
    <Card className="border-slate-200/80 shadow-sm mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Historique Gmail
              {!loading && messages.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({messages.length} message{messages.length > 1 ? "s" : ""})
                </span>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              Échanges réels avec{" "}
              {hasEmail ? (
                <strong>{contactEmail}</strong>
              ) : (
                "ce contact (email manquant)"
              )}{" "}
              — classés par année et mois (5 dernières années max. par sync).
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 shrink-0"
            disabled={syncing || !hasEmail || googleConnected === false}
            onClick={() => void handleSync()}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Synchroniser
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {googleConnected === false && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Connectez un compte Google dans Paramètres → Email pour importer l&apos;historique
            Gmail.
          </p>
        )}
        {!hasEmail && (
          <p className="text-sm text-muted-foreground">
            Renseignez l&apos;email du contact pour lancer une synchronisation.
          </p>
        )}
        {loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </p>
        )}
        {!loading && messages.length === 0 && hasEmail && googleConnected !== false && (
          <p className="text-sm text-muted-foreground">
            Aucun message enregistré. Cliquez sur Synchroniser pour importer les échanges Gmail
            (jusqu&apos;à 500 messages par synchronisation).
          </p>
        )}
        {!loading &&
          groups.map((yearGroup) => (
            <details key={yearGroup.year} open className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm font-semibold hover:bg-muted [&::-webkit-details-marker]:hidden">
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                {yearGroup.year}
                <span className="text-muted-foreground font-normal">
                  (
                  {yearGroup.months.reduce((n, m) => n + m.items.length, 0)} message
                  {yearGroup.months.reduce((n, m) => n + m.items.length, 0) > 1 ? "s" : ""})
                </span>
              </summary>
              <div className="mt-2 space-y-3 pl-1">
                {yearGroup.months.map((month) => (
                  <div key={month.key}>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">
                      {month.label} {yearGroup.year}
                    </h4>
                    <div className="space-y-2">
                      {month.items.map((m) => (
                        <GmailMessageRow key={m.id} message={m} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
      </CardContent>
    </Card>
  );
}
