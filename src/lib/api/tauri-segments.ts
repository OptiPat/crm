import { invoke } from "@tauri-apps/api/core";

export interface Segment {
  id: number;
  nom: string;
  description: string | null;
  rule_json: string;
  actif: boolean;
  is_system: boolean;
  created_at: number;
  updated_at: number;
}

export interface SegmentWithCount extends Segment {
  contact_count: number;
}

export interface NewSegment {
  nom: string;
  description?: string | null;
  rule_json: string;
  actif?: boolean;
}

export async function getAllSegments(): Promise<Segment[]> {
  return invoke<Segment[]>("get_all_segments");
}

export async function getAllSegmentsWithCount(): Promise<SegmentWithCount[]> {
  return invoke<SegmentWithCount[]>("get_all_segments_with_count");
}

export async function createSegment(segment: NewSegment): Promise<Segment> {
  return invoke<Segment>("create_segment", { segment });
}

export async function updateSegment(id: number, segment: NewSegment): Promise<Segment> {
  return invoke<Segment>("update_segment", { id, segment });
}

export async function deleteSegment(id: number): Promise<void> {
  return invoke<void>("delete_segment", { id });
}

export async function previewSegmentRuleCount(ruleJson: string): Promise<number> {
  return invoke<number>("preview_segment_rule_count", { ruleJson });
}

export async function getContactsMatchingRuleJson(
  ruleJson: string
): Promise<import("@/lib/api/tauri-contacts").Contact[]> {
  return invoke<import("@/lib/api/tauri-contacts").Contact[]>(
    "get_contacts_matching_rule_json",
    { ruleJson }
  );
}

export async function evaluateSegmentForContact(
  segmentId: number,
  contactId: number
): Promise<boolean> {
  return invoke<boolean>("evaluate_segment_for_contact", { segmentId, contactId });
}

export async function getContactsMatchingSegment(segmentId: number) {
  return invoke<import("@/lib/api/tauri-contacts").Contact[]>("get_contacts_matching_segment", {
    segmentId,
  });
}

export type AutoEtiquetteLogEntry = {
  etiquetteId: number;
  etiquetteNom: string;
  matched: boolean;
  reason: string;
  evaluatedAt: number;
};

export async function getContactAutoEtiquetteLog(
  contactId: number,
  limit = 20
): Promise<AutoEtiquetteLogEntry[]> {
  const rows = await invoke<[number, string, boolean, string, number][]>(
    "get_contact_auto_etiquette_log",
    { contactId, limit }
  );
  return rows.map(([etiquetteId, etiquetteNom, matched, reason, evaluatedAt]) => ({
    etiquetteId,
    etiquetteNom,
    matched,
    reason,
    evaluatedAt,
  }));
}
