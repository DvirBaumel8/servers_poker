import { describe, it, expect, vi, beforeEach } from "vitest";
import { TournamentAlertService } from "../../../src/modules/tournaments/tournament-alert.service";

describe("TournamentAlertService", () => {
  let alertService: TournamentAlertService;
  let mockEmailService: { sendEmail: ReturnType<typeof vi.fn> };
  let mockConfigService: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockEmailService = { sendEmail: vi.fn().mockResolvedValue(true) };
    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === "TOURNAMENT_ALERT_EMAIL") return "admin@test.com";
        if (key === "SUPPORT_ADMIN_EMAIL") return null;
        return null;
      }),
    };
    alertService = new TournamentAlertService(
      mockEmailService as any,
      mockConfigService as any,
    );
  });

  it("sends email with tournament error details", async () => {
    const error = new Error("Payout write failed");
    error.stack = "Error: Payout write failed\n    at finishTournament";

    await alertService.sendTournamentErrorAlert(
      "t-123-456-789",
      "Daily Master",
      error,
    );

    expect(mockEmailService.sendEmail).toHaveBeenCalledOnce();
    const call = mockEmailService.sendEmail.mock.calls[0][0];
    expect(call.to).toBe("admin@test.com");
    expect(call.subject).toContain("[TOURNAMENT ERROR]");
    expect(call.subject).toContain("Daily Master");
    expect(call.subject).toContain("t-123-45");
    expect(call.text).toContain("Payout write failed");
    expect(call.text).toContain("t-123-456-789");
    expect(call.html).toContain("Payout write failed");
  });

  it("falls back to SUPPORT_ADMIN_EMAIL when TOURNAMENT_ALERT_EMAIL is not set", async () => {
    mockConfigService.get = vi.fn((key: string) => {
      if (key === "TOURNAMENT_ALERT_EMAIL") return undefined;
      if (key === "SUPPORT_ADMIN_EMAIL") return "support@test.com";
      return null;
    });

    await alertService.sendTournamentErrorAlert(
      "t-1",
      "Test",
      new Error("fail"),
    );

    expect(mockEmailService.sendEmail).toHaveBeenCalledOnce();
    expect(mockEmailService.sendEmail.mock.calls[0][0].to).toBe(
      "support@test.com",
    );
  });

  it("logs warning and skips email when no alert email is configured", async () => {
    mockConfigService.get = vi.fn(() => undefined);

    await alertService.sendTournamentErrorAlert(
      "t-1",
      "Test",
      new Error("fail"),
    );

    expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("never throws even when email service fails", async () => {
    mockEmailService.sendEmail.mockRejectedValue(new Error("SMTP down"));

    await expect(
      alertService.sendTournamentErrorAlert("t-1", "Test", new Error("fail")),
    ).resolves.toBeUndefined();
  });

  it("handles error without stack trace gracefully", async () => {
    const error = new Error("no stack");
    error.stack = undefined;

    await alertService.sendTournamentErrorAlert("t-1", "Test", error);

    const call = mockEmailService.sendEmail.mock.calls[0][0];
    expect(call.text).toContain("(no stack)");
  });
});
