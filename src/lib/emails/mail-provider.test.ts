import { describe, expect, it } from "vitest";
import { canReadMailbox, mailProviderLabel, supportsCampaignReplySync } from "./mail-provider";

describe("mail-provider", () => {
  it("labels each connected mailbox kind", () => {
    expect(mailProviderLabel("google")).toBe("Google");
    expect(mailProviderLabel("microsoft")).toBe("Microsoft");
    expect(mailProviderLabel("imap")).toBe("Messagerie");
    expect(mailProviderLabel(null)).toBeNull();
  });

  it("enables reply sync for Gmail, Outlook and IMAP mailboxes", () => {
    expect(supportsCampaignReplySync("google")).toBe(true);
    expect(supportsCampaignReplySync("microsoft")).toBe(true);
    expect(supportsCampaignReplySync("imap")).toBe(true);
    expect(supportsCampaignReplySync(null)).toBe(false);
  });

  it("reads Gmail, Outlook and IMAP mailboxes for scans and history", () => {
    for (const p of ["google", "microsoft", "imap"]) expect(canReadMailbox(p)).toBe(true);
    expect(canReadMailbox(null)).toBe(false);
    expect(canReadMailbox("other")).toBe(false);
  });
});
