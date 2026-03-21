import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Tournaments } from "./Tournaments";

const authState = {
  user: { id: "user-1", role: "user" },
  token: "token-123",
};

const tournamentState = {
  tournaments: [
    {
      id: "t-1",
      name: "Sunday Major",
      type: "scheduled",
      status: "registering",
      buyIn: 100,
      entriesCount: 30,
      registeredPlayers: 30,
      maxPlayers: 100,
      lateRegEndsLevel: 6,
      startingChips: 5000,
    },
  ],
  loading: false,
  error: null,
  fetchTournaments: vi.fn(),
};

const getMyBots = vi.fn();

vi.mock("../stores/authStore", () => ({
  useAuthStore: () => authState,
}));

vi.mock("../stores/tournamentStore", () => ({
  useTournamentStore: () => tournamentState,
}));

vi.mock("../api/bots", () => ({
  botsApi: {
    getMy: () => getMyBots(),
  },
}));

vi.mock("../api/tournaments", () => ({
  tournamentsApi: {
    create: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    start: vi.fn(),
    cancel: vi.fn(),
  },
}));

describe("Tournaments page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders tournament lobby summary and cards", async () => {
    getMyBots.mockResolvedValue([
      { id: "bot-1", name: "RiverPilot", active: true },
    ]);

    render(
      <MemoryRouter>
        <Tournaments />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/multi-format tournament control/i),
      ).toBeInTheDocument(),
    );

    expect(tournamentState.fetchTournaments).toHaveBeenCalledWith("active");
    expect(screen.getByText(/sunday major/i)).toBeInTheDocument();
    expect(screen.getByText(/running fields/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create tournament/i }),
    ).toBeInTheDocument();
  });
});
