import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Plus, Trash2 } from "lucide-react";
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

function formatJour(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Échéances que le conseiller adresse à un client précis.
 *
 * À la différence des alertes et des tâches, qui restent internes au CRM,
 * celles-ci s'affichent dans l'espace du client. Chacune peut renvoyer vers un
 * des liens d'agenda des réglages, et son bouton mène alors au bon rendez-vous.
 */
export function ContactEspaceEcheancesPanel({
  contactId,
}: ContactEspaceEcheancesPanelProps) {
  const [echeances, setEcheances] = useState<EspaceEcheance[]>([]);
  const [liens, setLiens] = useState<AgendaLink[]>([]);
  const [formOuvert, setFormOuvert] = useState(false);
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

  const fermerFormulaire = () => {
    setFormOuvert(false);
    setDate("");
    setTitre("");
    setMessage("");
    setRdvLienId("");
  };

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
      fermerFormulaire();
      await recharger();
      toast.success("Échéance ajoutée — synchronisez pour la publier");
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
    <div className="mt-6 border-t border-border/60 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <CalendarPlus className="h-4 w-4 text-muted-foreground" />
            Échéances affichées au client
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Vos alertes et vos tâches restent internes. Celles-ci sont écrites
            pour le client et apparaissent dans son espace.
          </p>
        </div>
        {!formOuvert ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            onClick={() => setFormOuvert(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Ajouter
          </Button>
        ) : null}
      </div>

      {echeances.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {echeances.map((echeance) => {
            const passee = echeance.date_echeance < maintenant;
            const lien = liens.find((l) => l.id === echeance.rdv_lien_id);
            return (
              <li
                key={echeance.id}
                className="flex items-start gap-3 rounded-lg border border-border/80 bg-background p-3 shadow-sm"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {echeance.titre}
                  </p>
                  {echeance.message ? (
                    <p className="text-sm text-muted-foreground">
                      {echeance.message}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {formatJour(echeance.date_echeance)}
                    {passee
                      ? " · date passée, invisible côté client"
                      : lien
                        ? ` · bouton « ${lien.label} »`
                        : " · sans bouton"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                  aria-label="Supprimer l'échéance"
                  onClick={() => void supprimer(echeance.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : !formOuvert ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Aucune échéance pour ce client.
        </p>
      ) : null}

      {formOuvert ? (
        <div className="mt-4 space-y-4 rounded-lg border border-border/80 bg-muted/20 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="echeance-titre">Intitulé</Label>
              <Input
                id="echeance-titre"
                value={titre}
                onChange={(event) => setTitre(event.target.value)}
                placeholder="Aide à la déclaration de revenus"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="echeance-date">Date</Label>
              <Input
                id="echeance-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="echeance-message">
              Précision affichée au client
              <span className="ml-1 font-normal text-muted-foreground">
                (facultatif)
              </span>
            </Label>
            <Input
              id="echeance-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Préparez vos justificatifs de revenus fonciers"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="echeance-rdv">Bouton de prise de rendez-vous</Label>
            <select
              id="echeance-rdv"
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
            <p className="text-sm text-muted-foreground">
              {liens.length === 0
                ? "Aucun lien d'agenda dans Paramètres → Agenda & RDV."
                : "Le client arrive directement sur cet agenda."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-9"
              disabled={enCours || !date || !titre.trim()}
              onClick={() => void ajouter()}
            >
              Ajouter l&apos;échéance
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={fermerFormulaire}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
