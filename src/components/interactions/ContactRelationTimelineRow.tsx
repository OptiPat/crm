import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  ExternalLink,
  FileText,
  Inbox,
  ListTodo,
  Loader2,
  Mail,
  MessageSquareReply,
  Paperclip,
  Pencil,
  Phone,
  Send,
  Trash2,
  Wallet,
} from "lucide-react";
import { echeanceLabel } from "@/lib/taches/tache-display";
import type { Interaction } from "@/lib/api/tauri-interactions";
import {
  emailRelationSubtitle,
  emailRelationTitle,
  type ContactRelationTimelineItem,
} from "@/lib/interactions/contact-relation-timeline";
import { getSentSubjectLabel } from "@/lib/interactions/exchange-history-display";
import { getDocumentMetaLines } from "@/lib/documents/document-display";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import { INTERACTION_TYPES } from "@/lib/api/tauri-interactions";
import type { ContactGmailMessage } from "@/lib/api/tauri-contact-gmail";
import {
  fetchContactGmailMessageBody,
  openContactMailAttachment,
  openGmailMessage,
  parseAttachments,
  type MailAttachmentMeta,
} from "@/lib/api/tauri-contact-gmail";
import { toast } from "sonner";

const TYPE_ICONS: Record<string, typeof Phone> = {
  APPEL: Phone,
  EMAIL: Mail,
  RDV: Calendar,
  NOTE: FileText,
  AUTRE: FileText,
};

function formatInteractionDate(ts: number): string {
  try {
    return new Date(ts * 1000).toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function getTypeLabel(value: string): string {
  return INTERACTION_TYPES.find((t) => t.value === value)?.label || value;
}

function formatEuroFromCents(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Corps déjà importé avant correction HTML → forcer un nouveau fetch Gmail. */
function isLikelyCssGarbage(text: string): boolean {
  const t = text.trim();
  if (t.length < 80) return false;
  if (t.includes("!important") && t.includes("{")) return true;
  if (t.includes("@font-face") || t.startsWith("* {") || t.startsWith("*{")) return true;
  if (t.includes("mso-table-lspace") || t.includes("-webkit-text-size-adjust")) return true;
  return false;
}

function formatBytes(size: number | null | undefined): string {
  if (size == null || size <= 0) return "";
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function AttachmentsList({
  items,
}: {
  items: { messageRowId: number; attachment: MailAttachmentMeta }[];
}) {
  if (items.length === 0) return null;

  const openAttachment = (messageRowId: number, a: MailAttachmentMeta) => {
    const id = a.attachmentId?.trim();
    if (!id) {
      toast.error(
        "Pièce jointe non enregistrée — relancez « Sync boîte mail » sur ce contact."
      );
      return;
    }
    void openContactMailAttachment(messageRowId, id).catch((e) => toast.error(String(e)));
  };

  return (
    <ul className="mt-1.5 flex flex-wrap gap-1">
      {items.map(({ messageRowId, attachment: a }, i) => {
        const canOpen = Boolean(a.attachmentId?.trim());
        return (
          <li key={`${messageRowId}-${a.name}-${i}`}>
            <button
              type="button"
              disabled={!canOpen}
              title={
                canOpen
                  ? "Ouvrir la pièce jointe"
                  : "Resynchronisez la boîte mail pour activer l’ouverture"
              }
              onClick={() => openAttachment(messageRowId, a)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 hover:bg-muted rounded px-1.5 py-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="max-w-[200px] truncate">{a.name}</span>
              {a.size_bytes != null && a.size_bytes > 0 && (
                <span className="opacity-70">({formatBytes(a.size_bytes)})</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MailboxMessageBody({
  message,
  onAttachmentsLoaded,
}: {
  message: ContactGmailMessage;
  onAttachmentsLoaded?: (attachmentsJson: string | null) => void;
}) {
  const [attachments, setAttachments] = useState(() =>
    parseAttachments(message.attachments_json)
  );
  const [expanded, setExpanded] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const [body, setBody] = useState(message.body_text?.trim() ?? "");

  const preview = message.snippet?.trim() || body.slice(0, 280) || "(aucun aperçu)";

  const loadFull = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    const cached = body.trim();
    const canUseCache =
      message.body_fetched && cached && !isLikelyCssGarbage(cached);
    if (canUseCache && attachments.length > 0) {
      setExpanded(true);
      return;
    }
    setLoadingBody(true);
    try {
      const fetched = await fetchContactGmailMessageBody(message.id);
      setBody(fetched.body);
      if (fetched.attachmentsJson) {
        setAttachments(parseAttachments(fetched.attachmentsJson));
        onAttachmentsLoaded?.(fetched.attachmentsJson);
      }
      setExpanded(true);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoadingBody(false);
    }
  };

  const attachmentItems = attachments.map((attachment) => ({
    messageRowId: message.id,
    attachment,
  }));

  return (
    <div className="mt-2 border-t border-border/50 pt-2">
      {attachmentItems.length > 0 ? (
        <AttachmentsList items={attachmentItems} />
      ) : (
        <p className="text-xs text-muted-foreground italic mt-1">
          Pièces jointes : cliquez sur « Lire le message » ou relancez Sync boîte mail.
        </p>
      )}
      {!expanded && (
        <p className="text-muted-foreground line-clamp-2 text-sm mt-1">{preview}</p>
      )}
      <div className="flex flex-wrap gap-2 mt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={loadingBody}
          onClick={() => void loadFull()}
        >
          {loadingBody ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {expanded ? "Masquer" : "Lire le message"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() =>
            void openGmailMessage(message.gmail_message_id, message.gmail_thread_id).catch((e) =>
              toast.error(String(e))
            )
          }
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Gmail
        </Button>
      </div>
      {expanded && body && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded bg-muted/40 p-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
          {body}
        </div>
      )}
    </div>
  );
}

function MailboxThreadBlock({ item }: { item: Extract<ContactRelationTimelineItem, { kind: "mailbox_thread" }> }) {
  const { latest, messages } = item;
  const [threadAttachments, setThreadAttachments] = useState(() => {
    const items = messages.flatMap((m) =>
      parseAttachments(m.attachments_json).map((att) => ({ message: m, att }))
    );
    return items.filter(
      (entry, i, arr) =>
        arr.findIndex(
          (b) =>
            b.message.id === entry.message.id &&
            (b.att.attachmentId ?? b.att.name) ===
              (entry.att.attachmentId ?? entry.att.name)
        ) === i
    );
  });
  const isMulti = messages.length > 1;
  const dirLabel =
    latest.direction === "outbound" ? "Envoyé" : latest.direction === "inbound" ? "Reçu" : "Email";

  return (
    <li className="relative flex flex-col gap-2 p-3 pl-1 border border-slate-200/80 rounded-lg bg-card text-sm">
      <div className="flex items-start gap-3 min-w-0">
        <span className="p-2 rounded-lg bg-slate-100 shrink-0 h-fit">
          {latest.direction === "outbound" ? (
            <Send className="h-4 w-4 text-blue-700" />
          ) : (
            <Inbox className="h-4 w-4 text-emerald-700" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <Badge variant="outline" className="text-xs border-slate-300">
              Boîte mail
            </Badge>
            <Badge variant="outline" className="text-xs">
              {dirLabel}
            </Badge>
            {isMulti && (
              <Badge variant="secondary" className="text-xs">
                Fil · {messages.length} messages
              </Badge>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatInteractionDate(latest.sent_at)}
            </span>
          </div>
          <p className="font-medium leading-snug">
            {latest.subject?.trim() || "(sans objet)"}
          </p>
          {threadAttachments.length > 0 ? (
            <AttachmentsList
              items={threadAttachments.map(({ message: m, att }) => ({
                messageRowId: m.id,
                attachment: att,
              }))}
            />
          ) : null}
          {!isMulti && <MailboxMessageBody message={latest} />}
        </div>
      </div>
      {isMulti && (
        <details className="ml-11 group">
          <summary className="cursor-pointer text-xs font-medium text-primary hover:underline list-none">
            Voir les {messages.length} messages du fil
          </summary>
          <ul className="mt-2 space-y-3 border-l-2 border-border/60 pl-3">
            {messages.map((m) => (
              <li key={m.id}>
                <p className="text-xs text-muted-foreground">{formatInteractionDate(m.sent_at)}</p>
                <p className="font-medium text-sm">{m.subject?.trim() || "(sans objet)"}</p>
                <MailboxMessageBody
                  message={m}
                  onAttachmentsLoaded={(json) => {
                    const parsed = parseAttachments(json);
                    if (parsed.length === 0) return;
                    setThreadAttachments((prev) => {
                      const next = [
                        ...prev.filter((p) => p.message.id !== m.id),
                        ...parsed.map((att) => ({ message: m, att })),
                      ];
                      return next.filter(
                        (entry, i, arr) =>
                          arr.findIndex(
                            (b) =>
                              b.message.id === entry.message.id &&
                              (b.att.attachmentId ?? b.att.name) ===
                                (entry.att.attachmentId ?? entry.att.name)
                          ) === i
                      );
                    });
                  }}
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export function ContactRelationTimelineRow({
  item,
  onEdit,
  onDelete,
  onOpenHistorique,
}: {
  item: ContactRelationTimelineItem;
  onEdit?: (interaction: Interaction) => void;
  onDelete?: (interactionId: number) => void;
  onOpenHistorique?: () => void;
}) {
  if (item.kind === "email") {
    const { entry } = item;
    const reponseBody = entry.email_reponse_body?.trim();
    const sentAt = entry.sent_at ?? entry.sort_date;

    return (
      <li className="relative flex flex-col gap-2 p-3 pl-1 border border-border/80 rounded-lg bg-card text-sm">
        <div className="flex items-start gap-3 min-w-0">
          <span className="p-2 rounded-lg bg-primary/5 shrink-0 h-fit">
            <Mail className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <Badge variant="outline" className="text-xs">
                Email campagne
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatInteractionDate(sentAt)}
              </span>
              {entry.email_reponse_at && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 px-1.5 border-emerald-200 text-emerald-800"
                >
                  Répondu
                </Badge>
              )}
            </div>
            <p className="font-medium leading-snug">{emailRelationTitle(entry)}</p>
            {getSentSubjectLabel(entry) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Objet : {getSentSubjectLabel(entry)}
              </p>
            )}

            {entry.email_reponse_at ? (
              <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Réponse du contact
                  {emailRelationSubtitle(entry)
                    ? ` — ${emailRelationSubtitle(entry)}`
                    : ""}
                  {" · "}
                  <span className="tabular-nums font-normal">
                    {formatInteractionDate(entry.email_reponse_at)}
                  </span>
                </p>
                {entry.email_reponse_type === "mail" && reponseBody ? (
                  <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed text-sm">
                    {reponseBody}
                  </p>
                ) : entry.email_reponse_type === "mail" ? (
                  <p className="text-xs text-muted-foreground italic">
                    Texte non importé — ouvrez Historique des échanges pour importer depuis
                    Gmail.
                  </p>
                ) : entry.email_reponse_type === "rdv" ? (
                  <p className="text-xs text-muted-foreground">
                    Rendez-vous enregistré après cet envoi.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {onOpenHistorique && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start ml-11 gap-1"
            onClick={onOpenHistorique}
          >
            <MessageSquareReply className="h-3.5 w-3.5" />
            Répondre dans Historique
          </Button>
        )}
      </li>
    );
  }

  if (item.kind === "mailbox_thread") {
    return <MailboxThreadBlock item={item} />;
  }

  if (item.kind === "investissement") {
    const inv = item.investissement;
    const montant = formatEuroFromCents(inv.montant_initial);
    return (
      <li className="relative flex items-start gap-3 p-3 pl-1 border border-border/80 rounded-lg bg-card text-sm">
        <span className="p-2 rounded-lg bg-amber-50 shrink-0 h-fit">
          <Wallet className="h-4 w-4 text-amber-600" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <Badge variant="outline" className="text-xs">
              Investissement
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatInteractionDate(item.sort_date)}
            </span>
          </div>
          <p className="font-medium leading-snug">{inv.nom_produit}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {inv.type_produit}
            {montant ? ` · ${montant}` : ""}
          </p>
        </div>
      </li>
    );
  }

  if (item.kind === "document") {
    const doc = item.document;
    const validityLine = getDocumentMetaLines(doc).find((line) => line.label === "Validité");
    return (
      <li className="relative flex items-start gap-3 p-3 pl-1 border border-border/80 rounded-lg bg-card text-sm">
        <span className="p-2 rounded-lg bg-slate-100 shrink-0 h-fit">
          <FileText className="h-4 w-4 text-slate-600" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <Badge variant="outline" className="text-xs">
              Document
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatInteractionDate(item.sort_date)}
            </span>
          </div>
          <p className="font-medium leading-snug break-all">{doc.nom_fichier}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {getDocumentTypeLabel(doc.type_document)}
          </p>
          {validityLine && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Validité : {validityLine.value}
            </p>
          )}
        </div>
      </li>
    );
  }

  if (item.kind === "tache") {
    const tache = item.tache;
    const done = tache.statut === "FAIT";
    return (
      <li className="relative flex items-start gap-3 p-3 pl-1 border border-border/80 rounded-lg bg-card text-sm">
        <span className="p-2 rounded-lg bg-primary/5 shrink-0 h-fit">
          <ListTodo className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <Badge variant="outline" className="text-xs">
              Tâche
            </Badge>
            <Badge
              variant="outline"
              className={`text-[10px] h-5 px-1.5 ${
                done
                  ? "border-emerald-200 text-emerald-800"
                  : "border-amber-200 text-amber-800"
              }`}
            >
              {done ? "Faite" : "À faire"}
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {echeanceLabel(tache.date_echeance, tache.statut)}
            </span>
          </div>
          <p className={`font-medium leading-snug ${done ? "line-through text-muted-foreground" : ""}`}>
            {tache.titre}
          </p>
          {tache.description && (
            <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
              {tache.description}
            </p>
          )}
        </div>
      </li>
    );
  }

  const { interaction } = item;
  const Icon = TYPE_ICONS[interaction.type_interaction] || FileText;

  return (
    <li className="relative flex items-start justify-between gap-2 p-3 pl-1 border border-border/80 rounded-lg bg-card hover:bg-accent/40 transition-colors text-sm">
      <div className="flex gap-3 min-w-0">
        <span className="p-2 rounded-lg bg-primary/5 shrink-0 h-fit">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <Badge variant="outline" className="text-xs">
              {getTypeLabel(interaction.type_interaction)}
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatInteractionDate(interaction.date_interaction)}
            </span>
          </div>
          {interaction.sujet && <p className="font-medium">{interaction.sujet}</p>}
          {interaction.contenu && (
            <p className="text-muted-foreground mt-1 whitespace-pre-wrap">
              {interaction.contenu}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5">
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(interaction)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => onDelete(interaction.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
}
