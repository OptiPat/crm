// Onglet « Synthèse » de la fiche contact (présentationnel).
// Structure alignée sur le formulaire d'édition (ContactForm).

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Calendar,
  Contact,
  Loader2,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { type Contact as ContactRecord } from "@/lib/api/tauri-contacts";
import { type Foyer } from "@/lib/api/tauri-foyers";
import { openExternalUrl } from "@/lib/api/tauri-system";
import { resolveContactFiscal, type FiscalFields } from "@/lib/foyers/foyer-fiscal-sync";
import { ContactFoyerRelationsBlock, type ContactFoyerRelationsActions } from "@/components/contacts/ContactFoyerRelationsBlock";
import { FoyerProspectionDatesApplyButton } from "@/components/contacts/FoyerProspectionDatesApplyButton";
import { prospectionDatesFromContact } from "@/lib/foyers/foyer-prospection-dates-sync";
import {
  syncContactGoogle,
  googleContactSyncToastMessage,
} from "@/lib/api/tauri-google-contacts";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  canSyncContactToGoogle,
  googleSyncNeedsContactRefresh,
} from "@/lib/contacts/google-contact-sync-ui";
import { ContactDetailSyntheseParrainageCard } from "@/components/contacts/ContactDetailSyntheseParrainageCard";
import {
  formatCiviliteLabel,
  formatSituationLabel,
  formatStatutSuiviLabel,
  getClientLabel,
  getFilleulLabel,
  isClientActif,
  isFilleulReseauInscrit,
  isFilleulStatut,
  stripDateInscriptionFromNotes,
} from "@/lib/contacts/contact-form-utils";
import {
  CONTACT_FORM_SECTIONS,
  CONTACT_FORM_SECTION_META,
  CONTACT_SYNTHSE_SECTION_ICON_CLASS,
  type ContactFormSectionId,
  type ContactFormSectionKey,
} from "@/lib/contacts/contact-form-sections";
import {
  getClientRoleBadgeClass,
  getFilleulRoleBadgeClass,
} from "@/lib/contacts/contact-category-display";
import {
  formatSriLabel,
  getSriDefinition,
  PROFIL_RISQUE_SRI_FIELD_LABEL,
} from "@/lib/contacts/investisseur-sri";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { toast } from "sonner";

interface ContactDetailSyntheseTabProps {
  contact: ContactRecord;
  foyer?: Foyer | null;
  foyerMembers?: ContactRecord[];
  loadingFoyer?: boolean;
  parrain?: ContactRecord | null;
  prescripteur?: ContactRecord | null;
  loadingParrain?: boolean;
  loadingPrescripteur?: boolean;
  mesFilleulsCount?: number;
  foyerActions?: ContactFoyerRelationsActions;
  onOpenContact?: (contact: ContactRecord) => void;
  onContactUpdated?: () => void;
  onEditSection?: (sectionId: ContactFormSectionId) => void;
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

function hasIdentiteContent(contact: ContactRecord): boolean {
  return !!(
    contact.civilite ||
    contact.situation_familiale ||
    contact.regime_matrimonial ||
    contact.date_naissance ||
    contact.lieu_naissance
  );
}

function hasVieProContent(contact: ContactRecord): boolean {
  return !!(
    contact.profession ||
    (contact.revenus_annuels != null && contact.revenus_annuels > 0) ||
    (contact.charges_emprunts != null && contact.charges_emprunts > 0) ||
    (contact.epargne_precaution_souhaitee != null &&
      contact.epargne_precaution_souhaitee > 0) ||
    contact.objectifs_patrimoniaux ||
    contact.profil_risque_sri
  );
}

function hasFiscalDisplayContent(fiscal: FiscalFields): boolean {
  return !!(
    fiscal.tranche_imposition ||
    fiscal.nombre_parts_fiscales != null ||
    (fiscal.revenu_fiscal_reference != null && fiscal.revenu_fiscal_reference > 0) ||
    (fiscal.ir_net_a_payer != null && fiscal.ir_net_a_payer > 0)
  );
}

function hasRelationsContent(
  contact: ContactRecord,
  parrain?: ContactRecord | null,
  prescripteur?: ContactRecord | null
): boolean {
  const filleulInscrit = isFilleulReseauInscrit(contact.filleul_categorie);
  return !!(
    contact.foyer_id ||
    contact.source_lead ||
    (!filleulInscrit && (contact.parrain_id || parrain)) ||
    contact.prescripteur_id ||
    prescripteur
  );
}

function LinkedContactRow({
  label,
  person,
  loading,
  missingId,
  onOpen,
}: {
  label: string;
  person?: ContactRecord | null;
  loading?: boolean;
  missingId?: number | null;
  onOpen?: (contact: ContactRecord) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-muted-foreground text-sm">{label} : </span>
      {loading ? (
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Chargement…
        </span>
      ) : person && onOpen ? (
        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={() => onOpen(person)}
        >
          {person.prenom} {person.nom}
        </button>
      ) : person ? (
        <span className="text-sm">
          {person.prenom} {person.nom}
        </span>
      ) : missingId ? (
        <span className="text-sm text-muted-foreground">Contact introuvable (ID {missingId})</span>
      ) : null}
    </div>
  );
}

function SyntheseCardHeader({
  sectionKey,
  onEditSection,
  trailing,
}: {
  sectionKey: ContactFormSectionKey;
  onEditSection?: (sectionId: ContactFormSectionId) => void;
  trailing?: ReactNode;
}) {
  const meta = CONTACT_FORM_SECTION_META[sectionKey];
  const Icon = meta.icon;
  const sectionId = CONTACT_FORM_SECTIONS[sectionKey];
  return (
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <CardTitle className="text-lg flex items-center gap-2">
        <Icon className={CONTACT_SYNTHSE_SECTION_ICON_CLASS} aria-hidden />
        {meta.label}
      </CardTitle>
      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        {onEditSection && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onEditSection(sectionId)}
          >
            Modifier
          </Button>
        )}
      </div>
    </CardHeader>
  );
}

export function ContactDetailSyntheseTab({
  contact,
  foyer = null,
  foyerMembers = [],
  loadingFoyer = false,
  parrain,
  prescripteur,
  loadingParrain = false,
  loadingPrescripteur = false,
  mesFilleulsCount = 0,
  foyerActions,
  onOpenContact,
  onContactUpdated,
  onEditSection,
}: ContactDetailSyntheseTabProps) {
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const showGoogleSync = contact.id != null && canSyncContactToGoogle(contact);

  // Fiscalité affichée : foyer prime champ par champ, sinon copie contact.
  const fiscal = resolveContactFiscal(contact, foyer);
  const clientLabel = getClientLabel(contact.categorie || "AUCUN");
  const filleulLabel = getFilleulLabel(contact.filleul_categorie);
  const filleulReseauInscrit = isFilleulReseauInscrit(contact.filleul_categorie);
  const notesDisplay = stripDateInscriptionFromNotes(contact.notes);
  const showRolesCard =
    clientLabel ||
    filleulLabel ||
    contact.statut_suivi ||
    contact.date_r1 ||
    contact.date_dernier_contact ||
    contact.date_prochain_suivi ||
    (!filleulReseauInscrit && contact.date_dernier_contact_filleul) ||
    (!filleulReseauInscrit && contact.date_prochain_suivi_filleul);

  const handleSyncGoogle = async () => {
    if (contact.id == null) return;
    setSyncingGoogle(true);
    try {
      const status = await getEmailConnectionStatus();
      if (status.provider !== "google" || !status.connected) {
        toast.error("Connectez Google dans Paramètres → Emails & envois → Connexion.");
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
      {hasIdentiteContent(contact) && (
        <Card>
          <SyntheseCardHeader
            sectionKey="identite"
            onEditSection={onEditSection}
          />
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
            {contact.regime_matrimonial && (
              <div>
                <span className="text-muted-foreground text-sm">Régime matrimonial : </span>
                {contact.regime_matrimonial}
              </div>
            )}
            {contact.date_naissance && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground text-sm">Date de naissance : </span>
                  {formatDateNaissance(contact.date_naissance)}
                </div>
              </div>
            )}
            {contact.lieu_naissance && (
              <div>
                <span className="text-muted-foreground text-sm">Lieu de naissance : </span>
                {contact.lieu_naissance}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <SyntheseCardHeader
          sectionKey="coordonnees"
          onEditSection={onEditSection}
          trailing={
            showGoogleSync ? (
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
            ) : undefined
          }
        />
        <CardContent className="space-y-3">
          {contact.email ? (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <button
                type="button"
                onClick={() => void openExternalUrl(`mailto:${contact.email}`)}
                className="text-primary hover:underline"
              >
                {contact.email}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Email non renseigné</p>
          )}
          {contact.telephone ? (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <button
                type="button"
                onClick={() => void openExternalUrl(`tel:${contact.telephone}`)}
                className="text-primary hover:underline"
              >
                {contact.telephone}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Téléphone non renseigné</p>
          )}
          {(contact.adresse || contact.ville || contact.pays) ? (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                {contact.adresse && <div>{contact.adresse}</div>}
                {(contact.code_postal || contact.ville) && (
                  <div>
                    {contact.code_postal} {contact.ville}
                  </div>
                )}
                {contact.pays && <div>{contact.pays}</div>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Adresse non renseignée</p>
          )}
          <div>
            <span className="text-muted-foreground text-sm">Registre (emails) : </span>
            {contact.registre === "TU" ? "Tutoiement" : "Vouvoiement"}
          </div>
        </CardContent>
      </Card>

      {(hasVieProContent(contact) || hasFiscalDisplayContent(fiscal)) && (
        <Card>
          <SyntheseCardHeader
            sectionKey="viePro"
            onEditSection={onEditSection}
          />
          <CardContent className="space-y-3">
            {contact.profession && (
              <div>
                <span className="text-muted-foreground text-sm">Profession : </span>
                {contact.profession}
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
            {contact.epargne_precaution_souhaitee != null &&
              contact.epargne_precaution_souhaitee > 0 && (
                <div>
                  <span className="text-muted-foreground text-sm">
                    Épargne de précaution souhaitée :{" "}
                  </span>
                  {new Intl.NumberFormat("fr-FR", {
                    style: "currency",
                    currency: "EUR",
                    maximumFractionDigits: 0,
                  }).format(contact.epargne_precaution_souhaitee)}
                </div>
              )}
            {contact.objectifs_patrimoniaux && (
              <div>
                <span className="text-muted-foreground text-sm">Objectifs : </span>
                {contact.objectifs_patrimoniaux}
              </div>
            )}
            {contact.profil_risque_sri && (
              <div>
                <span className="text-muted-foreground text-sm">{PROFIL_RISQUE_SRI_FIELD_LABEL} : </span>
                {formatSriLabel(contact.profil_risque_sri) ?? contact.profil_risque_sri}
                {getSriDefinition(contact.profil_risque_sri) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getSriDefinition(contact.profil_risque_sri)}
                  </p>
                )}
              </div>
            )}
            {hasFiscalDisplayContent(fiscal) && (
              <div className="space-y-1 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Fiscalité{foyer ? " (foyer)" : ""}
                </p>
                {fiscal.tranche_imposition && (
                  <div>
                    <span className="text-muted-foreground text-sm">TMI : </span>
                    {fiscal.tranche_imposition}
                  </div>
                )}
                {fiscal.revenu_fiscal_reference != null &&
                  fiscal.revenu_fiscal_reference > 0 && (
                    <div>
                      <span className="text-muted-foreground text-sm">
                        Revenu brut global :{" "}
                      </span>
                      {new Intl.NumberFormat("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                        maximumFractionDigits: 0,
                      }).format(fiscal.revenu_fiscal_reference)}
                    </div>
                  )}
                {fiscal.nombre_parts_fiscales != null && (
                  <div>
                    <span className="text-muted-foreground text-sm">
                      Nombre de parts fiscales :{" "}
                    </span>
                    {fiscal.nombre_parts_fiscales}
                  </div>
                )}
                {fiscal.ir_net_a_payer != null && fiscal.ir_net_a_payer > 0 && (
                  <div>
                    <span className="text-muted-foreground text-sm">
                      IR net à payer :{" "}
                    </span>
                    {new Intl.NumberFormat("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0,
                    }).format(fiscal.ir_net_a_payer)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(hasRelationsContent(contact, parrain, prescripteur) ||
        isClientActif(contact.categorie)) && (
        <Card>
          <SyntheseCardHeader
            sectionKey="relations"
            onEditSection={onEditSection}
          />
          <CardContent className="space-y-3">
            <ContactFoyerRelationsBlock
              contact={contact}
              foyer={foyer}
              foyerMembers={foyerMembers}
              loading={loadingFoyer}
              onOpenMember={onOpenContact}
              actions={foyerActions}
              className="border-0 bg-transparent px-0 py-0"
            />
            {(contact.parrain_id || parrain) && !filleulReseauInscrit && (
              <LinkedContactRow
                label="Parrain"
                person={parrain}
                loading={loadingParrain}
                missingId={!parrain && !loadingParrain ? contact.parrain_id : null}
                onOpen={onOpenContact}
              />
            )}
            {(contact.prescripteur_id || prescripteur) && (
              <LinkedContactRow
                label="Prescripteur"
                person={prescripteur}
                loading={loadingPrescripteur}
                missingId={!prescripteur && !loadingPrescripteur ? contact.prescripteur_id : null}
                onOpen={onOpenContact}
              />
            )}
            {contact.source_lead && (
              <div>
                <span className="text-muted-foreground text-sm">Source / lead : </span>
                {contact.source_lead}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {filleulReseauInscrit && (
        <ContactDetailSyntheseParrainageCard
          contact={contact}
          parrain={parrain}
          loadingParrain={loadingParrain}
          mesFilleulsCount={mesFilleulsCount}
          onOpenContact={onOpenContact}
          header={
            <SyntheseCardHeader
              sectionKey="parrainage"
              onEditSection={onEditSection}
            />
          }
        />
      )}

      {showRolesCard && (
        <Card>
          <SyntheseCardHeader
            sectionKey="roles"
            onEditSection={onEditSection}
          />
          <CardContent className="space-y-3">
            {(clientLabel || filleulLabel) && (
              <div className="flex flex-wrap gap-1.5">
                {clientLabel && (
                  <Badge variant="outline" className={getClientRoleBadgeClass(contact.categorie)}>
                    {clientLabel}
                  </Badge>
                )}
                {filleulLabel && isFilleulStatut(contact.filleul_categorie) && (
                  <Badge
                    variant="outline"
                    className={getFilleulRoleBadgeClass(contact.filleul_categorie)}
                  >
                    {filleulLabel}
                  </Badge>
                )}
              </div>
            )}
            {contact.statut_suivi && (
              <div>
                <span className="text-muted-foreground text-sm">Statut de suivi : </span>
                {formatStatutSuiviLabel(contact.statut_suivi)}
              </div>
            )}
            {contact.date_r1 && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground text-sm">Premier RDV (R1) : </span>
                  <span className="font-medium text-emerald-700">
                    {formatCalendarDateFr(contact.date_r1)}
                  </span>
                </div>
              </div>
            )}
            {contact.date_dernier_contact && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground text-sm">Dernier contact (client) : </span>
                  <span className="font-medium text-blue-700">
                    {formatCalendarDateFr(contact.date_dernier_contact)}
                  </span>
                </div>
              </div>
            )}
            {contact.id != null &&
              (isClientActif(contact.categorie) ||
                contact.categorie === "PROSPECT_CLIENT" ||
                contact.categorie === "SUSPECT_CLIENT") && (
              <FoyerProspectionDatesApplyButton
                contactId={contact.id}
                foyerId={contact.foyer_id}
                foyerMembers={foyerMembers}
                dates={prospectionDatesFromContact(contact)}
                onApplied={onContactUpdated}
              />
            )}
            {contact.date_prochain_suivi && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground text-sm">Prochain suivi (client) : </span>
                  <span className="font-medium text-orange-700">
                    {formatCalendarDateFr(contact.date_prochain_suivi)}
                  </span>
                </div>
              </div>
            )}
            {contact.date_dernier_contact_filleul && !filleulReseauInscrit && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground text-sm">Dernier contact (filleul) : </span>
                  <span className="font-medium text-indigo-700">
                    {formatCalendarDateFr(contact.date_dernier_contact_filleul)}
                  </span>
                </div>
              </div>
            )}
            {contact.date_prochain_suivi_filleul && !filleulReseauInscrit && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground text-sm">Prochain suivi (filleul) : </span>
                  <span className="font-medium text-orange-700">
                    {formatCalendarDateFr(contact.date_prochain_suivi_filleul)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <SyntheseCardHeader
          sectionKey="notes"
          onEditSection={onEditSection}
        />
        <CardContent>
          {notesDisplay ? (
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans">
              {notesDisplay}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">Aucune note pour ce contact</p>
          )}
        </CardContent>
      </Card>

      <details className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">Informations système</summary>
        <div className="mt-2 space-y-1">
          <div>Créé le : {new Date(contact.created_at * 1000).toLocaleString("fr-FR")}</div>
          <div>Mis à jour le : {new Date(contact.updated_at * 1000).toLocaleString("fr-FR")}</div>
        </div>
      </details>
    </>
  );
}
