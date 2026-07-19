import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const pendingBufferedCommits = new Set<() => void>();

function registerBufferedCommit(commit: () => void): () => void {
  pendingBufferedCommits.add(commit);
  return () => pendingBufferedCommits.delete(commit);
}

export function flushAllChecklistSettingsBufferedCommits(): void {
  for (const commit of pendingBufferedCommits) {
    commit();
  }
}

type BufferedInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "defaultValue" | "onChange"
> & {
  value: string;
  syncKey: number;
  onCommit: (value: string) => void;
};

function useBufferedCommit(value: string, local: string, onCommit: (value: string) => void) {
  const valueRef = useRef(value);
  const localRef = useRef(local);
  valueRef.current = value;
  localRef.current = local;

  const tryCommit = useCallback(() => {
    const next = localRef.current;
    const current = valueRef.current;
    if (next !== current) onCommit(next);
  }, [onCommit]);

  useEffect(() => registerBufferedCommit(tryCommit), [tryCommit]);

  return tryCommit;
}

/** Champ texte local : pas de remontée au parent à chaque frappe (évite le lag sur longues listes). */
export function ChecklistSettingsBufferedInput({
  value,
  syncKey,
  onCommit,
  onBlur,
  ...props
}: BufferedInputProps) {
  const [local, setLocal] = useState(value);
  const tryCommit = useBufferedCommit(value, local, onCommit);

  useEffect(() => {
    setLocal(value);
  }, [syncKey, value]);

  return (
    <Input
      {...props}
      value={local}
      onChange={(event) => setLocal(event.target.value)}
      onBlur={(event) => {
        tryCommit();
        onBlur?.(event);
      }}
    />
  );
}

type BufferedTextareaProps = Omit<
  React.ComponentProps<typeof Textarea>,
  "value" | "defaultValue" | "onChange"
> & {
  value: string;
  syncKey: number;
  onCommit: (value: string) => void;
};

export function ChecklistSettingsBufferedTextarea({
  value,
  syncKey,
  onCommit,
  onBlur,
  ...props
}: BufferedTextareaProps) {
  const [local, setLocal] = useState(value);
  const tryCommit = useBufferedCommit(value, local, onCommit);

  useEffect(() => {
    setLocal(value);
  }, [syncKey, value]);

  return (
    <Textarea
      {...props}
      value={local}
      onChange={(event) => setLocal(event.target.value)}
      onBlur={(event) => {
        tryCommit();
        onBlur?.(event);
      }}
    />
  );
}

export function flushChecklistSettingsFocusedField(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

export function flushChecklistSettingsBufferedState(): void {
  flushChecklistSettingsFocusedField();
  flushAllChecklistSettingsBufferedCommits();
}
