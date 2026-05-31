import { describe, expect, it } from "vitest";
import { groupRelationTimelineByYearMonth } from "./relation-timeline-groups";
import type { ContactRelationTimelineItem } from "./contact-relation-timeline";

describe("groupRelationTimelineByYearMonth", () => {
  it("regroupe CRM et boîte mail par année puis mois", () => {
    const jan2024 = Math.floor(new Date("2024-01-10").getTime() / 1000);
    const mar2024 = Math.floor(new Date("2024-03-05").getTime() / 1000);
    const items: ContactRelationTimelineItem[] = [
      {
        kind: "manual",
        interaction: {
          id: 1,
          contact_id: 1,
          type_interaction: "APPEL",
          date_interaction: mar2024,
          created_at: mar2024,
        },
        key: "m1",
        sort_date: mar2024,
      },
      {
        kind: "mailbox_thread",
        threadId: "t1",
        messages: [],
        latest: {
          id: 2,
          contact_id: 1,
          gmail_message_id: "g1",
          gmail_thread_id: "t1",
          direction: "inbound",
          subject: "Hi",
          snippet: null,
          body_text: null,
          body_fetched: false,
          provider: "google",
          attachments_json: null,
          sent_at: jan2024,
          synced_at: jan2024,
        },
        key: "t1",
        sort_date: jan2024,
      },
    ];
    const groups = groupRelationTimelineByYearMonth(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].year).toBe(2024);
    expect(groups[0].months.map((m) => m.label)).toEqual(["Mars", "Janvier"]);
  });
});
