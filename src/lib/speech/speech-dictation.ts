export interface BrowserSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechDictationSupported(): boolean {
  return getSpeechRecognitionCtor() != null;
}

/** Message quand Web Speech API absente (app desktop Tauri / WebView2). */
export const DICTATION_FALLBACK_HINT =
  "Dictée Windows : cliquez dans le champ, puis Win + H (ou la touche micro du clavier).";

export function appendDictationText(current: string, phrase: string): string {
  const chunk = phrase.trim();
  if (!chunk) return current;
  if (!current.trim()) return chunk;
  if (current.endsWith("\n")) return `${current}${chunk}`;
  const separator = current.endsWith(" ") ? "" : " ";
  return `${current.trimEnd()}${separator}${chunk}`;
}

export function extractFinalTranscript(event: SpeechRecognitionEventLike): string {
  let transcript = "";
  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    if (result?.isFinal) {
      transcript += result[0]?.transcript ?? "";
    }
  }
  return transcript.trim();
}
