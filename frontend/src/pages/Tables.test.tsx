import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Tables } from "./Tables";

const authState = {
  user: { id: "user-1", role: "user", username: "dvir" },
  token: "token-123",
};

const getTables = vi.fn();
const getMyBots = vi.fn();

vi.mock("../stores/authStore", () => ({
  useAuthStore: () => authState,
}));

vi.mock("../api/games", () => ({
  gamesApi: {
    getTables: () => getTables(),
    createTable: vi.fn(),
    joinTable: vi.fn(),
  },
}));

vi.mock("../api/bots", () => ({
  botsApi: {
    getMy: () => getMyBots(),
  },
}));

describe("Tables page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders live lobby metrics and table cards", async () => {
    getTables.mockResolvedValue([
      {
        id: "table-1",
        name: "High Stakes Arena",
        status: "running",
        smallBlind: 50,
        bigBlind: 100,
        currentPlayers: 4,
        maxPlayers: 9,
      },
      {
        id: "table-2",
        name: "Night Turbo",
        status: "waiting",
        smallBlind: 10,
        bigBlind: 20,
        currentPlayers: 2,
        maxPlayers: 6,
      },
    ]);
    getMyBots.mockResolvedValue([
      { id: "bot-1", name: "RiverPilot", active: true },
    ]);

    render(
      <MemoryRouter>
        <Tables />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/production-grade table overview/i),
      ).toBeInTheDocument(),
    );

    expect(screen.getByText(/high stakes arena/i)).toBeInTheDocument();
    expect(screen.getByText(/night turbo/i)).toBeInTheDocument();
    expect(screen.getAllByText(/open seats/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: /watch table/i })[0],
    ).toHaveAttribute("href", "/game/table-1");
  });

  it("keeps public table data visible when private bot inventory fails", async () => {
    getTables.mockResolvedValue([
      {
        id: "table-1",
        name: "High Stakes Arena",
        status: "running",
        smallBlind: 50,
        bigBlind: 100,
        currentPlayers: 4,
        maxPlayers: 9,
      },
    ]);
    getMyBots.mockRejectedValue(new Error("Unauthorized"));

    render(
      <MemoryRouter>
        <Tables />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText(/high stakes arena/i)).toBeInTheDocument(),
    );

    expect(
      screen.getByText(/account-only data unavailable/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/unable to load table data/i),
    ).not.toBeInTheDocument();
  });
});
