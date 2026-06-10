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
import {
  finalizeEditorHtmlForStorage,
  normalizeEditorHtml,
  sanitizeEditorHtml,
  saveRichEditorSelection,
} from "@/components/emails/rich-text-email-editor-utils";
type RichTextEmailEditorProps = {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  minHeight?: string;
  placeholder?: string;
  onSelectionSave?: (range: Range | null) => void;
  /** Pied de page sous l'éditeur (défaut : aide variables). */
  showFooter?: boolean;
  ariaLabel?: string;
};

export const RichTextEmailEditor = forwardRef<HTMLDivElement, RichTextEmailEditorProps>(
  function RichTextEmailEditor(
    {
      value,
      onChange,
      className,
      minHeight = "220px",
      placeholder = "Rédigez votre message…",
      onSelectionSave,
      showFooter = true,
      ariaLabel = "Message du modèle",
    },
    forwardedRef
  ) {
  const editorRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => editorRef.current as HTMLDivElement);
  const lastEmitted = useRef(value);

  const syncFromValue = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    // Ne pas écraser le DOM pendant la saisie (sinon plus de curseur / aperçu live).
    if (el.contains(document.activeElement)) return;
    const next = value || "";
    if (el.innerHTML !== next) {
      el.innerHTML = next;
    }
    lastEmitted.current = next;
  }, [value]);

  useEffect(() => {
    syncFromValue();
  }, [syncFromValue]);

  const emitChange = (finalize = false) => {
    const el = editorRef.current;
    if (!el) return;
    const raw = normalizeEditorHtml(el.innerHTML);
    const html = finalize ? finalizeEditorHtmlForStorage(raw) : sanitizeEditorHtml(raw);
    if (finalize && html !== el.innerHTML) {
      el.innerHTML = html;
    }
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
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        className={cn(
          "px-3 py-2 text-sm outline-none overflow-y-auto",
          "min-h-[var(--editor-min-h)]",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground",
          "[&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline",
          "[&_a]:text-primary [&_a]:underline",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_div]:leading-normal [&_>div]:m-0 [&_p]:my-0 [&_p]:leading-normal"
        )}
        style={{ "--editor-min-h": minHeight } as React.CSSProperties}
        onInput={() => emitChange(false)}
        onBlur={() => {
          onSelectionSave?.(saveRichEditorSelection(editorRef.current));
          emitChange(true);
        }}      />
      {showFooter ?
        <p className="px-3 pb-2 text-[11px] text-muted-foreground border-t bg-muted/10">
          Mise en forme conservée à l&apos;envoi Gmail (gras, listes, liens). Variables{" "}
          {"{{prenom}}"} etc. : insérez-les via les badges ci-dessus.
        </p>
      : null}
    </div>
  );
  }
);
