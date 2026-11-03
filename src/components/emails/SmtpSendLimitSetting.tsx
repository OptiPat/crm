import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getSmtpSendQuota,
  setSmtpHourlyLimit,
  type SmtpSendQuota,
} from "@/lib/api/tauri-email-oauth";
import { userErrorMessage } from "@/lib/api/invoke-error";
import { toast } from "sonner";

/** Limite horaire des envois (boîte « autre messagerie ») : les envois groupés s'étalent dessous. */
export function SmtpSendLimitSetting() {
  const [quota, setQuota] = useState<SmtpSendQuota | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSmtpSendQuota()
      .then((q) => {
        setQuota(q);
        setValue(String(q.hourly_limit));
      })
      .catch(() => setQuota(null));
    // Compteur de la dernière heure tenu à jour pendant un envoi en cours.
    const timer = window.setInterval(() => {
      getSmtpSendQuota()
        .then((q) => setQuota((prev) => (prev ? { ...prev, sent_last_hour: q.sent_last_hour } : q)))
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!quota) return null;

  const parsed = Math.trunc(Number(value));
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 10_000;

  const handleSave = async () => {
    setSaving(true);
    try {
      const q = await setSmtpHourlyLimit(parsed);
      setQuota(q);
      setValue(String(q.hourly_limit));
      toast.success(`Limite d'envoi : ${q.hourly_limit} emails par heure`);
    } catch (e) {
      toast.error(userErrorMessage(e, "Enregistrement de la limite impossible"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">Limite d&apos;envoi de l&apos;hébergeur</p>
        <p className="text-xs text-muted-foreground mt-1">
          Les envois groupés (newsletter, Suivi → Envois) se mettent en pause un peu avant cette
          limite (10 % restent pour les emails isolés : rappels RDV, réponses) et reprennent
          seuls, CRM ouvert et déverrouillé. Au-delà, un email isolé est refusé jusqu&apos;à
          l&apos;heure de reprise. OVH : environ 200 par heure, gardez une marge.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="smtp-hourly-limit" className="text-xs">
            Emails par heure
          </Label>
          <Input
            id="smtp-hourly-limit"
            type="number"
            min={1}
            max={10000}
            className="w-28"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={saving || !valid || parsed === quota.hourly_limit}
          onClick={() => void handleSave()}
        >
          Enregistrer
        </Button>
        <span className="text-xs text-muted-foreground pb-2">
          {quota.sent_last_hour} envoyé{quota.sent_last_hour > 1 ? "s" : ""} dans la dernière heure
        </span>
      </div>
    </div>
  );
}
