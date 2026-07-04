import { useEffect, useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { type Contact as ContactRecord, getAllContacts } from "@/lib/api/tauri-contacts";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { RankIcon } from "@/components/organisation/FilleulRankIcons";
import {
  computeContactBranchVolumeSummary,
  formatFilleulVolumeDisplay,
} from "@/lib/organisation/organisation-branch-volumes";
import { ORGANISATION_MANAGER_VOLUME_TARGET } from "@/lib/organisation/organisation-manager-objective";
import { resolveOrganisationSelfContact } from "@/lib/organisation/organisation-tree";
import { cn } from "@/lib/utils";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import {
  FILLEUL_QUALIFICATION_META,
  FILLEUL_TITRE_META,
  getFilleulQualificationLabel,
  getFilleulTitreLabel,
  parseFilleulQualification,
  parseFilleulTitre,
} from "@/lib/organisation/filleul-ranks";

type ContactDetailSyntheseParrainageCardProps = {
  contact: ContactRecord;
  parrain?: ContactRecord | null;
  loadingParrain?: boolean;
  mesFilleulsCount: number;
  onOpenContact?: (contact: ContactRecord) => void;
  header: React.ReactNode;
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
  parrain,
  loadingParrain,
  mesFilleulsCount,
  onOpenContact,
  header,
}: ContactDetailSyntheseParrainageCardProps) {
  const [allContacts, setAllContacts] = useState<ContactRecord[]>([]);
  const [cgpNom, setCgpNom] = useState("");
  const [cgpPrenom, setCgpPrenom] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void Promise.all([getAllContacts(), getCgpConfig()]).then(([contacts, cgp]) => {
        if (cancelled) return;
        setAllContacts(contacts);
        setCgpNom(cgp.nom?.trim() ?? "");
        setCgpPrenom(cgp.prenom?.trim() ?? "");
      });
    };
    load();
    const unsub = subscribeContactsChanged(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [contact.id]);

  const selfContact = useMemo(
    () => resolveOrganisationSelfContact(allContacts, { nom: cgpNom, prenom: cgpPrenom }),
    [allContacts, cgpNom, cgpPrenom]
  );

  const volumeSummary = useMemo(
    () => computeContactBranchVolumeSummary(contact, allContacts, selfContact),
    [contact, allContacts, selfContact]
  );

  const invitationType = formatInvitationType(contact.type_invitation_filleul);
  const presence = formatPresence(contact.presence_invitation_filleul);
  const titreId = parseFilleulTitre(contact.filleul_titre);
  const qualificationId = parseFilleulQualification(contact.filleul_qualification);
  const managerStatus = volumeSummary.managerObjectiveStatus;
  const managerColored = managerStatus !== "not_applicable";

  return (
    <Card>
      {header}
      <CardContent className="space-y-3">
        {contact.date_invitation_filleul && (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground text-sm">Date d&apos;invitation : </span>
              {formatCalendarDateFr(contact.date_invitation_filleul)}
            </div>
          </div>
        )}
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
        {contact.date_inscription_filleul && (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-muted-foreground text-sm">Date d&apos;inscription : </span>
              {formatCalendarDateFr(contact.date_inscription_filleul)}
            </div>
          </div>
        )}
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

        {(contact.parrain_id || parrain) && (
          <div className="space-y-1">
            <span className="text-muted-foreground text-sm">Mon parrain : </span>
            {loadingParrain ? (
              <span className="text-sm text-muted-foreground">Chargement…</span>
            ) : parrain && onOpenContact ? (
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => onOpenContact(parrain)}
              >
                {parrain.prenom} {parrain.nom}
              </button>
            ) : parrain ? (
              <span className="text-sm">
                {parrain.prenom} {parrain.nom}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Contact introuvable (ID {contact.parrain_id})
              </span>
            )}
          </div>
        )}

        {(titreId || qualificationId) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {titreId && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm shrink-0">Titre : </span>
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <RankIcon kind={FILLEUL_TITRE_META[titreId].icon} />
                  {getFilleulTitreLabel(contact.filleul_titre)}
                </span>
              </div>
            )}
            {qualificationId && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm shrink-0">Qualification : </span>
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <RankIcon kind={FILLEUL_QUALIFICATION_META[qualificationId].icon} />
                  {getFilleulQualificationLabel(contact.filleul_qualification)}
                </span>
              </div>
            )}
          </div>
        )}

        {mesFilleulsCount > 0 && (
          <p className="text-sm text-muted-foreground rounded-md border px-3 py-2 bg-muted/20">
            Ce contact est parrain de {mesFilleulsCount} filleul
            {mesFilleulsCount > 1 ? "s" : ""}. Modifier le lien depuis la fiche de chaque filleul.
          </p>
        )}

        <div
          className={cn(
            "grid gap-3 border-t pt-3",
            volumeSummary.managerObjectiveEligible ? "sm:grid-cols-3" : "sm:grid-cols-2"
          )}
        >
          {volumeSummary.managerObjectiveEligible && (
            <div>
              <span className="text-muted-foreground text-sm">Objectif Manager (cumul) : </span>
              <span
                className={cn(
                  "font-medium tabular-nums rounded px-1.5 py-0.5",
                  managerColored && managerStatus === "target_met" && "bg-emerald-50 text-emerald-800",
                  managerColored && managerStatus === "below_target" && "bg-amber-50 text-amber-800"
                )}
                title={`Objectif ${formatFilleulVolumeDisplay(ORGANISATION_MANAGER_VOLUME_TARGET)} cumul branche`}
              >
                {formatFilleulVolumeDisplay(volumeSummary.managerVolume)}
              </span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground text-sm">Volume propre (exercice) : </span>
            <span className="font-medium tabular-nums">
              {formatFilleulVolumeDisplay(volumeSummary.ownVolume)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground text-sm">Volume branche (exercice) : </span>
            <span className="font-medium tabular-nums">
              {formatFilleulVolumeDisplay(volumeSummary.branchVolume)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
