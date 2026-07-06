import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { openComptaDriveLink } from "@/lib/compta/compta-drive";

interface ComptaDriveLinkFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ComptaDriveLinkField({
  id,
  label,
  value,
  onChange,
  placeholder = "https://drive.google.com/file/d/…/view",
}: ComptaDriveLinkFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={!value.trim()}
          title="Ouvrir sur Drive"
          onClick={() => void openComptaDriveLink(value)}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
