import type { ContactGmailMessage } from "@/lib/api/tauri-contact-gmail";

export interface MailboxThreadGroup {
  threadId: string;
  messages: ContactGmailMessage[];
  latest: ContactGmailMessage;
  sortDate: number;
}

export function groupMailboxMessagesByThread(
  messages: ContactGmailMessage[]
): MailboxThreadGroup[] {
  const map = new Map<string, ContactGmailMessage[]>();
  for (const msg of messages) {
    const tid = msg.gmail_thread_id?.trim() || `solo-${msg.id}`;
    const list = map.get(tid) ?? [];
    list.push(msg);
    map.set(tid, list);
  }
  return [...map.entries()]
    .map(([threadId, msgs]) => {
      const sorted = [...msgs].sort((a, b) => b.sent_at - a.sent_at);
      const latest = sorted[0]!;
      return {
        threadId,
        messages: sorted,
        latest,
        sortDate: latest.sent_at,
      };
    })
    .sort((a, b) => b.sortDate - a.sortDate);
}
