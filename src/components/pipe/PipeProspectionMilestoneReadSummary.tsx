import { useCallback, useEffect, useState } from "react";
import { PipeTimelinePhaseEntryRow } from "@/components/pipe/PipeTimelinePhaseEntryRow";
import { getContactById, type Contact } from "@/lib/api/tauri-contacts";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { formatPrescripteurLabel } from "@/lib/pipe/pipe-prospection-prefill";

interface PipeProspectionMilestoneReadSummaryProps {
  contactId: number;
  phaseEntries: PipeTimelineEntryRecord[];
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  timeline?: ReturnType<typeof usePipeTimeline>;
}

export function PipeProspectionMilestoneReadSummary({
  contactId,
  phaseEntries,
  pipe,
  timeline,
}: PipeProspectionMilestoneReadSummaryProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [prescripteur, setPrescripteur] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loadedContact = await getContactById(contactId);
      setContact(loadedContact);
      if (loadedContact.prescripteur_id) {
        setPrescripteur(await getContactById(loadedContact.prescripteur_id));
      } else {
        setPrescripteur(null);
      }
    } catch {
      setContact(null);
      setPrescripteur(null);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-xs text-muted-foreground">Chargement prospection…</p>;
  }

  const source = contact?.source_lead?.trim();
  const prescripteurLabel = prescripteur
    ? formatPrescripteurLabel(prescripteur.nom, prescripteur.prenom)
    : null;

  const hasMeta = Boolean(source || prescripteurLabel);

  return (
    <div className="space-y-2">
      {hasMeta && (
        <dl className="flex flex-col gap-0.5 text-[11px] leading-snug text-muted-foreground">
          {prescripteurLabel && (
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
              <dt className="shrink-0">Prescripteur</dt>
              <dd className="text-foreground/70">{prescripteurLabel}</dd>
            </div>
          )}
          {source && (
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
              <dt className="shrink-0">Source</dt>
              <dd className="text-foreground/70">{source}</dd>
            </div>
          )}
        </dl>
      )}

      {phaseEntries.length > 0 &&
        (timeline ? (
          <ul className="space-y-2 m-0 list-none p-0">
            {phaseEntries.map((entry) => (
              <PipeTimelinePhaseEntryRow
                key={entry.id}
                entry={entry}
                allEntries={timeline.entries}
                pipe={pipe}
                timeline={timeline}
              />
            ))}
          </ul>
        ) : null)}
    </div>
  );
}
