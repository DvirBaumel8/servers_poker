import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Leaderboard } from "./Leaderboard";

const getLeaderboard = vi.fn();

vi.mock("../api/games", () => ({
  gamesApi: {
    getLeaderboard: (...args: unknown[]) => getLeaderboard(...args),
  },
}));

describe("Leaderboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows only the loading state before leaderboard data resolves", async () => {
    let resolveLeaderboard!: (value: unknown) => void;
    getLeaderboard.mockReturnValue(
      new Promise((resolve) => {
        resolveLeaderboard = resolve;
      }),
    );

    render(
      <MemoryRouter>
        <Leaderboard />
      </MemoryRouter>,
    );

    expect(screen.getByText(/loading leaderboard/i)).toBeInTheDocument();
    expect(screen.queryByText(/ranked bots/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/top net/i)).not.toBeInTheDocument();

    resolveLeaderboard([
      {
        botId: "bot-1",
        botName: "RiverPilot",
        totalNet: 1200,
        totalTournaments: 5,
        tournamentWins: 2,
        totalHands: 300,
      },
    ]);

    await waitFor(() =>
      expect(screen.getByText(/ranked bots/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/loading leaderboard/i)).not.toBeInTheDocument();
  });
});
