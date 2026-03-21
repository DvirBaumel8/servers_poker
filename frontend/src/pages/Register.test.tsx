import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Register } from "./Register";

const registerMock = vi.fn();

vi.mock("../api/auth", () => ({
  authApi: {
    register: (...args: unknown[]) => registerMock(...args),
  },
}));

describe("Register page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers a direct verification path when email already exists", async () => {
    registerMock.mockRejectedValue(
      new Error(
        "Email already registered. Please verify your email or resend the verification code.",
      ),
    );

    const user = userEvent.setup();

    const { container } = render(
      <MemoryRouter initialEntries={["/register"]}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<div>Verify page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/email/i), "dvir@example.com");
    await user.type(screen.getByLabelText(/display name/i), "Dvir");
    await user.type(screen.getByLabelText(/^password$/i), "Password123");
    const confirmPasswordInput = container.querySelector("#confirmPassword");
    expect(confirmPasswordInput).toBeInstanceOf(HTMLInputElement);
    await user.type(confirmPasswordInput as HTMLInputElement, "Password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /go to verification page/i }),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: /go to verification page/i }),
    );

    expect(screen.getByText(/verify page/i)).toBeInTheDocument();
  });
});
