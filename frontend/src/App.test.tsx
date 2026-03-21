import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import App from "./App";

const authState = {
  token: null as string | null,
  user: null as { role?: string; username?: string } | null,
  logout: vi.fn(),
  fetchUser: vi.fn(),
};

vi.mock("./stores/authStore", () => ({
  useAuthStore: (selector?: (state: typeof authState) => unknown) =>
    selector ? selector(authState) : authState,
}));

vi.mock("./pages/Home", () => ({ Home: () => <div>Home route</div> }));
vi.mock("./pages/Login", () => ({ Login: () => <div>Login route</div> }));
vi.mock("./pages/Register", () => ({
  Register: () => <div>Register route</div>,
}));
vi.mock("./pages/VerifyEmail", () => ({
  VerifyEmail: () => <div>Verify route</div>,
}));
vi.mock("./pages/ForgotPassword", () => ({
  ForgotPassword: () => <div>Forgot route</div>,
}));
vi.mock("./pages/ResetPassword", () => ({
  ResetPassword: () => <div>Reset route</div>,
}));
vi.mock("./pages/Tables", () => ({ Tables: () => <div>Tables route</div> }));
vi.mock("./pages/Tournaments", () => ({
  Tournaments: () => <div>Tournaments route</div>,
}));
vi.mock("./pages/TournamentDetail", () => ({
  TournamentDetail: () => <div>Tournament detail route</div>,
}));
vi.mock("./pages/Bots", () => ({ Bots: () => <div>Bots route</div> }));
vi.mock("./pages/BotProfile", () => ({
  BotProfile: () => <div>Bot profile route</div>,
}));
vi.mock("./pages/Leaderboard", () => ({
  Leaderboard: () => <div>Leaderboard route</div>,
}));
vi.mock("./pages/Profile", () => ({ Profile: () => <div>Profile route</div> }));
vi.mock("./pages/AdminAnalytics", () => ({
  AdminAnalytics: () => <div>Admin analytics route</div>,
}));
vi.mock("./pages/GameView", () => ({ GameView: () => <div>Game route</div> }));

function renderApp(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routing shells", () => {
  beforeEach(() => {
    authState.token = null;
    authState.user = null;
    authState.logout.mockReset();
    authState.fetchUser.mockReset();
  });

  it("uses the marketing shell on the home page", () => {
    renderApp("/");

    expect(screen.getByText(/production bot arena/i)).toBeInTheDocument();
    expect(screen.getByText(/home route/i)).toBeInTheDocument();
  });

  it("uses the auth shell on login", () => {
    renderApp("/login");

    expect(
      screen.getByText(/build, deploy, and watch bots compete/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/login route/i)).toBeInTheDocument();
  });

  it("uses the product shell on tables", () => {
    renderApp("/tables");

    expect(screen.getByText(/bot arena workspace/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in to continue/i)).toBeInTheDocument();
    expect(screen.queryByText(/tables route/i)).not.toBeInTheDocument();
  });

  it("uses the game shell without product chrome", () => {
    authState.token = "token";
    authState.user = { role: "user", username: "player" };

    renderApp("/game/table-1");

    expect(screen.getByText(/game route/i)).toBeInTheDocument();
    expect(screen.queryByText(/bot arena workspace/i)).not.toBeInTheDocument();
  });

  it("redirects protected profile route to login when signed out", () => {
    renderApp("/profile");

    expect(screen.getByText(/login route/i)).toBeInTheDocument();
  });

  it("allows admin analytics route for admins", () => {
    authState.token = "token";
    authState.user = { role: "admin", username: "admin" };

    renderApp("/admin/analytics");

    expect(screen.getByText(/admin analytics route/i)).toBeInTheDocument();
  });
});
