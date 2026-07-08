import { RichTextEmailEditor } from "@/components/emails/RichTextEmailEditor";

interface NoteRichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  minHeight?: string;
  placeholder?: string;
  ariaLabel?: string;
}

export function NoteRichTextEditor({
  value,
  onChange,
  minHeight = "240px",
  placeholder = "Rédigez votre note…",
  ariaLabel = "Contenu de la note",
}: NoteRichTextEditorProps) {
  return (
    <RichTextEmailEditor
      value={value}
      onChange={onChange}
      minHeight={minHeight}
      placeholder={placeholder}
      showFooter={false}
      ariaLabel={ariaLabel}
    />
  );
}
