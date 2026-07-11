import { getContactById } from "@/lib/api/tauri-contacts";
import { listPipeTimelineEntries } from "@/lib/api/tauri-pipe-timeline";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { getProspectionPhaseUserEntries } from "@/lib/pipe/pipe-prospection-phase";
import type { PipeTimelineDisplayContext } from "@/lib/pipe/pipe-timeline-display";
import {
  PIPE_TIMELINE_TYPE_LABELS,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";

export interface ProspectionToR1PrefillInput {
  pipeNotes?: string | null;
  sourceLead?: string | null;
  prescripteurLabel?: string | null;
  timelineEntries: PipeTimelineEntryRecord[];
  pipeType?: string;
}

export function formatPrescripteurLabel(
  nom?: string | null,
  prenom?: string | null
): string | null {
  const parts = [prenom?.trim(), nom?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function buildProspectionToR1Prefill(input: ProspectionToR1PrefillInput): string {
  const context: PipeTimelineDisplayContext = { pipeType: input.pipeType ?? "AFFAIRE" };
  const phaseEntries = getProspectionPhaseUserEntries(input.timelineEntries, context);
  const lines: string[] = [];

  const source = input.sourceLead?.trim();
  if (source) lines.push(`Source : ${source}`);

  const prescripteur = input.prescripteurLabel?.trim();
  if (prescripteur) lines.push(`Prescripteur : ${prescripteur}`);

  const notes = input.pipeNotes?.trim();
  if (notes) {
    if (lines.length > 0) lines.push("");
    lines.push(notes);
  }

  const lastActivity = [...phaseEntries]
    .filter((e) => e.entry_type === "APPEL" || e.entry_type === "RDV" || e.entry_type === "NOTE")
    .sort((a, b) => b.occurred_at - a.occurred_at || b.id - a.id)[0];

  if (lastActivity) {
    const typeLabel =
      PIPE_TIMELINE_TYPE_LABELS[lastActivity.entry_type as PipeTimelineUserType] ??
      lastActivity.entry_type;
    const detail = lastActivity.contenu?.trim() || lastActivity.titre?.trim() || "";
    if (detail) {
      if (lines.length > 0) lines.push("");
      lines.push(`Dernier ${typeLabel.toLowerCase()} : ${detail}`);
    }
  }

  return lines.join("\n").trim();
}

export async function loadProspectionToR1Prefill(
  pipe: Pick<PipeRecord, "id" | "contact_id" | "notes" | "pipe_type">
): Promise<string> {
  const entries = await listPipeTimelineEntries(pipe.id);

  if (pipe.contact_id <= 0) {
    return buildProspectionToR1Prefill({
      pipeNotes: pipe.notes,
      timelineEntries: entries,
      pipeType: pipe.pipe_type,
    });
  }

  const contact = await getContactById(pipe.contact_id);

  let prescripteurLabel: string | undefined;
  if (contact.prescripteur_id) {
    try {
      const prescripteur = await getContactById(contact.prescripteur_id);
      prescripteurLabel =
        formatPrescripteurLabel(prescripteur.nom, prescripteur.prenom) ?? undefined;
    } catch {
      prescripteurLabel = undefined;
    }
  }

  return buildProspectionToR1Prefill({
    pipeNotes: pipe.notes,
    sourceLead: contact.source_lead,
    prescripteurLabel,
    timelineEntries: entries,
    pipeType: pipe.pipe_type,
  });
}
