import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Bots } from "./Bots";

const authState = {
  user: { id: "user-1", role: "user" },
  token: "token-123",
};

const getAll = vi.fn();
const getActiveBots = vi.fn();
const getMy = vi.fn();

vi.mock("../stores/authStore", () => ({
  useAuthStore: () => authState,
}));

vi.mock("../api/bots", () => ({
  botsApi: {
    getAll: () => getAll(),
    getActiveBots: () => getActiveBots(),
    getMy: () => getMy(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    validate: vi.fn(),
    activate: vi.fn(),
  },
}));

describe("Bots page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the bot directory and can switch to owned bots", async () => {
    getAll.mockResolvedValue([
      {
        id: "bot-1",
        name: "RiverPilot",
        endpoint: "https://example.com/action",
        description: "Aggressive post-flop bot",
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        userId: "user-1",
      },
    ]);
    getActiveBots.mockResolvedValue({
      bots: [
        {
          botId: "bot-1",
          botName: "RiverPilot",
          isActive: true,
          activeGames: [{ tableId: "table-1" }],
          activeTournaments: [],
        },
      ],
    });
    getMy.mockResolvedValue([
      {
        id: "bot-1",
        name: "RiverPilot",
        endpoint: "https://example.com/action",
        description: "Aggressive post-flop bot",
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        userId: "user-1",
      },
    ]);

    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Bots />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText(/platform bot directory/i)).toBeInTheDocument(),
    );

    expect(screen.getByText(/bots currently in action/i)).toBeInTheDocument();
    expect(screen.getAllByText(/riverpilot/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("tab", { name: /my bots/i }));
    await waitFor(() => {
      expect(screen.getByText(/your bot operations/i)).toBeInTheDocument();
    });
  });

  it("keeps the public directory visible when private bot inventory fails", async () => {
    getAll.mockResolvedValue([
      {
        id: "bot-1",
        name: "RiverPilot",
        endpoint: "https://example.com/action",
        description: "Aggressive post-flop bot",
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        userId: "user-1",
      },
    ]);
    getActiveBots.mockResolvedValue({
      totalActive: 1,
      bots: [
        {
          botId: "bot-1",
          botName: "RiverPilot",
          isActive: true,
          activeGames: [{ tableId: "table-1" }],
          activeTournaments: [],
        },
      ],
    });
    getMy.mockRejectedValue(new Error("Unauthorized"));

    render(
      <MemoryRouter>
        <Bots />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText(/platform bot directory/i)).toBeInTheDocument(),
    );

    expect(screen.getAllByText(/riverpilot/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/account-only bot data unavailable/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bot workspace error/i)).not.toBeInTheDocument();
  });
});
