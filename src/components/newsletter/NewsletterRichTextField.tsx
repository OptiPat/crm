import { Label } from "@/components/ui/label";
import { RichTextEmailEditor } from "@/components/emails/RichTextEmailEditor";

type NewsletterRichTextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (html: string) => void;
  minHeight?: string;
  placeholder?: string;
};

export function NewsletterRichTextField({
  id,
  label,
  value,
  onChange,
  minHeight = "140px",
  placeholder,
}: NewsletterRichTextFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <RichTextEmailEditor
        value={value}
        onChange={onChange}
        minHeight={minHeight}
        placeholder={placeholder}
        showFooter={false}
        ariaLabel={label}
      />
    </div>
  );
}
