import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Home } from "./Home";

const getPlatformStats = vi.fn();
const usePageTracking = vi.fn();

vi.mock("../api", () => ({
  analyticsApi: {
    getPlatformStats: () => getPlatformStats(),
  },
}));

vi.mock("../hooks/usePageTracking", () => ({
  usePageTracking: () => usePageTracking(),
}));

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the redesigned hero and loads platform stats", async () => {
    getPlatformStats.mockResolvedValue({
      lifetime: {
        totalHandsDealt: 1200000,
        totalBots: 340,
        totalTournaments: 180,
      },
      live: {
        activeGames: 12,
      },
    });

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/the production workspace for/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /create workspace/i }),
    ).toHaveAttribute("href", "/register");

    await waitFor(() => expect(screen.getByText("1.2M+")).toBeInTheDocument());
    expect(screen.getByText("340")).toBeInTheDocument();
    expect(screen.getByText("180")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(usePageTracking).toHaveBeenCalled();
  });
});
