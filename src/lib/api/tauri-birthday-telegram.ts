import { invoke } from "@tauri-apps/api/core";

export interface BirthdayTelegramSettings {
  enabled: boolean;
  chatId: string;
  botTokenConfigured: boolean;
}

export interface BirthdayContactToday {
  id: number;
  prenom: string;
  nom: string;
  displayName: string;
  civilite?: string | null;
  categorie: string;
  registre: string;
  age?: number | null;
  birthDate: string;
  telephone?: string | null;
}

export async function getBirthdayTelegramSettings(): Promise<BirthdayTelegramSettings> {
  return invoke<BirthdayTelegramSettings>("get_birthday_telegram_settings_cmd");
}

export async function saveBirthdayTelegramSettings(
  enabled: boolean,
  chatId: string,
  botToken?: string
): Promise<BirthdayTelegramSettings> {
  return invoke<BirthdayTelegramSettings>("save_birthday_telegram_settings_cmd", {
    enabled,
    chatId,
    botToken: botToken ?? null,
  });
}

export interface BirthdayRunResult {
  contactsCount: number;
  messagesSent: number;
  skippedAlreadyRan: boolean;
}

export async function sendBirthdayTelegramRemindersNow(): Promise<BirthdayRunResult> {
  return invoke<BirthdayRunResult>("send_birthday_telegram_reminders_now_cmd");
}

export async function testBirthdayTelegram(): Promise<void> {
  return invoke<void>("test_birthday_telegram_cmd");
}

export async function listBirthdaysToday(): Promise<BirthdayContactToday[]> {
  return invoke<BirthdayContactToday[]>("list_birthdays_today_cmd");
}

export interface BirthdayMessageDraft {
  contactId: number;
  message: string;
}

export interface BirthdayMessageProfileBodies {
  tuM: string[];
  tuF: string[];
  tuN: string[];
  vousM: string[];
  vousF: string[];
  vousN: string[];
}

export interface BirthdayMessageSettings {
  useCustom: boolean;
  bodiesTu: string[];
  bodiesVous: string[];
  profile: BirthdayMessageProfileBodies;
}

export interface BirthdayBuiltinBodies {
  profile: BirthdayMessageProfileBodies;
}

export async function getBirthdayBuiltinBodies(): Promise<BirthdayBuiltinBodies> {
  return invoke<BirthdayBuiltinBodies>("get_birthday_builtin_bodies_cmd");
}

export async function getBirthdayMessageSettings(): Promise<BirthdayMessageSettings> {
  return invoke<BirthdayMessageSettings>("get_birthday_message_settings_cmd");
}

export async function saveBirthdayMessageSettings(
  settings: BirthdayMessageSettings
): Promise<BirthdayMessageSettings> {
  return invoke<BirthdayMessageSettings>("save_birthday_message_settings_cmd", {
    settings,
  });
}

export async function generateBirthdayMessageDraft(
  contactId: number
): Promise<BirthdayMessageDraft> {
  return invoke<BirthdayMessageDraft>("generate_birthday_message_draft_cmd", { contactId });
}

/** Envoie les rappels Telegram pour les nouveaux anniversaires du jour (sans doublon). */
export async function runBirthdayTelegramIfDue(): Promise<BirthdayRunResult> {
  return invoke<BirthdayRunResult>("run_birthday_telegram_if_due_cmd");
}
