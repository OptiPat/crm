import { sanitizeTemplateEmailHtml } from "@/lib/emails/template-email-html";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Underline,
} from "lucide-react";

type RichTextEmailEditorProps = {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  minHeight?: string;
  placeholder?: string;
  onSelectionSave?: (range: Range | null) => void;
};

function normalizeEditorHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed || trimmed === "<br>" || trimmed === "<div><br></div>") {
    return "";
  }
  return html;
}

export const RichTextEmailEditor = forwardRef<HTMLDivElement, RichTextEmailEditorProps>(
  function RichTextEmailEditor(
    {
      value,
      onChange,
      className,
      minHeight = "220px",
      placeholder = "Rédigez votre message…",
      onSelectionSave,
    },
    forwardedRef
  ) {
  const editorRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => editorRef.current as HTMLDivElement);
  const lastEmitted = useRef(value);

  const syncFromValue = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = value || "";
    if (el.innerHTML !== next) {
      el.innerHTML = next;
    }
    lastEmitted.current = next;
  }, [value]);

  useEffect(() => {
    syncFromValue();
  }, [syncFromValue]);

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    const html = sanitizeTemplateEmailHtml(normalizeEditorHtml(el.innerHTML));
    if (html === lastEmitted.current) return;
    lastEmitted.current = html;
    onChange(html);
  };

  const exec = (command: string, valueArg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, valueArg);
    emitChange();
  };

  const insertLink = () => {
    const url = window.prompt("URL du lien (https://…)", "https://");
    if (!url?.trim()) return;
    exec("createLink", url.trim());
  };

  return (
    <div className={cn("rounded-lg border bg-background", className)}>
      <div className="flex flex-wrap gap-0.5 border-b px-2 py-1.5 bg-muted/30">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Gras"
          onClick={() => exec("bold")}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Italique"
          onClick={() => exec("italic")}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Souligné"
          onClick={() => exec("underline")}
        >
          <Underline className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Liste à puces"
          onClick={() => exec("insertUnorderedList")}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Liste numérotée"
          onClick={() => exec("insertOrderedList")}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Lien"
          onClick={insertLink}
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline
        aria-label="Message du modèle"
        data-placeholder={placeholder}
        className={cn(
          "px-3 py-2 text-sm outline-none overflow-y-auto",
          "min-h-[var(--editor-min-h)]",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground",
          "[&_a]:text-primary [&_a]:underline",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_p]:my-1"
        )}
        style={{ "--editor-min-h": minHeight } as React.CSSProperties}
        onInput={emitChange}
        onBlur={() => {
          onSelectionSave?.(saveRichEditorSelection(editorRef.current));
          emitChange();
        }}
      />
      <p className="px-3 pb-2 text-[11px] text-muted-foreground border-t bg-muted/10">
        Mise en forme conservée à l&apos;envoi Gmail (gras, listes, liens). Variables{" "}
        {"{{prenom}}"} etc. : insérez-les via les badges ci-dessus.
      </p>
    </div>
  );
  }
);

/** Sauvegarde la sélection courante dans l'éditeur riche. */
export function saveRichEditorSelection(editorEl: HTMLDivElement | null): Range | null {
  if (!editorEl) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!editorEl.contains(range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

/** Insère du texte à la position du curseur dans l'éditeur. */
export function insertTextInRichEditor(
  editorEl: HTMLDivElement | null,
  text: string,
  savedRange?: Range | null
): string {
  if (!editorEl) return "";
  editorEl.focus();
  const sel = window.getSelection();
  let range = saveRichEditorSelection(editorEl) ?? savedRange ?? null;
  if (range && !editorEl.contains(range.commonAncestorContainer)) {
    range = savedRange && editorEl.contains(savedRange.commonAncestorContainer)
      ? savedRange
      : null;
  }
  if (range) {
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
  document.execCommand("insertText", false, text);
  return sanitizeTemplateEmailHtml(normalizeEditorHtml(editorEl.innerHTML));
}
