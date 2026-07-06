import { useState } from "react";
import { ExternalLink, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  ComptaDrivePickerDialog,
  type ComptaDrivePickerContext,
} from "@/components/compta/ComptaDrivePickerDialog";
import { openComptaDriveLink } from "@/lib/compta/compta-drive";

interface ComptaDriveLinkFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  pickerContext?: ComptaDrivePickerContext;
}

export function ComptaDriveLinkField({
  id,
  label,
  value,
  onChange,
  placeholder = "Cliquez sur 📁 pour choisir…",
  pickerContext,
}: ComptaDriveLinkFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex gap-2">
          <Input
            id={id}
            type="url"
            value={value}
            readOnly={Boolean(pickerContext)}
            placeholder={placeholder}
            onChange={pickerContext ? undefined : (e) => onChange(e.target.value)}
          />
          {pickerContext ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Parcourir Google Drive"
              onClick={() => setPickerOpen(true)}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          ) : null}
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

      {pickerContext ? (
        <ComptaDrivePickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          context={pickerContext}
          onSelect={(url) => onChange(url)}
        />
      ) : null}
    </>
  );
}
