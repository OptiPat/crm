import { useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { updateContact, type Contact } from "@/lib/api/tauri-contacts";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import {
  contactRegistreBadgeClass,
  contactRegistreFromContact,
  contactRegistreLabel,
  normalizeContactRegistre,
  type ContactRegistre,
} from "@/lib/emails/template-email-formality";

/** Pastille tu/vous (file Envois, dialogue d'envoi). */
export function ContactRegistreBadge({
  registre,
  className,
}: {
  registre?: string | null;
  className?: string;
}) {
  const value = normalizeContactRegistre(registre);
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border",
        contactRegistreBadgeClass(value),
        className
      )}
      title={contactRegistreLabel(value)}
    >
      {value === "TU" ? "Tu" : "Vous"}
    </span>
  );
}

type Props = {
  contact: Contact;
  onUpdated?: (contact: Contact) => void;
  disabled?: boolean;
  className?: string;
};

export function ContactRegistreToggle({
  value,
  onChange,
  disabled = false,
  loading = false,
  className,
}: {
  value: ContactRegistre;
  onChange: (value: ContactRegistre) => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const btn = (option: ContactRegistre, label: string) => {
    const active = value === option;
    return (
      <button
        type="button"
        disabled={disabled}
        aria-pressed={active}
        className={cn(
          "px-2.5 py-1 text-xs font-semibold rounded-sm border transition-colors",
          active && option === "VOUS" && "bg-sky-100 text-sky-950 border-sky-400 shadow-sm",
          active && option === "TU" && "bg-violet-100 text-violet-950 border-violet-400 shadow-sm",
          !active && "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
        onClick={() => onChange(option)}
      >
        {label}
      </button>
    );
  };

  const containerTint =
    value === "TU"
      ? "border-violet-300 bg-violet-50/60"
      : "border-sky-300 bg-sky-50/60";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border p-0.5",
        containerTint,
        disabled && "opacity-60 pointer-events-none",
        className
      )}
      title="Registre des emails (campagnes et relances)"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin mx-1.5 text-muted-foreground" />
      ) : (
        <MessageCircle
          className={cn(
            "h-3.5 w-3.5 shrink-0 ml-1",
            value === "TU" ? "text-violet-700" : "text-sky-700"
          )}
          aria-hidden
        />
      )}
      {btn("VOUS", "Vous")}
      {btn("TU", "Tu")}
    </div>
  );
}

export function ContactRegistreSwitch({
  contact,
  onUpdated,
  disabled = false,
  className,
}: Props) {
  const [saving, setSaving] = useState(false);
  const registre = contactRegistreFromContact(contact);
  const contactId = contact.id;

  const setRegistre = async (next: ContactRegistre) => {
    if (!contactId || next === registre || saving || disabled) return;
    setSaving(true);
    try {
      const updated = await updateContact(
        contactId,
        contactToUpdatePayload(contact, { registre: next })
      );
      onUpdated?.(updated);
      toast.success(next === "TU" ? "Tutoiement enregistré" : "Vouvoiement enregistré");
    } catch (error) {
      console.error("Erreur mise à jour registre:", error);
      toast.error("Impossible de mettre à jour le registre");
    } finally {
      setSaving(false);
    }
  };

  if (contactId == null) return null;

  return (
    <ContactRegistreToggle
      value={registre}
      onChange={(next) => void setRegistre(next)}
      disabled={disabled || saving}
      loading={saving}
      className={className}
    />
  );
}
