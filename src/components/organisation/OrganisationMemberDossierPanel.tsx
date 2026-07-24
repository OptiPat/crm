import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Network,
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
import { OrganisationMemberDossierNetworkSection } from "@/components/organisation/OrganisationMemberDossierNetworkSection";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { emptyFilleulDossier } from "@/lib/organisation/organisation-filleul-dossier";
import { FilleulRankBadges } from "@/components/organisation/FilleulRankBadges";
import { FilleulRankEditor } from "@/components/organisation/FilleulRankEditor";
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
import { preventStackedSheetOutsideDismiss } from "@/lib/ui/radix-outside-interaction";
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
  onFocusInTree?: (contactId: number) => void;
  dossier?: FilleulDossier | null;
  onDossierChange?: (dossier: FilleulDossier) => void;
  onNetworkDataChange?: () => void;
  onVolumeSave?: (contact: Contact, volume: number | null) => void | Promise<void>;
  onManagerVolumeSave?: (contact: Contact, volume: number | null) => void | Promise<void>;
  onRankSave?: (
    contact: Contact,
    ranks: { filleul_titre?: string | null; filleul_qualification?: string | null }
  ) => void | Promise<void>;
  /** Fiche contact ouverte par-dessus — évite la fermeture accidentelle du dossier. */
  stackedContactOpen?: boolean;
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
  onFocusInTree,
  dossier,
  onDossierChange,
  onNetworkDataChange,
  onVolumeSave,
  onManagerVolumeSave,
  onRankSave,
  stackedContactOpen = false,
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

  const resolvedDossier =
    contactId != null ? (dossier ?? emptyFilleulDossier(contactId)) : null;

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
      modal={false}
    >
      <SheetContent
        side="right"
        hideOverlay
        className="z-50 flex h-svh max-h-svh min-h-0 w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl"
        onInteractOutside={(event) => {
          if (stackedContactOpen) preventStackedSheetOutsideDismiss(event);
        }}
        onEscapeKeyDown={(event) => {
          if (stackedContactOpen) event.preventDefault();
        }}
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
              <div className="flex flex-wrap gap-2">
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
                {onFocusInTree ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 w-fit"
                    onClick={() => onFocusInTree(contactId!)}
                  >
                    <Network className="h-3.5 w-3.5" aria-hidden />
                    Voir dans la carte
                  </Button>
                ) : null}
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
              {onRankSave && isOrganisationActifFilleul(contact) ? (
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Titre et qualification
                  </h4>
                  <FilleulRankEditor contact={contact} onSave={onRankSave} variant="panel" />
                </section>
              ) : null}

              {resolvedDossier && contactId != null ? (
                <OrganisationMemberDossierNetworkSection
                  contact={contact}
                  contacts={contacts}
                  dossier={resolvedDossier}
                  canEdit
                  onDossierChange={(next) => onDossierChange?.(next)}
                  onParrainChange={onNetworkDataChange}
                  onSelectMember={onSelectMember}
                />
              ) : null}

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
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
