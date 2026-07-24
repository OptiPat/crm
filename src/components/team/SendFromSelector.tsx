import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTeamWorkspace } from "@/components/team/TeamWorkspaceProvider";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  buildSendFromOptions,
  defaultSendFromEmail,
  shouldShowSendFromSelector,
} from "@/lib/team/send-from-options";

export function SendFromSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (email: string | null) => void;
  disabled?: boolean;
}) {
  const { config } = useTeamWorkspace();
  const [primaryEmail, setPrimaryEmail] = useState<string | null>(null);

  useEffect(() => {
    void getEmailConnectionStatus()
      .then((status) => setPrimaryEmail(status.email))
      .catch(() => setPrimaryEmail(null));
  }, []);

  const options = buildSendFromOptions(config, primaryEmail);
  const visible = shouldShowSendFromSelector(config, primaryEmail);

  useEffect(() => {
    if (!visible) {
      const fallback = defaultSendFromEmail(config, primaryEmail);
      if (value !== fallback) {
        onChange(fallback);
      }
      return;
    }
    const fallback = defaultSendFromEmail(config, primaryEmail);
    if (!value && fallback) {
      onChange(fallback);
    }
  }, [visible, value, config, primaryEmail, onChange]);

  if (!visible) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="send-from-email">Envoyer depuis</Label>
      <Select
        value={value ?? undefined}
        onValueChange={(next) => onChange(next)}
        disabled={disabled || options.length <= 1}
      >
        <SelectTrigger id="send-from-email">
          <SelectValue placeholder="Choisir l'expéditeur" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
