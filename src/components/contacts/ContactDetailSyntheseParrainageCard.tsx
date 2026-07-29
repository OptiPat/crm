import { Calendar } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { type Contact as ContactRecord } from "@/lib/api/tauri-contacts";
import { getFilleulDossier, type FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { describeOrganisationExerciceVisibilityHint } from "@/lib/organisation/organisation-filleul-dossier-validation";
import {
  dossierDateToInput,
  mergeLegacyFilleulDossierView,
  resolveFilleulDesinscriptionTimestamp,
  resolveFilleulInscriptionTimestamp,
  resolveFilleulInvitationTimestamp,
} from "@/lib/organisation/organisation-filleul-dossier";
import { FILLEUL_DOSSIER_DATE_LABELS } from "@/lib/organisation/organisation-filleul-dossier-labels";
import { FilleulDossierDateField } from "@/components/organisation/FilleulDossierDateField";
import { useFilleulDossierPatchQueue } from "@/hooks/useFilleulDossierPatchQueue";

type ContactDetailSyntheseParrainageCardProps = {
  contact: ContactRecord;
  mesFilleulsCount: number;
  header: React.ReactNode;
  onContactUpdated?: () => void;
};

function formatInvitationType(value?: string | null): string | null {
  if (value === "JD") return "Journée Découverte (JD)";
  if (value === "PO") return "PO";
  return null;
}

function formatPresence(value?: number | null): string | null {
  if (value === 1) return "Présent";
  if (value === 0) return "Absent";
  return null;
}

export function ContactDetailSyntheseParrainageCard({
  contact,
  mesFilleulsCount,
  header,
  onContactUpdated,
}: ContactDetailSyntheseParrainageCardProps) {
  const invitationType = formatInvitationType(contact.type_invitation_filleul);
  const presence = formatPresence(contact.presence_invitation_filleul);

  // Dossier réseau (module Organisation) — pas juste les champs legacy ci-dessus : ce sont ces
  // dates-là (inscription/désinscription) qui déterminent la présence du filleul sur un exercice.
  // Éditables ici aussi (même logique de sauvegarde que le module Organisation, cf.
  // useFilleulDossierPatchQueue) pour qu'une utilisatrice puisse corriger une date directement
  // depuis la fiche contact si son filleul n'apparaît pas sur l'exercice attendu.
  const [dossier, setDossier] = useState<FilleulDossier | null>(null);
  useEffect(() => {
    let cancelled = false;
    setDossier(null);
    if (contact.id == null) return;
    void getFilleulDossier(contact.id)
      .then((result) => {
        if (!cancelled) setDossier(result);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Chargement dossier filleul impossible", error);
        toast.error("Dates réseau indisponibles (dossier filleul non chargé).");
      });
    return () => {
      cancelled = true;
    };
  }, [contact.id]);

  // Fusionne les dates legacy du contact quand aucune ligne dossier n'existe encore, pour ne
  // pas les écraser à null lors du premier enregistrement (un seul champ édité = patch partiel
  // appliqué sur cette base, cf. useFilleulDossierPatchQueue).
  const resolvedDossier = mergeLegacyFilleulDossierView(contact, dossier);
  const { saving, saveDossierPatch } = useFilleulDossierPatchQueue({
    contact,
    dossier: resolvedDossier,
    canEdit: dossier != null,
    onDossierChange: setDossier,
    onCategorieChange: onContactUpdated,
  });

  const dateInvitation = resolveFilleulInvitationTimestamp(contact, dossier);
  const dateInscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  const dateDesinscription = resolveFilleulDesinscriptionTimestamp(dossier);
  const visibilityHint = describeOrganisationExerciceVisibilityHint(contact, dossier);

  return (
    <Card>
      {header}
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
          Parrain, titre, qualification et volumes : voir le module{" "}
          <span className="font-medium">Organisation</span>.
        </p>

        {invitationType && (
          <div>
            <span className="text-muted-foreground text-sm">Type d&apos;invitation : </span>
            {invitationType}
          </div>
        )}
        {presence && (
          <div>
            <span className="text-muted-foreground text-sm">Présence à l&apos;invitation : </span>
            {presence}
          </div>
        )}

        <div className="space-y-2 rounded-md border border-border/50 bg-muted/10 px-3 py-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Dates réseau (dossier Organisation)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FilleulDossierDateField
              id="parrainage-date-invitation"
              label={FILLEUL_DOSSIER_DATE_LABELS.dateInvitation}
              value={dossierDateToInput(dateInvitation)}
              disabled={dossier == null || saving}
              onSave={(value) => saveDossierPatch({ dateInvitation: value })}
            />
            <FilleulDossierDateField
              id="parrainage-date-inscription"
              label={FILLEUL_DOSSIER_DATE_LABELS.dateInscription}
              value={dossierDateToInput(dateInscription)}
              disabled={dossier == null || saving}
              onSave={(value) => saveDossierPatch({ dateInscription: value })}
            />
            <FilleulDossierDateField
              id="parrainage-date-desinscription"
              label={FILLEUL_DOSSIER_DATE_LABELS.dateDesinscription}
              value={dossierDateToInput(dateDesinscription)}
              disabled={dossier == null || saving}
              onSave={(value) => saveDossierPatch({ dateDesinscription: value })}
            />
          </div>
          {visibilityHint && (
            <p className="text-[11px] text-amber-800/90 bg-amber-50/80 border border-amber-200/60 rounded-md px-2 py-1.5">
              {visibilityHint}
            </p>
          )}
        </div>
        {contact.date_dernier_contact_filleul && (
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
        {contact.date_prochain_suivi_filleul && (
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

        {mesFilleulsCount > 0 && (
          <p className="text-sm text-muted-foreground rounded-md border px-3 py-2 bg-muted/20">
            Ce contact est parrain de {mesFilleulsCount} filleul
            {mesFilleulsCount > 1 ? "s" : ""}. Modifier les liens depuis le module Organisation.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
