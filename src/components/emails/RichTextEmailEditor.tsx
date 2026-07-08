import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Bold,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListX,
  Eraser,
  Underline,
} from "lucide-react";
import {
  applyRichEditorFontSize,
  execRichEditorCommand,
  exitRichEditorList,
  finalizeEditorHtmlForStorage,
  handleRichEditorListEnter,
  insertHtmlInRichEditor,
  normalizeEditorHtml,
  restoreRichEditorSelection,
  sanitizeEditorHtml,
  saveRichEditorSelection,
  type RichEditorSanitizeMode,
} from "@/components/emails/rich-text-email-editor-utils";
import { buildNoteImageHtml, pickNoteImageDataUrl } from "@/lib/notes/note-image-import";
import {
  NOTE_HIGHLIGHT_CLEAR,
  NOTE_HIGHLIGHT_COLORS,
  NOTE_TEXT_COLOR_DEFAULT,
  NOTE_TEXT_COLORS,
} from "@/lib/notes/note-editor-colors";
import { toast } from "sonner";

const FONT_SIZE_OPTIONS = [
  { value: 18, label: "18" },
  { value: 22, label: "22" },
  { value: 26, label: "26" },
  { value: 32, label: "32" },
] as const;

export type RichTextEmailEditorVariant = "default" | "sectionTitle" | "note";

type RichTextEmailEditorProps = {
  value: string;
  onChange: (html: string, meta?: { edited?: boolean }) => void;
  className?: string;
  minHeight?: string;
  placeholder?: string;
  onSelectionSave?: (range: Range | null) => void;
  /** Pied de page sous l'éditeur (défaut : aide variables). */
  showFooter?: boolean;
  ariaLabel?: string;
  /** Aperçu du style titre de section dans le composeur. */
  variant?: RichTextEmailEditorVariant;
  /** Accès au nœud contentEditable (flush DOM à l'envoi). */
  editorElementRef?: RefObject<HTMLDivElement | null>;
  /** Force la resynchronisation DOM ← value (ex. annuler les modifications). */
  resetToken?: number;
};

/** Empêche la barre d'outils de voler le focus / la sélection de l'éditeur. */
function preventToolbarFocusSteal(event: React.MouseEvent) {
  event.preventDefault();
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
      showFooter = true,
      ariaLabel = "Message du modèle",
      variant = "default",
      editorElementRef,
      resetToken,
    },
    forwardedRef
  ) {
  const editorRef = useRef<HTMLDivElement>(null);
  const assignEditorRef = useCallback(
    (node: HTMLDivElement | null) => {
      editorRef.current = node;
      if (editorElementRef) {
        (editorElementRef as { current: HTMLDivElement | null }).current = node;
      }
    },
    [editorElementRef]
  );
  useImperativeHandle(forwardedRef, () => editorRef.current as HTMLDivElement);
  const lastEmitted = useRef(value);
  const savedSelectionRef = useRef<Range | null>(null);

  const captureSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const range = saveRichEditorSelection(el);
    if (!range) return;

    const focusInEditor = el.contains(document.activeElement);
    const selectionInEditor = el.contains(range.commonAncestorContainer);

    if (!range.collapsed) {
      savedSelectionRef.current = range;
      onSelectionSave?.(range);
      return;
    }

    if (focusInEditor || selectionInEditor) {
      savedSelectionRef.current = range;
      onSelectionSave?.(range);
    }
  }, [onSelectionSave]);

  useEffect(() => {
    const onSelectionChange = () => {
      captureSelection();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [captureSelection]);

  const syncFromValue = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
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

  useEffect(() => {
    if (resetToken == null || resetToken < 1) return;
    const el = editorRef.current;
    if (!el) return;
    const next = value || "";
    el.innerHTML = next;
    lastEmitted.current = next;
  }, [resetToken, value]);

  const isSectionTitle = variant === "sectionTitle";
  const isNote = variant === "note";
  const sanitizeMode: RichEditorSanitizeMode = isNote ? "note" : "email";

  const emitChange = (finalize = false, edited = false) => {
    const el = editorRef.current;
    if (!el) return;
    const visibleText = (el.textContent ?? "").replace(/\u00a0/g, " ").trim();
    const raw = normalizeEditorHtml(el.innerHTML);
    let html = finalize
      ? finalizeEditorHtmlForStorage(el.innerHTML)
      : sanitizeEditorHtml(raw, sanitizeMode);

    if (finalize && !html.trim() && visibleText) {
      html = sanitizeEditorHtml(el.innerHTML, sanitizeMode);
    }

    if (finalize && html !== el.innerHTML && html.trim()) {
      el.innerHTML = html;
    }
    if (html === lastEmitted.current) return;
    lastEmitted.current = html;
    onChange(html, edited ? { edited: true } : undefined);
  };

  const runWithSavedSelection = (action: () => void) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    restoreRichEditorSelection(el, savedSelectionRef.current);
    action();
  };

  const exec = (command: string, valueArg?: string) => {
    runWithSavedSelection(() => {
      execRichEditorCommand(editorRef.current, command, savedSelectionRef.current, valueArg);
      captureSelection();
      emitChange(false, true);
    });
  };

  const insertLink = () => {
    const url = window.prompt("URL du lien (https://…)", "https://");
    if (!url?.trim()) return;
    exec("createLink", url.trim());
  };

  const applyFontSize = (sizePx: number) => {
    const el = editorRef.current;
    if (!el) return;
    runWithSavedSelection(() => {
      const applied = applyRichEditorFontSize(el, sizePx, savedSelectionRef.current);
      if (applied) {
        captureSelection();
        emitChange(false, true);
      } else {
        window.alert("Sélectionnez du texte avant de choisir une taille.");
      }
    });
  };

  const applyColor = (command: "foreColor" | "hiliteColor", color: string) => {
    if (!color) return;
    exec(command, color);
  };

  const insertImage = async () => {
    captureSelection();
    const savedRange = savedSelectionRef.current?.cloneRange() ?? null;
    try {
      const result = await pickNoteImageDataUrl();
      if (!result) return;
      if (result.tooLarge) {
        toast.error("Image trop volumineuse (max. 800 Ko).");
        return;
      }
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      restoreRichEditorSelection(el, savedRange);
      insertHtmlInRichEditor(el, buildNoteImageHtml(result.dataUrl), savedRange, "note");
      captureSelection();
      emitChange(false, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import image impossible.");
    }
  };

  return (
    <div className={cn("rounded-lg border bg-background", className)}>
      <div
        className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5 bg-muted/30"
        onMouseDown={preventToolbarFocusSteal}
      >
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
        <span className="mx-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          px
        </span>
        {FONT_SIZE_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 min-w-8 px-1.5 text-xs font-normal tabular-nums"
            title={`Taille ${opt.value} px sur la sélection`}
            onClick={() => applyFontSize(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
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
          title="Quitter la liste"
          onClick={() => {
            exitRichEditorList(editorRef.current, savedSelectionRef.current);
            captureSelection();
            emitChange(false, true);
          }}
        >
          <ListX className="h-4 w-4" />
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
        {isNote && (
          <>
            <span className="mx-0.5 h-5 w-px bg-border" />
            <span
              className="px-0.5 text-[10px] font-semibold text-muted-foreground"
              title="Couleur du texte (sélectionnez du texte d'abord)"
            >
              A
            </span>
            {NOTE_TEXT_COLORS.map((color) => (
              <button
                key={`text-${color.value}`}
                type="button"
                title={color.label}
                aria-label={`Texte ${color.label}`}
                className="h-5 w-5 shrink-0 rounded border border-border/80 hover:ring-2 hover:ring-primary/40"
                style={{ backgroundColor: color.value }}
                onMouseDown={preventToolbarFocusSteal}
                onClick={() => applyColor("foreColor", color.value)}
              />
            ))}
            <button
              type="button"
              title="Couleur par défaut"
              aria-label="Retirer la couleur du texte"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-dashed border-border bg-background text-muted-foreground hover:ring-2 hover:ring-primary/40"
              onMouseDown={preventToolbarFocusSteal}
              onClick={() => applyColor("foreColor", NOTE_TEXT_COLOR_DEFAULT)}
            >
              <Eraser className="h-3 w-3" />
            </button>
            <span
              className="px-0.5 text-[10px] font-semibold text-muted-foreground"
              title="Surlignage (sélectionnez du texte d'abord)"
            >
              ▮
            </span>
            {NOTE_HIGHLIGHT_COLORS.map((color) => (
              <button
                key={`hl-${color.value}`}
                type="button"
                title={color.label}
                aria-label={`Surlignage ${color.label}`}
                className="h-5 w-5 shrink-0 rounded border border-border/80 hover:ring-2 hover:ring-primary/40"
                style={{ backgroundColor: color.value }}
                onMouseDown={preventToolbarFocusSteal}
                onClick={() => applyColor("hiliteColor", color.value)}
              />
            ))}
            <button
              type="button"
              title="Retirer le surlignage"
              aria-label="Retirer le surlignage"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-dashed border-border bg-background text-muted-foreground hover:ring-2 hover:ring-primary/40"
              onMouseDown={preventToolbarFocusSteal}
              onClick={() => applyColor("hiliteColor", NOTE_HIGHLIGHT_CLEAR)}
            >
              <Eraser className="h-3 w-3" />
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Insérer une image depuis le bureau"
              onClick={() => void insertImage()}
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      <div
        ref={assignEditorRef}
        contentEditable
        role="textbox"
        aria-multiline
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        className={cn(
          "px-3 py-2 outline-none overflow-y-auto",
          "min-h-[var(--editor-min-h)]",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground",
          "[&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline",
          "[&_a]:text-primary [&_a]:underline",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          isNote && "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md [&_img]:my-2",
          isSectionTitle
            ? [
                "text-[11px] font-semibold uppercase tracking-[0.12em] text-primary leading-snug",
                "[&_div]:inline [&_p]:inline [&_>div]:inline",
              ]
            : ["text-sm", "[&_div]:leading-normal [&_>div]:m-0 [&_p]:my-0 [&_p]:leading-normal"],
        )}
        style={{ "--editor-min-h": minHeight } as React.CSSProperties}
        onInput={() => emitChange(false, true)}
        onKeyUp={captureSelection}
        onMouseUp={captureSelection}
        onKeyDownCapture={(e) => {
          const el = editorRef.current;
          if (!el) return;
          if (handleRichEditorListEnter(el, e.nativeEvent)) {
            captureSelection();
            emitChange(false, true);
          }
        }}
        onBlur={() => {
          captureSelection();
          emitChange(false, false);
        }}
      />
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
