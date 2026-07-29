import { useRef, useState } from "react";
import { Copy, Loader2, MessageSquare, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParrainagePipeRecord } from "@/lib/api/tauri-parrainage-pipe";
import { createParrainagePipeTimelineNote } from "@/lib/api/tauri-parrainage-pipe";
import {
  generateParrainageScript,
  refineParrainageScript,
  type ParrainageScriptContent,
} from "@/lib/api/tauri-parrainage-coach";
import {
  formatParrainageScriptAsNote,
  PARRAINAGE_COACH_PRIVACY_ACK_KEY,
  PARRAINAGE_COACH_QUICK_PROMPTS,
  PARRAINAGE_SCRIPT_CANAL_LABELS,
  type ParrainageCoachChatTurn,
  type ParrainageScriptCanal,
} from "@/lib/parrainage-coach/parrainage-coach-types";
import { PARRAINAGE_PIPE_STAGE_LABELS, type ParrainagePipeStage } from "@/lib/parrainage-pipe/parrainage-pipe-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function ScriptBlock({ label, text }: { label: string; text: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copié");
    } catch {
      toast.error("Copie impossible");
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void copy()}>
          <Copy className="size-3.5" />
        </Button>
      </div>
      <p className="text-sm whitespace-pre-wrap rounded-md border border-border/50 bg-muted/20 px-3 py-2">
        {text}
      </p>
    </div>
  );
}

interface ParrainageScriptPanelProps {
  pipe: ParrainagePipeRecord;
  onNoteSaved?: () => void;
}

export function ParrainageScriptPanel({ pipe, onNoteSaved }: ParrainageScriptPanelProps) {
  const stage = pipe.stage as ParrainagePipeStage;
  const isInscrit = stage === "INSCRIT";
  const [canal, setCanal] = useState<ParrainageScriptCanal>("APPEL");
  const [script, setScript] = useState<ParrainageScriptContent | null>(null);
  const [history, setHistory] = useState<ParrainageCoachChatTurn[]>([]);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [message, setMessage] = useState("");
  const [privacyAck, setPrivacyAck] = useState(
    () => localStorage.getItem(PARRAINAGE_COACH_PRIVACY_ACK_KEY) === "1"
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const acknowledgePrivacy = () => {
    localStorage.setItem(PARRAINAGE_COACH_PRIVACY_ACK_KEY, "1");
    setPrivacyAck(true);
  };

  const handleGenerate = async () => {
    if (!privacyAck) acknowledgePrivacy();
    setGenerating(true);
    setHistory([]);
    try {
      const result = await generateParrainageScript({
        parrainagePipeId: pipe.id,
        canal,
      });
      setScript(result);
      toast.success("Script généré");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setGenerating(false);
    }
  };

  const sendRefine = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || refining || !script) return;

    setRefining(true);
    setMessage("");
    const userTurn: ParrainageCoachChatTurn = { role: "user", content: trimmed };
    const historyWithUser = [...history, userTurn];
    setHistory(historyWithUser);

    try {
      const updated = await refineParrainageScript({
        current: script,
        message: trimmed,
        history,
      });
      setScript(updated);
      setHistory([
        ...historyWithUser,
        { role: "assistant", content: "Script mis à jour." },
      ]);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    } catch (error) {
      setHistory(history);
      setMessage(trimmed);
      toast.error(String(error));
    } finally {
      setRefining(false);
    }
  };

  const saveToTimeline = async () => {
    if (!script) return;
    try {
      await createParrainagePipeTimelineNote(pipe.id, formatParrainageScriptAsNote(script));
      toast.success("Script enregistré dans le fil");
      onNoteSaved?.();
    } catch (error) {
      toast.error(String(error));
    }
  };

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          Coach Marketing Relationnel
        </CardTitle>
        <CardDescription className="text-xs">
          Script pour l&apos;étape « {PARRAINAGE_PIPE_STAGE_LABELS[stage]} » — généré via Mistral
          (prénom et notes envoyés pour personnaliser).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!privacyAck && (
          <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border/70 bg-muted/10 px-3 py-2">
            Le prénom et vos notes sont transmis à Mistral pour personnaliser le script. La clé API
            est celle configurée dans Paramètres → Newsletter.
          </p>
        )}

        {isInscrit ? (
          <p className="text-sm text-muted-foreground">
            Contact déjà inscrit — pas de script de prospection à générer.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5 min-w-[10rem] flex-1">
                <Label className="text-xs">Canal</Label>
                <Select value={canal} onValueChange={(v) => setCanal(v as ParrainageScriptCanal)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PARRAINAGE_SCRIPT_CANAL_LABELS) as ParrainageScriptCanal[]).map(
                      (key) => (
                        <SelectItem key={key} value={key}>
                          {PARRAINAGE_SCRIPT_CANAL_LABELS[key]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={generating}
                onClick={() => void handleGenerate()}
              >
                {generating ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="size-4 mr-1.5" />
                )}
                Générer un script
              </Button>
            </div>

            {script && (
              <div className="space-y-3 border-t border-border/50 pt-3">
                <ScriptBlock label="Accroche" text={script.accroche} />
                <ScriptBlock label="Corps" text={script.corps} />
                <ScriptBlock label="Question de closing" text={script.questionClosing} />
                {script.varianteSms ? (
                  <ScriptBlock label="Variante SMS" text={script.varianteSms} />
                ) : null}
                {script.siObjection ? (
                  <ScriptBlock label="Si objection" text={script.siObjection} />
                ) : null}
                <Button type="button" variant="secondary" size="sm" onClick={() => void saveToTimeline()}>
                  Enregistrer dans le fil
                </Button>
              </div>
            )}

            {script && (
              <div className="border-t border-border/50 pt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <MessageSquare className="size-3.5" />
                  Affiner le script
                </div>
                <div className="flex flex-wrap gap-1">
                  {PARRAINAGE_COACH_QUICK_PROMPTS.map((prompt) => (
                    <Button
                      key={prompt}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={refining}
                      onClick={() => void sendRefine(prompt)}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
                <div
                  ref={scrollRef}
                  className={cn(
                    "max-h-28 overflow-y-auto rounded-md border border-border/40 bg-muted/10 p-2 space-y-1",
                    history.length === 0 && "hidden"
                  )}
                >
                  {history.map((turn, i) => (
                    <p
                      key={`${turn.role}-${i}`}
                      className={cn(
                        "text-[11px] whitespace-pre-wrap",
                        turn.role === "user" ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {turn.role === "user" ? "Vous : " : "Coach : "}
                      {turn.content}
                    </p>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ex. raccourcis et enlève le jargon…"
                    rows={2}
                    className="text-sm min-h-0"
                    disabled={refining}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendRefine(message);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="shrink-0"
                    disabled={refining || !message.trim()}
                    onClick={() => void sendRefine(message)}
                  >
                    {refining ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
