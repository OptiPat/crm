import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MessageSquare, Send } from "lucide-react";
import {
  refineNewsletterContent,
  type GeneratedNewsletterContent,
  type NewsletterChatTurn,
} from "@/lib/api/tauri-newsletter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const QUICK_PROMPTS = [
  "Rends l'objet plus accrocheur",
  "Plus d'humour dans l'intro",
  "Raccourcis la section 2",
  "CTA plus direct vers un RDV",
  "Ton plus sobre, moins d'ironie",
  "Vulgarise davantage le jargon",
];

type NewsletterChatPanelProps = {
  draft: GeneratedNewsletterContent;
  onDraftUpdated: (next: GeneratedNewsletterContent) => void;
  history: NewsletterChatTurn[];
  onHistoryChange: (history: NewsletterChatTurn[]) => void;
  disabled?: boolean;
  className?: string;
};

export function NewsletterChatPanel({
  draft,
  onDraftUpdated,
  history,
  onHistoryChange,
  disabled,
  className,
}: NewsletterChatPanelProps) {
  const [message, setMessage] = useState("");
  const [refining, setRefining] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || refining || disabled) return;

    setRefining(true);
    setMessage("");
    const userTurn: NewsletterChatTurn = { role: "user", content: trimmed };
    const historyWithUser = [...history, userTurn];
    onHistoryChange(historyWithUser);

    try {
      const updated = await refineNewsletterContent({
        current: draft,
        message: trimmed,
        history,
      });
      onDraftUpdated(updated);
      onHistoryChange([
        ...historyWithUser,
        {
          role: "assistant",
          content: "Newsletter mise à jour — vérifiez l'aperçu et continuez si besoin.",
        },
      ]);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    } catch (e) {
      onHistoryChange(history);
      setMessage(trimmed);
      toast.error(e instanceof Error ? e.message : "Reformulation impossible");
    } finally {
      setRefining(false);
    }
  };

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Discuter avec Mistral
        </CardTitle>
        <CardDescription>
          Reformulez un point, ajustez le ton ou raccourcissez — la newsletter et l&apos;aperçu se
          mettent à jour.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto py-1 text-xs"
              disabled={disabled || refining}
              onClick={() => void sendMessage(prompt)}
            >
              {prompt}
            </Button>
          ))}
        </div>

        <div
          ref={scrollRef}
          className="max-h-48 overflow-y-auto rounded-lg border bg-muted/30 p-3 space-y-3 text-sm"
        >
          {history.length === 0 ?
            <p className="text-muted-foreground text-xs">
              Ex. « Rends le 2e point plus punchy » ou « Objet moins provocateur »
            </p>
          : history.map((turn, i) => (
              <div
                key={`${turn.role}-${i}`}
                className={cn(
                  "rounded-md px-3 py-2 max-w-[95%]",
                  turn.role === "user" ?
                    "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto bg-background border"
                )}
              >
                {turn.content}
              </div>
            ))
          }
          {refining && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Mistral réfléchit…
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Textarea
            placeholder="Votre demande de modification…"
            rows={2}
            value={message}
            disabled={disabled || refining}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(message);
              }
            }}
            className="text-sm resize-none"
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0 self-end"
            disabled={disabled || refining || !message.trim()}
            onClick={() => void sendMessage(message)}
            aria-label="Envoyer à Mistral"
          >
            {refining ?
              <Loader2 className="h-4 w-4 animate-spin" />
            : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}