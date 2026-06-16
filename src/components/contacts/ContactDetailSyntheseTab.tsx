// Onglet « Synthèse » de la fiche contact (présentationnel).
// Extrait de ContactDetail : entièrement piloté par l'objet `contact`,
// aucun état ni callback.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Contact, Loader2, Mail, MapPin, Phone, User } from "lucide-react";
import { type Contact as ContactRecord } from "@/lib/api/tauri-contacts";
import {
  syncContactGoogle,
  googleContactSyncToastMessage,
} from "@/lib/api/tauri-google-contacts";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  canSyncContactToGoogle,
  googleSyncNeedsContactRefresh,
} from "@/lib/contacts/google-contact-sync-ui";
import {
  formatCiviliteLabel,
  formatSituationLabel,
} from "@/lib/contacts/contact-form-utils";
import { formatSriLabel, formatSriWithDefinition } from "@/lib/contacts/investisseur-sri";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { toast } from "sonner";

interface ContactDetailSyntheseTabProps {
  contact: ContactRecord;
  onContactUpdated?: () => void;
}

const formatDateNaissance = (value: string | number): string => {
  try {
    if (typeof value === "number") {
      return formatCalendarDateFr(value);
    }
    const date = new Date(value);
    return isNaN(date.getTime())
      ? "Non renseignée"
      : formatCalendarDateFr(Math.floor(date.getTime() / 1000));
  } catch {
    return "Non renseignée";
  }
};

export function ContactDetailSyntheseTab({
  contact,
  onContactUpdated,
}: ContactDetailSyntheseTabProps) {
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const showGoogleSync = contact.id != null && canSyncContactToGoogle(contact);

  const handleSyncGoogle = async () => {
    if (contact.id == null) return;
    setSyncingGoogle(true);
    try {
      const status = await getEmailConnectionStatus();
      if (status.provider !== "google" || !status.connected) {
        toast.error("Connectez Google dans Paramètres → Email.");
        return;
      }
      const result = await syncContactGoogle(contact.id);
      toast.success(googleContactSyncToastMessage(result));
      if (googleSyncNeedsContactRefresh(result)) {
        onContactUpdated?.();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync Google Contacts impossible.");
    } finally {
      setSyncingGoogle(false);
    }
  };

  return (
    <>
      {/* Informations de contact */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Informations de contact
          </CardTitle>
          {showGoogleSync && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={syncingGoogle}
              onClick={() => void handleSyncGoogle()}
              title="Créer ou mettre à jour dans Google Contacts — doublons Google nettoyés si besoin"
            >
              {syncingGoogle ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Contact className="h-4 w-4 mr-1.5" />
                  Sync Google
                </>
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {contact.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                {contact.email}
              </a>
            </div>
          )}
          {contact.telephone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${contact.telephone}`} className="text-primary hover:underline">
                {contact.telephone}
              </a>
            </div>
          )}
          {(contact.adresse || contact.ville) && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                {contact.adresse && <div>{contact.adresse}</div>}
                {(contact.code_postal || contact.ville) && (
                  <div>
                    {contact.code_postal} {contact.ville}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informations personnelles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {contact.civilite && (
            <div>
              <span className="text-muted-foreground text-sm">Civilité : </span>
              {formatCiviliteLabel(contact.civilite)}
            </div>
          )}
          {contact.situation_familiale && (
            <div>
              <span className="text-muted-foreground text-sm">Situation familiale : </span>
              {formatSituationLabel(contact.situation_familiale)}
            </div>
          )}
          {contact.profession && (
            <div>
              <span className="text-muted-foreground text-sm">Profession : </span>
              {contact.profession}
            </div>
          )}
          {contact.regime_matrimonial && (
            <div>
              <span className="text-muted-foreground text-sm">Régime matrimonial : </span>
              {contact.regime_matrimonial}
            </div>
          )}
          {contact.revenus_annuels != null && contact.revenus_annuels > 0 && (
            <div>
              <span className="text-muted-foreground text-sm">Revenus annuels : </span>
              {new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              }).format(contact.revenus_annuels)}
            </div>
          )}
          {contact.charges_emprunts != null && contact.charges_emprunts > 0 && (
            <div>
              <span className="text-muted-foreground text-sm">Charges d&apos;emprunts : </span>
              {new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              }).format(contact.charges_emprunts)}
              <span className="text-muted-foreground text-sm"> / an</span>
            </div>
          )}
          {contact.objectifs_patrimoniaux && (
            <div>
              <span className="text-muted-foreground text-sm">Objectifs : </span>
              {contact.objectifs_patrimoniaux}
            </div>
          )}
          {contact.source_lead && (
            <div>
              <span className="text-muted-foreground text-sm">Source / lead : </span>
              {contact.source_lead}
            </div>
          )}
          {contact.profil_risque_sri && (
            <div>
              <span className="text-muted-foreground text-sm">Profil investisseur (SRI) : </span>
              {formatSriLabel(contact.profil_risque_sri) ?? contact.profil_risque_sri}
              {formatSriWithDefinition(contact.profil_risque_sri) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatSriWithDefinition(contact.profil_risque_sri)}
                </p>
              )}
            </div>
          )}
          {contact.date_naissance && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground text-sm">Date de naissance: </span>
                {formatDateNaissance(contact.date_naissance)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suivi client */}
      {(contact.date_dernier_contact || contact.date_prochain_suivi) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Suivi client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {contact.date_dernier_contact && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground text-sm">Dernier contact :</span>
                  <p className="font-medium text-blue-700">
                    {formatCalendarDateFr(contact.date_dernier_contact)}
                  </p>
                </div>
              </div>
            )}
            {contact.date_prochain_suivi && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground text-sm">Prochain suivi prévu le :</span>
                  <p className="font-medium text-orange-700">
                    {formatCalendarDateFr(contact.date_prochain_suivi)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Suivi filleul */}
      {(contact.date_dernier_contact_filleul || contact.date_prochain_suivi_filleul) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Suivi filleul</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {contact.date_dernier_contact_filleul && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground text-sm">Dernier contact filleul :</span>
                  <p className="font-medium text-indigo-700">
                    {formatCalendarDateFr(contact.date_dernier_contact_filleul)}
                  </p>
                </div>
              </div>
            )}
            {contact.date_prochain_suivi_filleul && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground text-sm">Prochain suivi filleul :</span>
                  <p className="font-medium text-orange-700">
                    {formatCalendarDateFr(contact.date_prochain_suivi_filleul)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {contact.notes ? (
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans">
              {contact.notes}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">Aucune note pour ce contact</p>
          )}
        </CardContent>
      </Card>

      {/* Métadonnées */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Informations système</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div>Créé le: {new Date(contact.created_at * 1000).toLocaleString("fr-FR")}</div>
          <div>
            Mis à jour le: {new Date(contact.updated_at * 1000).toLocaleString("fr-FR")}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
