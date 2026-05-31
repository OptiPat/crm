import { describe, expect, it } from "vitest";
import { groupContactGmailMessages } from "./gmail-history-group";
import type { ContactGmailMessage } from "@/lib/api/tauri-contact-gmail";

function msg(sentAt: number): ContactGmailMessage {
  return {
    id: 1,
    contact_id: 1,
    gmail_message_id: "a",
    gmail_thread_id: null,
    direction: "inbound",
    subject: "Test",
    snippet: null,
    body_text: null,
    sent_at: sentAt,
    synced_at: sentAt,
  };
}

describe("groupContactGmailMessages", () => {
  it("regroupe par année puis mois décroissants", () => {
    const jan2024 = Math.floor(new Date("2024-01-15").getTime() / 1000);
    const mar2024 = Math.floor(new Date("2024-03-10").getTime() / 1000);
    const feb2023 = Math.floor(new Date("2023-02-01").getTime() / 1000);
    const groups = groupContactGmailMessages([msg(feb2023), msg(mar2024), msg(jan2024)]);
    expect(groups.map((g) => g.year)).toEqual([2024, 2023]);
    expect(groups[0].months.map((m) => m.label)).toEqual(["Mars", "Janvier"]);
  });
});
