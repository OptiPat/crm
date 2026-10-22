import { useEffect, useState } from "react";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/api/invoke-error";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getContactNewsletterUnsubscribedAt,
  setContactNewsletterUnsubscribed,
} from "@/lib/api/tauri-newsletter";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";

/** Case « Désinscrit de la newsletter » : enregistrée dès le clic. */
export function ContactNewsletterUnsubscribeCheckbox({ contactId }: { contactId: number }) {
  // undefined = chargement, "error" = statut inconnu (case bloquée plutôt que fausse).
  const [unsubscribedAt, setUnsubscribedAt] = useState<number | null | undefined | "error">(
    undefined
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Autre contact : pas le statut du précédent pendant le chargement.
    setUnsubscribedAt(undefined);
    void getContactNewsletterUnsubscribedAt(contactId)
      .then((at) => {
        if (!cancelled) setUnsubscribedAt(at);
      })
      .catch(() => {
        if (!cancelled) setUnsubscribedAt("error");
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      await setContactNewsletterUnsubscribed(contactId, next);
      setUnsubscribedAt(next ? Math.floor(Date.now() / 1000) : null);
      notifyContactsChanged();
      toast.success(next ? "Désinscrit de la newsletter" : "Réinscrit à la newsletter (inclus à la prochaine préparation)");
    } catch (e) {
      toast.error(userErrorMessage(e, "Mise à jour impossible"));
    } finally {
      setSaving(false);
    }
  };

  if (unsubscribedAt === "error") {
    return (
      <p className="text-xs text-muted-foreground">
        Statut newsletter indisponible — rouvrez la fiche.
      </p>
    );
  }

  const checked = unsubscribedAt != null;
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
      <Checkbox
        checked={checked}
        disabled={saving || unsubscribedAt === undefined}
        onCheckedChange={(v) => void toggle(v === true)}
      />
      Désinscrit de la newsletter
      {typeof unsubscribedAt === "number" ?
        <span className="text-xs">
          (depuis le {new Date(unsubscribedAt * 1000).toLocaleDateString("fr-FR")})
        </span>
      : null}
    </label>
  );
}
