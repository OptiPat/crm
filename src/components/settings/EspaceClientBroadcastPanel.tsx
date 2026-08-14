import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsPanel } from "@/components/settings/parametres-ui";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import {
  broadcastEspaceAvisImposition,
  broadcastEspaceEcheance,
  previewEspaceBroadcast,
  type EspaceBroadcastPreview,
  type EspaceBroadcastResult,
} from "@/lib/api/tauri-espace-client";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { normalizeAgendaLinks, type AgendaLink } from "@/lib/emails/agenda-links";

function dateToUnix(valeur: string): number | null {
  if (!valeur) return null;
  const [annee, mois, jour] = valeur.split("-").map(Number);
  if (!annee || !mois || !jour) return null;
  return Math.floor(new Date(annee, mois - 1, jour, 12, 0, 0).getTime() / 1000);
}

function resumeEnvoi(result: EspaceBroadcastResult): string {
  const parts = [`${result.crees} créé(s)`];
  if (result.relances > 0) parts.push(`${result.relances} re-synchronisé(s)`);
  if (result.ignores > 0) parts.push(`${result.ignores} ignoré(s)`);
  if (result.echecs.length > 0) parts.push(`${result.echecs.length} échec(s)`);
  return parts.join(" · ");
}

const HORAIRES_EMAIL =
  "Chaque nouveauté déclenche un email chez le client — évitez les horaires nocturnes.";

/**
 * Actions qui valent pour tous les espaces actifs : une échéance collective,
 * et la campagne du dernier avis d'imposition.
 */
export function EspaceClientBroadcastPanel() {
  const [preview, setPreview] = useState<EspaceBroadcastPreview | null>(null);
  const [liens, setLiens] = useState<AgendaLink[]>([]);
  const [date, setDate] = useState("");
  const [titre, setTitre] = useState("");
  const [message, setMessage] = useState("");
  const [rdvLienId, setRdvLienId] = useState("");
  const [envoiEcheance, setEnvoiEcheance] = useState(false);
  const [envoiAvis, setEnvoiAvis] = useState(false);

  const charger = useCallback(async () => {
    try {
      const unix = dateToUnix(date);
      const [apercu, cgp] = await Promise.all([
        previewEspaceBroadcast(unix, titre.trim() || null),
        getCgpConfig(),
      ]);
      setPreview(apercu);
      setLiens(normalizeAgendaLinks(cgp));
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Impossible de compter les espaces actifs");
    }
  }, [date, titre]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const envoyerEcheance = async () => {
    const unix = dateToUnix(date);
    if (unix == null || !titre.trim()) {
      toast.error("Intitulé et date requis");
      return;
    }
    const n = preview?.echeanceACreer ?? preview?.actifs ?? 0;
    const ignores = preview?.echeanceIgnores ?? 0;
    const actifs = preview?.actifs ?? 0;
    if (actifs === 0) {
      toast.info("Aucun espace client actif");
      return;
    }
    const detailIgnores =
      ignores > 0
        ? ` ${ignores} ont déjà la même échéance ce jour-là (re-synchronisation).`
        : "";
    if (
      !window.confirm(
        n > 0
          ? `Créer cette échéance chez ${n} client(s) dont l'espace est actif ?${detailIgnores}`
          : `Aucun nouveau : re-synchroniser les ${ignores} échéance(s) déjà créées ?`
      )
    ) {
      return;
    }
    setEnvoiEcheance(true);
    try {
      const result = await broadcastEspaceEcheance(
        unix,
        titre.trim(),
        message.trim() || null,
        rdvLienId || null
      );
      await charger();
      if (result.echecs.length > 0) {
        toast.warning(resumeEnvoi(result));
      } else {
        toast.success(resumeEnvoi(result));
      }
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Envoi impossible");
    } finally {
      setEnvoiEcheance(false);
    }
  };

  const envoyerAvis = async () => {
    const n = preview?.avisADemander ?? 0;
    const enAttente = preview?.avisEnAttente ?? 0;
    const ignores = preview?.avisDejaTraites ?? 0;
    if (n === 0 && enAttente === 0) {
      toast.info(
        ignores > 0
          ? "Tous les espaces actifs ont déjà cette demande (reçue, importée ou validée)."
          : "Aucun espace client actif"
      );
      return;
    }
    const extra = [
      enAttente > 0 ? `${enAttente} en attente seront re-synchronisé(s)` : "",
      ignores > 0 ? `${ignores} déjà traité(s) (validée, reçue ou importée) seront ignorés` : "",
    ]
      .filter(Boolean)
      .join(". ");
    if (
      !window.confirm(
        n > 0
          ? `Demander le dernier avis d'imposition à ${n} client(s) ?${extra ? ` ${extra}.` : ""}`
          : `Re-synchroniser ${enAttente} demande(s) déjà en attente ? Une demande annulée peut être relancée.`
      )
    ) {
      return;
    }
    setEnvoiAvis(true);
    try {
      const result = await broadcastEspaceAvisImposition();
      await charger();
      if (result.echecs.length > 0) {
        toast.warning(resumeEnvoi(result));
      } else {
        toast.success(resumeEnvoi(result));
      }
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Envoi impossible");
    } finally {
      setEnvoiAvis(false);
    }
  };

  const actifs = preview?.actifs ?? 0;
  const echeanceACreer = preview?.echeanceACreer ?? actifs;
  const echeanceIgnores = preview?.echeanceIgnores ?? 0;
  const avisActionnables =
    (preview?.avisADemander ?? 0) + (preview?.avisEnAttente ?? 0);

  return (
    <>
      <SettingsPanel
        title="Échéance à tous les espaces"
        description="La même échéance est créée chez chaque client dont l'accès est actif, puis synchronisée."
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {preview == null
              ? "Comptage des espaces…"
              : `${actifs} espace(s) actif(s). Une date passée reste dans le CRM mais n'apparaît pas chez le client.`}
          </p>
          {date && titre.trim() && preview != null && echeanceIgnores > 0 ? (
            <p className="text-sm text-muted-foreground">
              {echeanceACreer} à créer · {echeanceIgnores} ont déjà le même intitulé ce
              jour-là (re-synchronisation).
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">{HORAIRES_EMAIL}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="broadcast-echeance-titre">Intitulé</Label>
              <Input
                id="broadcast-echeance-titre"
                value={titre}
                onChange={(event) => setTitre(event.target.value)}
                placeholder="Aide à la déclaration de revenus"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="broadcast-echeance-date">Date</Label>
              <Input
                id="broadcast-echeance-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="broadcast-echeance-message">
              Précision affichée au client
              <span className="ml-1 font-normal text-muted-foreground">(facultatif)</span>
            </Label>
            <Input
              id="broadcast-echeance-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Pensez à préparer vos justificatifs"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="broadcast-echeance-rdv">Bouton de rendez-vous</Label>
            <select
              id="broadcast-echeance-rdv"
              value={rdvLienId}
              onChange={(event) => setRdvLienId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Aucun</option>
              {liens.map((lien) => (
                <option key={lien.id} value={lien.id}>
                  {lien.label || lien.id}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            disabled={envoiEcheance || actifs === 0 || !date || !titre.trim()}
            onClick={() => void envoyerEcheance()}
          >
            {envoiEcheance ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarPlus className="mr-2 h-4 w-4" />
            )}
            {echeanceACreer === 0 && echeanceIgnores > 0
              ? `Re-synchroniser ${echeanceIgnores} échéance(s)`
              : `Envoyer à ${echeanceACreer} client(s)`}
          </Button>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Dernier avis d'imposition"
        description="Demande créée si elle n'est pas déjà en cours, reçue, importée ou validée. Une demande annulée peut être relancée."
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {preview == null
              ? "Comptage des espaces…"
              : avisActionnables === 0
                ? preview.avisDejaTraites > 0
                  ? `Les ${preview.avisDejaTraites} espace(s) actif(s) ont déjà cette demande (reçue, importée ou validée).`
                  : "Aucun espace client actif."
                : `${preview.avisADemander} client(s) à solliciter${
                    preview.avisEnAttente > 0
                      ? ` · ${preview.avisEnAttente} en attente, re-synchronisé(s)`
                      : ""
                  }${
                    preview.avisDejaTraites > 0
                      ? ` · ${preview.avisDejaTraites} déjà traité(s), ignorés`
                      : ""
                  }.`}
          </p>
          <p className="text-sm text-muted-foreground">{HORAIRES_EMAIL}</p>
          <Button
            type="button"
            disabled={envoiAvis || avisActionnables === 0}
            onClick={() => void envoyerAvis()}
          >
            {envoiAvis ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Demander le dernier avis d&apos;imposition
          </Button>
        </div>
      </SettingsPanel>
    </>
  );
}
