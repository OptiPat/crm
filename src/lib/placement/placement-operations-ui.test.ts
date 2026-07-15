import { describe, expect, it } from "vitest";
import {
  isPlacementRowVisibleInSuivi,
  placementOperationDisplayStatusLabel,
  placementOperationIsAwaitingPartner,
  placementOperationIsClosed,
  placementOperationIsDeclaredInWorkflow,
  placementOperationIsDetachedSuiviDraft,
  placementOperationIsPipeTracked,
  placementOperationIsUndeclared,
} from "@/lib/placement/placement-operations-ui";

describe("placement-operations-ui pipe tracking", () => {
  it("pipe_timeline_entry_id requis pour suivi email client", () => {
    expect(placementOperationIsPipeTracked({ pipe_timeline_entry_id: 12 })).toBe(true);
    expect(placementOperationIsPipeTracked({ pipe_timeline_entry_id: null })).toBe(false);
  });

  it("CONFORME sans journal pipe masqué du suivi email", () => {
    expect(
      isPlacementRowVisibleInSuivi({
        status: "CONFORME",
        client_notified_at: null,
        pipe_timeline_entry_id: null,
        dismissed_at: null,
      })
    ).toBe(false);
    expect(
      isPlacementRowVisibleInSuivi({
        status: "CONFORME",
        client_notified_at: null,
        pipe_timeline_entry_id: 5,
        dismissed_at: null,
      })
    ).toBe(true);
  });

  it("NON_CONFORME reste visible même non déclaré", () => {
    expect(
      isPlacementRowVisibleInSuivi({
        status: "NON_CONFORME",
        client_notified_at: null,
        pipe_timeline_entry_id: null,
        dismissed_at: null,
        pipe_id: null,
        email_received_at: 50,
        gmail_message_id: "msg-1",
      })
    ).toBe(true);
  });

  it("PENDING scan orphelin masqué du suivi", () => {
    expect(
      isPlacementRowVisibleInSuivi({
        status: "PENDING",
        client_notified_at: null,
        pipe_timeline_entry_id: null,
        dismissed_at: null,
        pipe_id: null,
        email_received_at: null,
        gmail_message_id: "msg-scan",
      })
    ).toBe(false);
    expect(
      isPlacementRowVisibleInSuivi({
        status: "PENDING",
        client_notified_at: null,
        pipe_timeline_entry_id: null,
        dismissed_at: null,
        pipe_id: 3,
        email_received_at: null,
        gmail_message_id: null,
      })
    ).toBe(true);
  });

  it("déclaré = pipe_id ou journal timeline", () => {
    expect(placementOperationIsDeclaredInWorkflow({ pipe_id: 3, pipe_timeline_entry_id: null })).toBe(
      true
    );
    expect(
      placementOperationIsDeclaredInWorkflow({ pipe_id: null, pipe_timeline_entry_id: 5 })
    ).toBe(true);
    expect(
      placementOperationIsDeclaredInWorkflow({ pipe_id: null, pipe_timeline_entry_id: null })
    ).toBe(false);
  });

  it("brouillon détaché masqué du suivi", () => {
    expect(
      placementOperationIsDetachedSuiviDraft({
        status: "PENDING",
        pipe_id: null,
        pipe_timeline_entry_id: null,
        email_received_at: null,
        gmail_message_id: null,
        dismissed_at: null,
      })
    ).toBe(true);
    expect(
      isPlacementRowVisibleInSuivi({
        status: "PENDING",
        client_notified_at: null,
        pipe_timeline_entry_id: null,
        dismissed_at: null,
        pipe_id: null,
        email_received_at: null,
        gmail_message_id: null,
      })
    ).toBe(false);
  });

  it("dismissed PENDING masqué du suivi actif", () => {
    expect(
      isPlacementRowVisibleInSuivi({
        status: "PENDING",
        client_notified_at: null,
        pipe_timeline_entry_id: null,
        dismissed_at: 100,
        pipe_id: 3,
        email_received_at: null,
        gmail_message_id: null,
      })
    ).toBe(false);
  });

  it("non déclaré = pas de journal timeline", () => {
    expect(placementOperationIsUndeclared({ pipe_timeline_entry_id: null })).toBe(true);
    expect(placementOperationIsUndeclared({ pipe_timeline_entry_id: 9 })).toBe(false);
  });

  it("en attente partenaire = PENDING avec journal timeline", () => {
    expect(
      placementOperationIsAwaitingPartner({
        status: "PENDING",
        pipe_timeline_entry_id: 9,
      })
    ).toBe(true);
    expect(
      placementOperationIsAwaitingPartner({
        status: "PENDING",
        pipe_timeline_entry_id: null,
      })
    ).toBe(false);
  });

  it("libellé affiché : non déclarée Box avant confirmation Stellium", () => {
    expect(
      placementOperationDisplayStatusLabel({
        status: "PENDING",
        pipe_timeline_entry_id: null,
        client_notified_at: null,
      })
    ).toBe("Non déclarée Box");
    expect(
      placementOperationDisplayStatusLabel({
        status: "PENDING",
        pipe_timeline_entry_id: 5,
        client_notified_at: null,
      })
    ).toBe("En attente partenaire");
  });

  it("clôturé = dismiss uniquement (sauf NC)", () => {
    expect(
      placementOperationIsClosed({
        status: "CONFORME",
        client_notified_at: 50,
        dismissed_at: null,
      })
    ).toBe(false);
    expect(
      placementOperationIsClosed({
        status: "PENDING",
        client_notified_at: null,
        dismissed_at: 10,
      })
    ).toBe(true);
    expect(
      placementOperationIsClosed({
        status: "NON_CONFORME",
        client_notified_at: null,
        dismissed_at: 10,
      })
    ).toBe(false);
  });
});
