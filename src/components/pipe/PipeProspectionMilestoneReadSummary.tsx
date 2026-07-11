import { useCallback, useEffect, useState } from "react";
import { Calendar, FileText, Phone, Send } from "lucide-react";
import { getContactById, type Contact } from "@/lib/api/tauri-contacts";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { formatTimelineOccurredAt } from "@/lib/pipe/pipe-timeline-types";
import {
  PIPE_TIMELINE_TYPE_LABELS,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";
import { formatPrescripteurLabel } from "@/lib/pipe/pipe-prospection-prefill";

const TYPE_ICONS = {
  APPEL: Phone,
  RDV: Calendar,
  NOTE: FileText,
  PROPOSITION: Send,
} as const;

interface PipeProspectionMilestoneReadSummaryProps {
  contactId: number;
  phaseEntries: PipeTimelineEntryRecord[];
}

export function PipeProspectionMilestoneReadSummary({
  contactId,
  phaseEntries,
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
        <dl className="grid gap-1.5 text-sm rounded-md border bg-background/50 px-3 py-2">
          {prescripteurLabel && (
            <div className="flex gap-2">
              <dt className="shrink-0 text-muted-foreground">Prescripteur</dt>
              <dd className="font-medium">{prescripteurLabel}</dd>
            </div>
          )}
          {source && (
            <div className="flex gap-2">
              <dt className="shrink-0 text-muted-foreground">Source</dt>
              <dd>{source}</dd>
            </div>
          )}
        </dl>
      )}

      {phaseEntries.length > 0 && (
        <ul className="m-0 list-none space-y-1.5 p-0">
          {phaseEntries.map((entry) => {
            const Icon =
              entry.entry_type in TYPE_ICONS
                ? TYPE_ICONS[entry.entry_type as keyof typeof TYPE_ICONS]
                : null;
            const typeLabel =
              PIPE_TIMELINE_TYPE_LABELS[entry.entry_type as PipeTimelineUserType] ??
              entry.entry_type;
            const detail = entry.contenu?.trim() || entry.titre?.trim();
            return (
              <li
                key={entry.id}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
                {Icon && <Icon className="mt-0.5 h-3 w-3 shrink-0" />}
                <span className="min-w-0">
                  <span className="font-medium text-foreground/80">{typeLabel}</span>
                  {" · "}
                  <time>{formatTimelineOccurredAt(entry.occurred_at)}</time>
                  {detail ? (
                    <span className="block text-sm text-foreground/90 mt-0.5 whitespace-pre-wrap">
                      {detail}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
