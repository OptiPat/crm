import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  appendDictationText,
  DICTATION_FALLBACK_HINT,
  extractFinalTranscript,
  getSpeechRecognitionCtor,
  isSpeechDictationSupported,
  type BrowserSpeechRecognition,
} from "@/lib/speech/speech-dictation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DictationTextareaProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
}

export function DictationTextarea({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled = false,
  className,
}: DictationTextareaProps) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(value);
  const supported = isSpeechDictationSupported();

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const focusField = () => {
    textareaRef.current?.focus();
  };

  const showFallbackHelp = () => {
    focusField();
    toast.info(DICTATION_FALLBACK_HINT, { duration: 6000 });
  };

  const toggleDictation = () => {
    if (disabled) return;
    if (!supported) {
      showFallbackHelp();
      return;
    }
    if (listening) {
      stopListening();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      showFallbackHelp();
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const phrase = extractFinalTranscript(event);
      if (!phrase) return;
      const next = appendDictationText(valueRef.current, phrase);
      valueRef.current = next;
      onChange(next);
    };

    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        toast.error("Dictée interrompue. Vérifiez l'accès au micro.");
      }
      stopListening();
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    try {
      focusField();
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      showFallbackHelp();
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        {label ? <Label htmlFor={id}>{label}</Label> : <span />}
        <Button
          type="button"
          variant={listening ? "destructive" : "outline"}
          size="sm"
          className="h-8 gap-1.5 shrink-0"
          disabled={disabled}
          onClick={toggleDictation}
          aria-pressed={listening}
          aria-label={listening ? "Arrêter la dictée" : "Dicter"}
          title={supported ? "Dictée vocale" : "Dictée Windows (Win + H)"}
        >
          {listening ? (
            <>
              <Square className="h-3.5 w-3.5 fill-current" />
              Arrêter
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5" />
              {supported ? "Dicter" : "Win + H"}
            </>
          )}
        </Button>
      </div>

      <Textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={listening ? "ring-1 ring-destructive/40" : undefined}
      />

      {!supported && (
        <p className="text-xs text-muted-foreground">{DICTATION_FALLBACK_HINT}</p>
      )}
    </div>
  );
}
