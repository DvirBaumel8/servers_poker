import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupportService } from "../../../src/modules/support/support.service";
import { NOTIFICATION_PROVIDER } from "../../../src/modules/support/notification/notification.provider";

const mockTicketRepo = {
  createTicket: vi.fn(),
};

const mockNotificationProvider = {
  notify: vi.fn(),
};

function createService(): SupportService {
  return new SupportService(
    mockTicketRepo as any,
    mockNotificationProvider as any,
  );
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    user: undefined,
    headers: {
      "user-agent": "Mozilla/5.0 (test)",
      referer: "http://localhost:5173/games/abc",
    },
    ...overrides,
  } as any;
}

const baseDto = {
  email: "player@example.com",
  subject: "Something went wrong",
  message: "This is a detailed description of the issue I encountered.",
};

describe("SupportService", () => {
  let service: SupportService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
    mockTicketRepo.createTicket.mockResolvedValue({
      id: "ticket-uuid",
      user_id: null,
      email: baseDto.email,
      subject: baseDto.subject,
      message: baseDto.message,
      status: "open",
      metadata: {},
    });
    mockNotificationProvider.notify.mockResolvedValue(undefined);
  });

  it("saves ticket to repository", async () => {
    const req = makeRequest();
    await service.submitTicket(baseDto, req);

    expect(mockTicketRepo.createTicket).toHaveBeenCalledOnce();
    const args = mockTicketRepo.createTicket.mock.calls[0][0];
    expect(args.email).toBe(baseDto.email);
    expect(args.subject).toBe(baseDto.subject);
    expect(args.message).toBe(baseDto.message);
  });

  it("returns the saved ticket", async () => {
    const req = makeRequest();
    const result = await service.submitTicket(baseDto, req);

    expect(result.id).toBe("ticket-uuid");
    expect(result.status).toBe("open");
  });

  it("calls notificationProvider.notify with the saved ticket", async () => {
    const req = makeRequest();
    await service.submitTicket(baseDto, req);

    // notify is fire-and-forget — wait a tick for the promise to resolve
    await new Promise((r) => setTimeout(r, 0));

    expect(mockNotificationProvider.notify).toHaveBeenCalledOnce();
    expect(mockNotificationProvider.notify.mock.calls[0][0].id).toBe(
      "ticket-uuid",
    );
  });

  it("still returns ticket when notification throws a 5xx error", async () => {
    const err = Object.assign(new Error("SMTP server error"), {
      responseCode: 500,
    });
    mockNotificationProvider.notify.mockRejectedValue(err);

    const req = makeRequest();
    const result = await service.submitTicket(baseDto, req);

    expect(result.id).toBe("ticket-uuid");
    // allow fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 0));
  });

  it("still returns ticket when notification throws a 4xx error", async () => {
    const err = Object.assign(new Error("Bad address"), { responseCode: 421 });
    mockNotificationProvider.notify.mockRejectedValue(err);

    const req = makeRequest();
    const result = await service.submitTicket(baseDto, req);

    expect(result.id).toBe("ticket-uuid");
    await new Promise((r) => setTimeout(r, 0));
  });

  it("stores userAgent and url from request headers in metadata", async () => {
    const req = makeRequest({
      headers: {
        "user-agent": "TestBrowser/1.0",
        referer: "http://localhost:5173/contact",
      },
    });
    await service.submitTicket(baseDto, req);

    const args = mockTicketRepo.createTicket.mock.calls[0][0];
    expect(args.metadata.userAgent).toBe("TestBrowser/1.0");
    expect(args.metadata.url).toBe("http://localhost:5173/contact");
  });

  it("populates user_id when authenticated user is present", async () => {
    const req = makeRequest({ user: { id: "user-123" } });
    await service.submitTicket(baseDto, req);

    const args = mockTicketRepo.createTicket.mock.calls[0][0];
    expect(args.user_id).toBe("user-123");
  });

  it("sets user_id to null when no user on request", async () => {
    const req = makeRequest({ user: undefined });
    await service.submitTicket(baseDto, req);

    const args = mockTicketRepo.createTicket.mock.calls[0][0];
    expect(args.user_id).toBeNull();
  });

  it("stores handId and tournamentId from dto in metadata", async () => {
    const req = makeRequest();
    await service.submitTicket(
      { ...baseDto, handId: "hand-abc", tournamentId: "tour-xyz" },
      req,
    );

    const args = mockTicketRepo.createTicket.mock.calls[0][0];
    expect(args.metadata.lastHandId).toBe("hand-abc");
    expect(args.metadata.tournamentId).toBe("tour-xyz");
  });
});
