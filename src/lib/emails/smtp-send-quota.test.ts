import { describe, expect, it, vi } from "vitest";
import {
  isSmtpQuotaError,
  sendWithSmtpQuotaRetry,
  smtpPauseLabel,
  waitForSmtpSendSlot,
} from "./smtp-send-quota";
import type { SmtpSendQuota } from "@/lib/api/tauri-email-oauth";

function quota(batch_wait_seconds: number, applies = true): SmtpSendQuota {
  return {
    applies,
    hourly_limit: 150,
    sent_last_hour: 135,
    wait_seconds: 0,
    batch_wait_seconds,
  };
}

const QUOTA_ERROR = new Error(
  "Limite d'envoi atteinte (150 emails par heure). Prochain envoi possible vers 15 h 40."
);

describe("waitForSmtpSendSlot", () => {
  it("returns at once when no wait or not an SMTP mailbox", async () => {
    const onPause = vi.fn();
    expect(await waitForSmtpSendSlot({ getQuota: async () => quota(0), onPause })).toBe("ok");
    expect(
      await waitForSmtpSendSlot({ getQuota: async () => quota(600, false), onPause })
    ).toBe("ok");
    expect(onPause).not.toHaveBeenCalled();
  });

  it("pauses on the batch threshold until a slot frees, then reports the resume", async () => {
    vi.useFakeTimers();
    const getQuota = vi
      .fn<() => Promise<SmtpSendQuota>>()
      .mockResolvedValueOnce(quota(45))
      .mockResolvedValueOnce(quota(15))
      .mockResolvedValue(quota(0));
    const onPause = vi.fn();
    const done = waitForSmtpSendSlot({ getQuota, onPause, now: () => 1_000_000 });
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await done).toBe("ok");
    vi.useRealTimers();
    expect(getQuota).toHaveBeenCalledTimes(3);
    expect(onPause).toHaveBeenNthCalledWith(1, 1_000_000 + 45_000);
    expect(onPause).toHaveBeenNthCalledWith(2, 1_000_000 + 15_000);
    expect(onPause).toHaveBeenLastCalledWith(null);
  });

  it("stops waiting when the send is aborted", async () => {
    const controller = new AbortController();
    const onPause = vi.fn();
    const done = waitForSmtpSendSlot({
      getQuota: async () => quota(3600),
      onPause,
      signal: controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await done;
    expect(onPause).toHaveBeenLastCalledWith(null);
  });

  it("does not block when the quota cannot be read before any pause", async () => {
    expect(
      await waitForSmtpSendSlot({ getQuota: () => Promise.reject(new Error("ipc")) })
    ).toBe("ok");
  });

  it("reports an interruption when the session locks during a pause", async () => {
    vi.useFakeTimers();
    const getQuota = vi
      .fn<() => Promise<SmtpSendQuota>>()
      .mockResolvedValueOnce(quota(600))
      .mockRejectedValue(new Error("Session verrouillée"));
    const done = waitForSmtpSendSlot({ getQuota });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await done).toBe("interrupted");
    vi.useRealTimers();
  });
});

describe("sendWithSmtpQuotaRetry", () => {
  it("waits and resends the same email after a quota refusal", async () => {
    const send = vi.fn().mockRejectedValueOnce(QUOTA_ERROR).mockResolvedValue("sent");
    const result = await sendWithSmtpQuotaRetry(send, { getQuota: async () => quota(0) });
    expect(result).toBe("sent");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Adresse invalide"));
    await expect(
      sendWithSmtpQuotaRetry(send, { getQuota: async () => quota(0) })
    ).rejects.toThrow("Adresse invalide");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("gives up after a few quota refusals", async () => {
    const send = vi.fn().mockRejectedValue(QUOTA_ERROR);
    await expect(
      sendWithSmtpQuotaRetry(send, { getQuota: async () => quota(0) })
    ).rejects.toThrow("Limite d'envoi atteinte");
    expect(send).toHaveBeenCalledTimes(4);
  });
});

describe("labels", () => {
  it("formats the local resume time", () => {
    const at = new Date(2026, 10, 3, 15, 4).getTime();
    expect(smtpPauseLabel(at)).toContain("15 h 04");
  });

  it("recognizes the Rust quota refusal", () => {
    expect(isSmtpQuotaError(QUOTA_ERROR)).toBe(true);
    expect(isSmtpQuotaError("Envoi via pro2.mail.ovh.net impossible")).toBe(false);
  });
});
