import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  EMAIL_ENVOI_JOUR_OPTIONS,
  toggleEmailEnvoiJour,
  type EmailEnvoiJourCode,
} from "@/lib/emails/email-envoi-schedule";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  /** `null` = jour calendaire J+N ; sinon jours choisis (prochain parmi eux). */
  value: EmailEnvoiJourCode[] | null;
  onChange: (v: EmailEnvoiJourCode[] | null) => void;
  className?: string;
};

export function EmailEnvoiWeekdayPicker({ id, value, onChange, className }: Props) {
  const useCalendar = value == null;

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs text-muted-foreground">Jour d&apos;envoi après le délai</Label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            id={id ? `${id}-cal` : "email-jour-calendaire"}
            checked={useCalendar}
            onCheckedChange={(checked) => {
              if (checked === true) onChange(null);
            }}
          />
          <span>Jour calendaire (date J+N)</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground w-full sm:w-auto">
          Ou prochain parmi :
        </span>
        {EMAIL_ENVOI_JOUR_OPTIONS.map(({ code, label }) => {
          const checked = !useCalendar && (value?.includes(code) ?? false);
          return (
            <label
              key={code}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm cursor-pointer transition-colors",
                checked
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background hover:bg-muted/50"
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => {
                  const next = toggleEmailEnvoiJour(value, code);
                  onChange(next);
                }}
                className="sr-only"
                aria-label={label}
              />
              {label}
            </label>
          );
        })}
      </div>
      {!useCalendar && value && value.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Ex. délai 45 tombant un vendredi → prochain jour coché (lundi, mercredi…).
        </p>
      )}
    </div>
  );
}
