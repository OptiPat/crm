import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { normalizeAgendaLinks, type AgendaLink } from "@/lib/emails/agenda-links";
import {
  createEspaceEcheance,
  deleteEspaceEcheance,
  listEspaceEcheances,
  type EspaceEcheance,
} from "@/lib/api/tauri-espace-client";

interface ContactEspaceEcheancesPanelProps {
  contactId: number;
}

/** Jour saisi (AAAA-MM-JJ) → horodatage à midi, à l'abri des fuseaux. */
function dateToUnix(valeur: string): number | null {
  if (!valeur) return null;
  const [annee, mois, jour] = valeur.split("-").map(Number);
  if (!annee || !mois || !jour) return null;
  return Math.floor(new Date(annee, mois - 1, jour, 12, 0, 0).getTime() / 1000);
}

function unixToLabel(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Échéances que le conseiller adresse à un client précis.
 *
 * À la différence des alertes et des tâches, qui restent internes, celles-ci
 * s'affichent dans l'espace client. Chacune peut renvoyer vers un des liens
 * d'agenda des réglages, et son bouton mène alors droit au bon rendez-vous.
 */
export function ContactEspaceEcheancesPanel({
  contactId,
}: ContactEspaceEcheancesPanelProps) {
  const [echeances, setEcheances] = useState<EspaceEcheance[]>([]);
  const [liens, setLiens] = useState<AgendaLink[]>([]);
  const [date, setDate] = useState("");
  const [titre, setTitre] = useState("");
  const [message, setMessage] = useState("");
  const [rdvLienId, setRdvLienId] = useState("");
  const [enCours, setEnCours] = useState(false);

  const recharger = useCallback(async () => {
    try {
      setEcheances(await listEspaceEcheances(contactId));
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Échéances illisibles");
    }
  }, [contactId]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  useEffect(() => {
    let annule = false;
    getCgpConfig()
      .then((cgp) => {
        if (!annule) setLiens(normalizeAgendaLinks(cgp));
      })
      .catch(() => {
        if (!annule) setLiens([]);
      });
    return () => {
      annule = true;
    };
  }, []);

  const maintenant = useMemo(() => Math.floor(Date.now() / 1000), []);

  const ajouter = async () => {
    const unix = dateToUnix(date);
    if (unix == null) {
      toast.error("Date invalide");
      return;
    }
    setEnCours(true);
    try {
      await createEspaceEcheance(
        contactId,
        unix,
        titre,
        message.trim() || null,
        rdvLienId || null
      );
      setDate("");
      setTitre("");
      setMessage("");
      setRdvLienId("");
      await recharger();
      toast.success("Échéance ajoutée — resynchronisez pour la publier");
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Ajout impossible");
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = async (id: number) => {
    try {
      await deleteEspaceEcheance(id);
      await recharger();
    } catch (error) {
      toast.error(invokeErrorMessage(error) || "Suppression impossible");
    }
  };

  return (
    <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
      <div>
        <p className="text-xs font-medium text-foreground">
          Échéances affichées au client
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Vos alertes et vos tâches restent internes. Ces échéances-ci sont
          écrites pour le client et apparaissent dans son espace.
        </p>
      </div>

      {echeances.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune échéance.</p>
      ) : (
        <ul className="space-y-1.5">
          {echeances.map((echeance) => {
            const passee = echeance.date_echeance < maintenant;
            const lien = liens.find((l) => l.id === echeance.rdv_lien_id);
            return (
              <li
                key={echeance.id}
                className="flex items-start gap-2 rounded-md border border-border/60 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground">
                    {unixToLabel(echeance.date_echeance)} — {echeance.titre}
                  </p>
                  {echeance.message ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {echeance.message}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {passee
                      ? "Date passée — invisible côté client"
                      : lien
                        ? `Bouton : ${lien.label}`
                        : "Sans bouton de rendez-vous"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  aria-label="Supprimer"
                  onClick={() => void supprimer(echeance.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="echeance-date" className="text-xs">
            Date
          </Label>
          <Input
            id="echeance-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="echeance-titre" className="text-xs">
            Intitulé
          </Label>
          <Input
            id="echeance-titre"
            value={titre}
            onChange={(event) => setTitre(event.target.value)}
            placeholder="Aide à la déclaration de revenus"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="echeance-message" className="text-xs">
            Précision affichée au client (facultatif)
          </Label>
          <Input
            id="echeance-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Préparez vos justificatifs de revenus fonciers"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="echeance-rdv" className="text-xs">
            Bouton de rendez-vous
          </Label>
          <select
            id="echeance-rdv"
            value={rdvLienId}
            onChange={(event) => setRdvLienId(event.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Aucun</option>
            {liens.map((lien) => (
              <option key={lien.id} value={lien.id}>
                {lien.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={enCours || !date || !titre.trim()}
            onClick={() => void ajouter()}
          >
            Ajouter l'échéance
          </Button>
        </div>
      </div>

      {liens.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucun lien d'agenda dans vos réglages : ajoutez-en un pour proposer
          un bouton de prise de rendez-vous.
        </p>
      ) : null}
    </div>
  );
}
