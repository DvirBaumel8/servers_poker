import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AlertBanner,
  AppModal,
  Button,
  ConfirmDialog,
  PasswordField,
  SegmentedTabs,
} from "./primitives";
import { renderWithRouter } from "../../test/test-utils";

describe("UI primitives", () => {
  it("renders button links through the router", () => {
    renderWithRouter(<Button asLink="/tables">Open tables</Button>);

    expect(screen.getByRole("link", { name: /open tables/i })).toHaveAttribute(
      "href",
      "/tables",
    );
  });

  it("calls segmented tab change handler", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithRouter(
      <SegmentedTabs
        value="a"
        onChange={onChange}
        items={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /beta/i }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("dismisses alert banners", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    renderWithRouter(
      <AlertBanner title="Heads up" dismissible onDismiss={onDismiss}>
        Warning body
      </AlertBanner>,
    );

    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("renders modal content and footer actions", () => {
    renderWithRouter(
      <AppModal
        open
        title="Create item"
        description="Dialog body"
        onClose={vi.fn()}
        footer={<button type="button">Save</button>}
      >
        <div>Form content</div>
      </AppModal>,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/form content/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("triggers confirm dialog callbacks", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    renderWithRouter(
      <ConfirmDialog
        open
        title="Delete item"
        description="This is destructive."
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <PasswordField
        label="Password"
        id="password"
        value="secret123"
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByDisplayValue("secret123");

    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(input).toHaveAttribute("type", "text");
  });
});
