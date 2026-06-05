import { invoke } from "@tauri-apps/api/core";

/** Types de champ personnalisé supportés. */
export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select";

export interface CustomFieldDef {
  id: number;
  /** Entité concernée (`contact` en phase 1). */
  entity: string;
  /** Clé technique stable (slug du libellé). */
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  /** Choix possibles (JSON array de chaînes) pour `select`. */
  options: string | null;
  position: number;
  actif: boolean;
  created_at: number;
  updated_at: number;
}

export interface NewCustomFieldDef {
  entity?: string;
  label: string;
  field_type?: CustomFieldType;
  options?: string | null;
  position?: number;
  actif?: boolean;
}

export interface UpdateCustomFieldDef {
  label: string;
  field_type?: CustomFieldType;
  options?: string | null;
  position?: number;
  actif?: boolean;
}

/** Champ personnalisé d'un contact : définition + valeur courante. */
export interface ContactCustomField {
  def_id: number;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  options: string | null;
  position: number;
  value: string | null;
}

export interface CustomFieldValueInput {
  def_id: number;
  value: string | null;
}

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Texte",
  number: "Nombre",
  date: "Date",
  boolean: "Oui / Non",
  select: "Liste de choix",
};

export async function getCustomFieldDefs(
  entity = "contact"
): Promise<CustomFieldDef[]> {
  return invoke<CustomFieldDef[]>("get_custom_field_defs", { entity });
}

export async function createCustomFieldDef(
  def: NewCustomFieldDef
): Promise<CustomFieldDef> {
  return invoke<CustomFieldDef>("create_custom_field_def", { def });
}

export async function updateCustomFieldDef(
  id: number,
  def: UpdateCustomFieldDef
): Promise<CustomFieldDef> {
  return invoke<CustomFieldDef>("update_custom_field_def", { id, def });
}

export async function deleteCustomFieldDef(id: number): Promise<void> {
  return invoke<void>("delete_custom_field_def", { id });
}

export async function getContactCustomFields(
  contactId: number
): Promise<ContactCustomField[]> {
  return invoke<ContactCustomField[]>("get_contact_custom_fields", { contactId });
}

export async function setContactCustomFields(
  contactId: number,
  values: CustomFieldValueInput[]
): Promise<void> {
  return invoke<void>("set_contact_custom_fields", { contactId, values });
}

/** Parse la liste de choix JSON d'un champ `select`. */
export function parseSelectOptions(options: string | null): string[] {
  if (!options) return [];
  try {
    const parsed = JSON.parse(options) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
