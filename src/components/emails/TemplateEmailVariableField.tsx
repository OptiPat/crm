import { Label } from "@/components/ui/label";
import {
  TemplateEmailVariablePicker,
  type TemplateEmailVariablePickerProps,
} from "@/components/emails/TemplateEmailVariablePicker";

export function TemplateEmailVariableField(props: TemplateEmailVariablePickerProps) {
  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/20 px-2.5 py-2">
      <Label className="text-xs font-medium">Variables à insérer</Label>
      <TemplateEmailVariablePicker {...props} />
    </div>
  );
}
