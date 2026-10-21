import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Square } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { sendEmail } from "@/lib/api/tauri-email";
import {
  listTemplateCorrectionTargets,
  listTemplateSendDays,
  recordTemplateCorrectionSent,
  type TemplateCorrectionTarget,
  type TemplateSendDay,
} from "@/lib/api/tauri-template-correction";
import { appendEmailSignature, buildSendEmailBodies } from "@/lib/emails/email-signature";
import {
  correctionSubject,
  DEFAULT_CORRECTION_TEXT_TU,
  DEFAULT_CORRECTION_TEXT_VOUS,
  isTutoiement,
  renderCorrectionText,
  resolveTemplateAgendaUrl,
  sendableCorrectionTargets,
} from "@/lib/emails/template-email-correction";

/** Pause entre deux envois (quota Gmail, envoi progressif). */
const SEND_DELAY_MS = 1200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDay(day: string): string {
  const [y, m, d] = day.split("-");
  return d && m && y ? `${d}/${m}/${y}` : day;
}

interface Progress {
  sent: number;
  total: number;
  errors: string[];
  recordWarnings: string[];
}

export function TemplateEmailCorrectionDialog({
  template,
  open,
  onOpenChange,
}: {
  template: TemplateEmail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [cgp, setCgp] = useState<CgpConfig | null>(null);
  const [days, setDays] = useState<TemplateSendDay[]>([]);
  const [day, setDay] = useState<string>("");
  const [targets, setTargets] = useState<TemplateCorrectionTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [textTu, setTextTu] = useState(DEFAULT_CORRECTION_TEXT_TU);
  const [textVous, setTextVous] = useState(DEFAULT_CORRECTION_TEXT_VOUS);
  const [link, setLink] = useState("");
  const [testing, setTesting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const stopRef = useRef(false);

  // Chargement initial : signature, lien du modèle, jours d'envoi.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setProgress(null);
    void (async () => {
      try {
        const [config, sendDays] = await Promise.all([
          getCgpConfig(),
          listTemplateSendDays(template.id),
        ]);
        if (cancelled) return;
        setCgp(config);
        setLink(resolveTemplateAgendaUrl(template, config));
        setDays(sendDays);
        setDay(sendDays[0]?.day ?? "");
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Chargement impossible");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, template]);

  const loadTargets = useCallback(async () => {
    if (!day) {
      setTargets([]);
      return;
    }
    setLoading(true);
    try {
      setTargets(await listTemplateCorrectionTargets(template.id, day));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement des destinataires impossible");
    } finally {
      setLoading(false);
    }
  }, [day, template.id]);

  useEffect(() => {
    if (open) void loadTargets();
  }, [open, loadTargets]);

  const sendable = useMemo(() => sendableCorrectionTargets(targets), [targets]);
  const tuCount = sendable.filter(isTutoiement).length;
  const vousCount = sendable.length - tuCount;
  const alreadyCount = targets.filter((t) => t.already_corrected).length;
  const noEmailCount = targets.filter((t) => !t.already_corrected && !t.contact_email?.trim()).length;
  const sampleTu = sendable.find(isTutoiement) ?? null;
  const sampleVous = sendable.find((t) => !isTutoiement(t)) ?? null;
  const linkOk = /^https?:\/\/\S+$/i.test(link.trim());
  const textsOk =
    textTu.includes("{lien}") === textVous.includes("{lien}") &&
    textTu.trim().length > 0 &&
    textVous.trim().length > 0;

  const textFor = (t: TemplateCorrectionTarget) =>
    renderCorrectionText(isTutoiement(t) ? textTu : textVous, t, link);

  const bodiesFor = (plain: string) =>
    buildSendEmailBodies(appendEmailSignature(plain, cgp?.email_signature), cgp);

  const handleTest = async () => {
    const sample = sampleTu ?? sampleVous;
    if (!sample || !cgp?.email) {
      toast.error("Aucun destinataire ou adresse du cabinet manquante (Paramètres → Profil).");
      return;
    }
    setTesting(true);
    try {
      const plain = textFor(sample);
      const { body, body_html } = bodiesFor(plain);
      await sendEmail({
        to_email: cgp.email,
        subject: `[TEST] ${correctionSubject(sample.sent_subject)}`,
        body,
        body_html,
      });
      toast.success(`Test envoyé à ${cgp.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi du test impossible");
    } finally {
      setTesting(false);
    }
  };

  const handleSendAll = async () => {
    setConfirmOpen(false);
    const list = sendableCorrectionTargets(targets);
    if (list.length === 0) return;
    stopRef.current = false;
    setSending(true);
    const state: Progress = { sent: 0, total: list.length, errors: [], recordWarnings: [] };
    setProgress({ ...state });
    for (const t of list) {
      if (stopRef.current) break;
      const name = `${t.contact_prenom} ${t.contact_nom}`.trim();
      const plain = textFor(t);
      const subject = correctionSubject(t.sent_subject);
      try {
        const { body, body_html } = bodiesFor(plain);
        await sendEmail({
          to_email: t.contact_email!.trim(),
          to_name: name,
          subject,
          body,
          body_html,
          thread_id: t.gmail_thread_id,
          in_reply_to_message_id: t.gmail_message_id,
          audit_contact_id: t.contact_id,
        });
        state.sent += 1;
        try {
          await recordTemplateCorrectionSent({
            contactId: t.contact_id,
            queueRowKind: t.queue_row_kind,
            rowId: t.row_id,
            subject,
            body: plain,
          });
        } catch {
          // Parti mais non tracé : signalé pour ne pas le renvoyer.
          state.recordWarnings.push(name);
        }
      } catch (e) {
        state.errors.push(`${name} : ${e instanceof Error ? e.message : String(e)}`);
      }
      setProgress({ ...state });
      if (!stopRef.current) await sleep(SEND_DELAY_MS);
    }
    setSending(false);
    await loadTargets();
    if (state.recordWarnings.length > 0) {
      toast.warning(
        `Envoyé mais non tracé dans le CRM : ${state.recordWarnings.join(", ")}. Ne pas renvoyer.`,
        { duration: 20_000 }
      );
    }
    if (state.errors.length > 0) {
      toast.warning(`${state.sent} correctif(s) envoyé(s), ${state.errors.length} en erreur.`);
    } else {
      toast.success(
        stopRef.current
          ? `Envoi arrêté : ${state.sent} correctif(s) envoyé(s).`
          : `${state.sent} correctif(s) envoyé(s).`
      );
    }
  };

  const preview = (sample: TemplateCorrectionTarget | null, label: string) =>
    sample ? (
      <div className="rounded-md border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          {label} — exemple : {sample.contact_prenom} {sample.contact_nom}
        </p>
        <p className="text-sm font-medium">{correctionSubject(sample.sent_subject)}</p>
        <p className="text-sm whitespace-pre-wrap">{textFor(sample)}</p>
        <p className="text-xs text-muted-foreground italic">+ votre signature</p>
      </div>
    ) : null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (sending) return;
          onOpenChange(next);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Envoyer un correctif</DialogTitle>
            <DialogDescription>
              Répond dans la conversation de chaque destinataire de « {template.nom} » (même
              conversation, objet « Re: »). Rien ne part avant votre confirmation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Envoi à corriger</Label>
              {days.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun envoi de ce modèle sur les 90 derniers jours.
                </p>
              ) : (
                <Select value={day} onValueChange={setDay} disabled={sending}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir le jour d'envoi" />
                  </SelectTrigger>
                  <SelectContent>
                    {days.map((d) => (
                      <SelectItem key={d.day} value={d.day}>
                        Envoyé le {formatDay(d.day)} — {d.count} destinataire
                        {d.count > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {day && (
                <p className="text-xs text-muted-foreground">
                  {loading
                    ? "Chargement…"
                    : `${sendable.length} à envoyer (${tuCount} tu, ${vousCount} vous)` +
                      (alreadyCount > 0 ? ` · ${alreadyCount} déjà corrigé(s)` : "") +
                      (noEmailCount > 0 ? ` · ${noEmailCount} sans email` : "")}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="correction-link">Lien {"{lien}"}</Label>
              <Input
                id="correction-link"
                value={link}
                disabled={sending}
                onChange={(e) => setLink(e.target.value)}
              />
              {!linkOk && <p className="text-xs text-destructive">Lien invalide.</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="correction-tu">Message (tu)</Label>
                <Textarea
                  id="correction-tu"
                  rows={7}
                  value={textTu}
                  disabled={sending}
                  onChange={(e) => setTextTu(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="correction-vous">Message (vous)</Label>
                <Textarea
                  id="correction-vous"
                  rows={7}
                  value={textVous}
                  disabled={sending}
                  onChange={(e) => setTextVous(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {"{prenom}"} = prénom du contact · {"{lien}"} = lien ci-dessus. Votre signature est
              ajoutée automatiquement.
            </p>

            <div className="space-y-2">
              <Label>Aperçu</Label>
              {preview(sampleTu, "Tutoiement")}
              {preview(sampleVous, "Vouvoiement")}
            </div>

            {progress && (
              <div className="space-y-1">
                <div className="h-2 rounded bg-muted overflow-hidden">
                  <div
                    className="h-2 bg-primary transition-all"
                    style={{
                      width: `${progress.total > 0 ? Math.round(((progress.sent + progress.errors.length) / progress.total) * 100) : 0}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {progress.sent} / {progress.total} envoyé(s)
                  {progress.errors.length > 0 ? ` · ${progress.errors.length} erreur(s)` : ""}
                </p>
                {progress.errors.length > 0 && (
                  <ul className="text-xs text-destructive max-h-24 overflow-y-auto">
                    {progress.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {sending ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  stopRef.current = true;
                }}
              >
                <Square className="h-4 w-4 mr-1" />
                Arrêter
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={testing || !linkOk || !textsOk || sendable.length === 0}
                  onClick={() => void handleTest()}
                >
                  {testing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  M&apos;envoyer un test
                </Button>
                <Button
                  type="button"
                  disabled={!linkOk || !textsOk || sendable.length === 0 || loading}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Send className="h-4 w-4 mr-1" />
                  Envoyer à {sendable.length} contact{sendable.length > 1 ? "s" : ""}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Envoyer le correctif ?</AlertDialogTitle>
            <AlertDialogDescription>
              {sendable.length} email{sendable.length > 1 ? "s" : ""} vont partir ({tuCount} tu,{" "}
              {vousCount} vous), un par un, en réponse au mail d&apos;origine. Les emails déjà
              partis ne peuvent pas être rappelés. Vous pouvez arrêter l&apos;envoi en cours de route.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleSendAll()}>Envoyer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
