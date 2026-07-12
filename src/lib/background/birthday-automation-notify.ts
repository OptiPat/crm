import type { BirthdayContactToday } from "@/lib/api/tauri-birthday-telegram";

const STORAGE_KEY = "crm_birthday_notif_date";

function todayLocalIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function birthdayNotificationsAlreadySentToday(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === todayLocalIso();
  } catch {
    return false;
  }
}

export function markBirthdayNotificationsSentToday(): void {
  try {
    localStorage.setItem(STORAGE_KEY, todayLocalIso());
  } catch {
    /* ignore quota / private mode */
  }
}

export function formatBirthdayNotification(contacts: BirthdayContactToday[]): {
  title: string;
  body: string;
} | null {
  if (contacts.length === 0) return null;
  if (contacts.length === 1) {
    const c = contacts[0]!;
    const age =
      c.age != null && c.age > 0 ? ` (${c.age} ans)` : "";
    return {
      title: "CRM W.Y.S — Anniversaire",
      body: `Anniversaire de ${c.displayName}${age} aujourd'hui.`,
    };
  }
  const names = contacts
    .slice(0, 4)
    .map((c) => c.displayName)
    .join(", ");
  const extra = contacts.length > 4 ? ` (+${contacts.length - 4})` : "";
  return {
    title: "CRM W.Y.S — Anniversaires",
    body: `Anniversaires aujourd'hui : ${names}${extra}.`,
  };
}

export function resetBirthdayNotificationStateForTests(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
