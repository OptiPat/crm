import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mail, Send, AlertTriangle, CheckCircle2, RefreshCw, ExternalLink } from "lucide-react";
import {
  getEtiquetteEmailQueue,
  markEtiquetteEmailSent,
  getContrastColor,
  type EtiquetteEmailQueueItem,
} from "@/lib/api/tauri-etiquettes";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { sendEmail } from "@/lib/api/tauri-email";
import {
  formatEtiquetteSendDatetime,
  getIncompleteQueueLabel,
  renderEtiquetteEmailPreview,
} from "@/lib/etiquettes/etiquette-email-preview";
import { toast } from "sonner";

interface EtiquetteEnvoisTabProps {
  onOpenContact?: (contactId: number) => void;
  onQueueChanged?: () => void;
}

export function EtiquetteEnvoisTab({ onOpenContact, onQueueChanged }: EtiquetteEnvoisTabProps) {
  const [ready, setReady] = useState<EtiquetteEmailQueueItem[]>([]);
  const [incomplete, setIncomplete] = useState<EtiquetteEmailQueueItem[]>([]);
  const [sent, setSent] = useState<EtiquetteEmailQueueItem[]>([]);
  const [cgpConfig, setCgpConfig] = useState<CgpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<"ready" | "incomplete" | "sent">("ready");
  const [confirmItem, setConfirmItem] = useState<EtiquetteEmailQueueItem | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      const [cgp, r, i, s] = await Promise.all([
        getCgpConfig(),
        getEtiquetteEmailQueue("ready"),
        getEtiquetteEmailQueue("incomplete"),
        getEtiquetteEmailQueue("sent"),
      ]);
      setCgpConfig(cgp);
      setReady(r);
      setIncomplete(i);
      setSent(s);
      onQueueChanged?.();
    } catch (error) {
      console.error("Error loading email queue:", error);
      toast.error("Erreur lors du chargement de la file d'envoi");
    } finally {
      setLoading(false);
    }
  }, [onQueueChanged]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const openConfirm = async (item: EtiquetteEmailQueueItem) => {
    try {
      const cgp = cgpConfig ?? (await getCgpConfig());
      const preview = renderEtiquetteEmailPreview(item, cgp);
      setConfirmItem(item);
      setSubject(preview.subject);
      setBody(preview.body);
    } catch (error) {
      console.error(error);
      toast.error("Impossible de préparer l'aperçu");
    }
  };

  const handleSend = async () => {
    if (!confirmItem?.contact_email) return;
    setSending(true);
    try {
      await sendEmail({
        to_email: confirmItem.contact_email,
        to_name: `${confirmItem.contact_prenom} ${confirmItem.contact_nom}`,
        subject: subject.trim(),
        body,
      });
      try {
        await markEtiquetteEmailSent(confirmItem.contact_etiquette_id);
      } catch (markError) {
        console.error(markError);
        toast.warning(
          "Email envoyé, mais l'enregistrement CRM a échoué — ne renvoyez pas sans vérifier la fiche."
        );
        setConfirmItem(null);
        await loadQueue();
        return;
      }
      toast.success(`Email envoyé à ${confirmItem.contact_prenom} ${confirmItem.contact_nom}`);
      setConfirmItem(null);
      await loadQueue();
    } catch (error) {
      console.error("Error sending etiquette email:", error);
      toast.error(
        error instanceof Error ? error.message : "Erreur lors de l'envoi (vérifiez la config SMTP)"
      );
    } finally {
      setSending(false);
    }
  };

  const renderList = (
    items: EtiquetteEmailQueueItem[],
    options: { mode: "ready" | "incomplete" | "sent" }
  ) => {
    if (loading) {
      return (
        <div className="text-center py-8 text-muted-foreground">Chargement...</div>
      );
    }
    if (items.length === 0) {
      const empty =
        options.mode === "ready"
          ? "Aucun email prêt à envoyer. Vérifiez la date d'envoi de l'étiquette et que des contacts sont taggés."
          : options.mode === "incomplete"
            ? "Aucun contact en attente de complément."
            : "Aucun envoi récent enregistré.";
      return <div className="text-center py-8 text-muted-foreground">{empty}</div>;
    }

    return (
      <div className="space-y-3">
        {items.map((item) => {
          const preview =
            options.mode === "ready" && cgpConfig
              ? renderEtiquetteEmailPreview(item, cgpConfig)
              : null;

          return (
            <div
              key={item.contact_etiquette_id}
              className="p-4 border rounded-lg bg-card flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {item.contact_prenom} {item.contact_nom}
                  </span>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: item.etiquette_couleur,
                      color: getContrastColor(item.etiquette_couleur),
                    }}
                  >
                    {item.etiquette_nom}
                  </span>
                </div>
                {options.mode === "incomplete" ? (
                  <p className="text-sm text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {getIncompleteQueueLabel(item.queue_issue)}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground truncate">
                    {item.contact_email ?? "—"}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {options.mode === "sent"
                    ? `Envoyé le ${formatEtiquetteSendDatetime(item.email_date_envoi)}`
                    : `Prévu le ${formatEtiquetteSendDatetime(item.email_date_prevue)}`}
                </p>
                {options.mode === "ready" && preview && (
                  <p className="text-xs text-muted-foreground truncate">
                    Objet : {preview.subject}
                  </p>
                )}
                {options.mode === "sent" && item.template_sujet && (
                  <p className="text-xs text-muted-foreground truncate">
                    Objet : {item.template_sujet}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                {options.mode === "ready" && (
                  <Button size="sm" onClick={() => void openConfirm(item)}>
                    <Send className="h-4 w-4 mr-1" />
                    Confirmer et envoyer
                  </Button>
                )}
                {options.mode === "incomplete" &&
                  (item.queue_issue === "NO_EMAIL" || item.queue_issue === "OTHER") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (onOpenContact) {
                        onOpenContact(item.contact_id);
                      } else {
                        toast.info(
                          `Ajoutez l'email de ${item.contact_prenom} ${item.contact_nom} depuis l'onglet Contacts.`
                        );
                      }
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Compléter la fiche
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              File d&apos;envoi
            </CardTitle>
            <CardDescription>
              Les emails ne partent qu&apos;après votre confirmation, un contact à la fois.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={subTab} onValueChange={(v) => setSubTab(v as typeof subTab)}>
            <TabsList>
              <TabsTrigger value="ready" className="gap-2">
                Prêts à envoyer
                {ready.length > 0 && (
                  <Badge variant="secondary">{ready.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="incomplete" className="gap-2">
                À compléter
                {incomplete.length > 0 && (
                  <Badge variant="secondary" className="bg-amber-100">
                    {incomplete.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="sent" className="gap-2">
                Envoyés
                {sent.length > 0 && (
                  <Badge variant="outline">{sent.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ready" className="mt-4">
              {renderList(ready, { mode: "ready" })}
            </TabsContent>
            <TabsContent value="incomplete" className="mt-4">
              {renderList(incomplete, { mode: "incomplete" })}
            </TabsContent>
            <TabsContent value="sent" className="mt-4">
              {renderList(sent, { mode: "sent" })}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!confirmItem} onOpenChange={(o) => !o && setConfirmItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmer l&apos;envoi</DialogTitle>
            <DialogDescription>
              {confirmItem && (
                <>
                  À <strong>{confirmItem.contact_email}</strong> — étiquette{" "}
                  <strong>{confirmItem.etiquette_nom}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-subject">Objet</Label>
              <Input
                id="confirm-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-body">Message</Label>
              <Textarea
                id="confirm-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmItem(null)} disabled={sending}>
              Annuler
            </Button>
            <Button
              onClick={() => void handleSend()}
              disabled={sending || !subject.trim() || !body.trim()}
            >
              {sending ? "Envoi..." : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Envoyer maintenant
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
