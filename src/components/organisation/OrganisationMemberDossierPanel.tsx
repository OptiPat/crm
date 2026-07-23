import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ExternalLink,
  FileText,
  Loader2,
  UserRound,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Contact } from "@/lib/api/tauri-contacts";
import { getFilleulVolumeExercicesByContact } from "@/lib/api/tauri-filleul-volumes";
import { isOrganisationActifFilleul } from "@/lib/organisation/organisation-tree";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { FilleulRankBadges } from "@/components/organisation/FilleulRankBadges";
import {
  formatFilleulVolumeDisplay,
  formatFilleulVolumeField,
  parseFilleulVolumeField,
} from "@/lib/organisation/organisation-branch-volumes";
import { isManagerObjectiveEligible } from "@/lib/organisation/organisation-manager-objective";
import { buildMemberDossierVolumeRows } from "@/lib/organisation/organisation-member-dossier";
import {
  findOrganisationMemberRosterEntry,
  organisationMemberLevelLabel,
  organisationMemberStatusLabel,
  type OrganisationMemberRosterEntry,
} from "@/lib/organisation/organisation-member-roster";
import { resolveOrganisationSelfContact } from "@/lib/organisation/organisation-tree";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type OrganisationMemberDossierPanelProps = {
  contactId: number | null;
  roster: OrganisationMemberRosterEntry[];
  contacts: Contact[];
  cgp: CgpConfig | null;
  canEditVolumes: boolean;
  refreshKey: number;
  onClose: () => void;
  onSelectMember: (contactId: number) => void;
  onOpenContactSheet: (contactId: number) => void;
  onVolumeSave?: (contact: Contact, volume: number | null) => void | Promise<void>;
  onManagerVolumeSave?: (contact: Contact, volume: number | null) => void | Promise<void>;
};

function formatVolumeReadOnly(value: number | null): string {
  if (value == null) return "—";
  return formatFilleulVolumeDisplay(value);
}

export function OrganisationMemberDossierPanel({
  contactId,
  roster,
  contacts,
  cgp,
  canEditVolumes,
  refreshKey,
  onClose,
  onSelectMember,
  onOpenContactSheet,
  onVolumeSave,
  onManagerVolumeSave,
}: OrganisationMemberDossierPanelProps) {
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<
    Awaited<ReturnType<typeof getFilleulVolumeExercicesByContact>>
  >([]);

  const entry = useMemo(
    () => (contactId != null ? findOrganisationMemberRosterEntry(roster, contactId) : undefined),
    [roster, contactId]
  );

  const contact = useMemo(() => {
    if (contactId == null) return null;
    return entry?.contact ?? contacts.find((c) => c.id === contactId) ?? null;
  }, [contactId, entry, contacts]);

  const selfContact = useMemo(
    () => resolveOrganisationSelfContact(contacts, cgp ?? {}),
    [contacts, cgp]
  );

  const parrain = useMemo(() => {
    if (!contact?.parrain_id) return null;
    return contacts.find((c) => c.id === contact.parrain_id) ?? null;
  }, [contact, contacts]);

  const editable =
    canEditVolumes &&
    contact != null &&
    isOrganisationActifFilleul(contact) &&
    onVolumeSave != null &&
    onManagerVolumeSave != null;

  const managerObjectiveEligible =
    contact != null &&
    isManagerObjectiveEligible(contact.filleul_titre, contact.filleul_qualification);

  useEffect(() => {
    if (contactId == null) {
      setHistoryRecords([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    void getFilleulVolumeExercicesByContact(contactId)
      .then((records) => {
        if (!cancelled) setHistoryRecords(records);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          toast.error("Impossible de charger l'historique des volumes");
          setHistoryRecords([]);
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, refreshKey]);

  const volumeRows = useMemo(() => {
    if (!contact) return [];
    return buildMemberDossierVolumeRows(
      contact,
      historyRecords,
      contacts,
      selfContact
    );
  }, [contact, historyRecords, contacts, selfContact]);

  const displayName = contact
    ? `${contact.prenom ?? ""} ${contact.nom ?? ""}`.trim()
    : "";
  const isDesinscrit = entry?.status === "desinscrit";
  const levelLabel = organisationMemberLevelLabel(entry?.generation);

  return (
    <Sheet
      open={contactId != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl lg:max-w-2xl p-0 flex flex-col gap-0 overflow-hidden"
      >
        {!contact ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            Consultant introuvable.
          </div>
        ) : (
          <>
            <SheetHeader className="shrink-0 border-b px-4 py-4 pr-12 space-y-3 text-left">
              <SheetTitle className="text-base leading-snug flex items-center gap-2">
                {isDesinscrit ? (
                  <UserX className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                ) : (
                  <UserRound className="h-4 w-4 text-primary shrink-0" aria-hidden />
                )}
                <span className="truncate">{displayName}</span>
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-1.5">
                  {entry ? (
                    <Badge
                      variant={isDesinscrit ? "secondary" : "outline"}
                      className="text-[11px]"
                    >
                      {organisationMemberStatusLabel(entry.status)}
                    </Badge>
                  ) : null}
                  {levelLabel ? (
                    <Badge variant="outline" className="text-[11px] tabular-nums">
                      {levelLabel}
                    </Badge>
                  ) : null}
                  <FilleulRankBadges
                    titre={contact.filleul_titre}
                    qualification={contact.filleul_qualification}
                  />
                </div>
              </SheetDescription>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 w-fit"
                onClick={() => onOpenContactSheet(contactId!)}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Fiche contact
              </Button>
            </SheetHeader>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
              <section className="space-y-2 text-sm">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Réseau
                </h4>
                {parrain ? (
                  <div>
                    <span className="text-muted-foreground">Parrain : </span>
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => {
                        if (parrain.id != null) onSelectMember(parrain.id);
                      }}
                    >
                      {parrain.prenom} {parrain.nom}
                    </button>
                  </div>
                ) : entry?.parrainLabel ? (
                  <div>
                    <span className="text-muted-foreground">Parrain : </span>
                    {entry.parrainLabel}
                  </div>
                ) : null}
                {contact.date_inscription_filleul ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
                    <span>
                      <span className="text-muted-foreground">Inscription : </span>
                      {formatCalendarDateFr(contact.date_inscription_filleul)}
                    </span>
                  </div>
                ) : null}
                {contact.date_invitation_filleul ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
                    <span>
                      <span className="text-muted-foreground">Invitation : </span>
                      {formatCalendarDateFr(contact.date_invitation_filleul)}
                    </span>
                  </div>
                ) : null}
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Historique volumes
                </h4>
                {editable ? (
                  <p className="text-[11px] text-muted-foreground">
                    Exercice en cours : volume perso modifiable
                    {managerObjectiveEligible ? " ; objectif Manager (Junior/Consultant)" : ""}.
                  </p>
                ) : null}
                {historyLoading ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Chargement…
                  </p>
                ) : volumeRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun volume enregistré. Saisissez l&apos;exercice en cours ou importez
                    l&apos;historique.
                  </p>
                ) : (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left font-medium py-1.5 pr-2">Exercice</th>
                          <th className="text-right font-medium py-1.5 px-1">Perso</th>
                          <th className="text-right font-medium py-1.5 px-1">Organisation</th>
                          {managerObjectiveEligible ? (
                            <th className="text-right font-medium py-1.5 pl-1">Manager</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {volumeRows.map((row) => {
                          const rowEditable = editable && row.isCurrent;
                          return (
                            <tr
                              key={row.exerciceLabel}
                              className={cn(
                                "border-b border-border/40",
                                row.isCurrent && "bg-primary/5"
                              )}
                            >
                              <td className="py-1.5 pr-2 tabular-nums">
                                {row.exerciceLabel}
                                {row.isCurrent ? (
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    (courant)
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-1.5 px-1 text-right tabular-nums">
                                {rowEditable ? (
                                  <Input
                                    key={`own-${contact.id}-${contact.filleul_volume ?? "empty"}`}
                                    className="h-8 w-full min-w-[5.5rem] ml-auto text-right tabular-nums"
                                    inputMode="decimal"
                                    placeholder="0"
                                    defaultValue={formatFilleulVolumeField(row.volumePropre)}
                                    onBlur={(e) => {
                                      const parsed = parseFilleulVolumeField(e.target.value);
                                      if (parsed == null || parsed === row.volumePropre) return;
                                      void onVolumeSave!(
                                        contact,
                                        parsed === 0 ? null : parsed
                                      );
                                    }}
                                  />
                                ) : (
                                  formatVolumeReadOnly(row.volumePropre)
                                )}
                              </td>
                              <td className="py-1.5 px-1 text-right tabular-nums">
                                {formatVolumeReadOnly(row.volumeBranche)}
                              </td>
                              {managerObjectiveEligible ? (
                                <td className="py-1.5 pl-1 text-right tabular-nums">
                                  {rowEditable ? (
                                    <Input
                                      key={`mgr-${contact.id}-${contact.filleul_volume_manager ?? "empty"}`}
                                      className="h-8 w-full min-w-[5.5rem] ml-auto text-right tabular-nums"
                                      inputMode="decimal"
                                      placeholder="0"
                                      defaultValue={formatFilleulVolumeField(
                                        row.volumeManager ?? 0
                                      )}
                                      onBlur={(e) => {
                                        const parsed = parseFilleulVolumeField(e.target.value);
                                        if (parsed == null || parsed === row.volumeManager) return;
                                        void onManagerVolumeSave!(
                                          contact,
                                          parsed === 0 ? null : parsed
                                        );
                                      }}
                                    />
                                  ) : (
                                    formatVolumeReadOnly(row.volumeManager)
                                  )}
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2.5">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
                  <p>
                    Notes dossier et dates de premières souscriptions arriveront ici — séparées
                    de la fiche contact.
                  </p>
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
