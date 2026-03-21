import {
  getEmailValidationMessage,
  getLikelyEmailSuggestion,
  isValidEmailFormat,
  normalizeEmail,
} from "./email";

describe("email helpers", () => {
  it("normalizes email casing and spacing", () => {
    expect(normalizeEmail("  Dvir@GMAIL.com ")).toBe("dvir@gmail.com");
  });

  it("suggests fixes for common provider typos", () => {
    expect(getLikelyEmailSuggestion("dvirbaumel9@gmail.co")).toBe(
      "dvirbaumel9@gmail.com",
    );
  });

  it("does not suggest changes for normal domains", () => {
    expect(getLikelyEmailSuggestion("dvirbaumel9@gmail.com")).toBeNull();
  });

  it("validates well-formed email addresses", () => {
    expect(isValidEmailFormat("dvirbaumel9@gmail.com")).toBe(true);
    expect(isValidEmailFormat("dvir")).toBe(false);
  });

  it("returns calm validation messages", () => {
    expect(getEmailValidationMessage("dvir")).toBe(
      "Enter a valid email address.",
    );
    expect(getEmailValidationMessage("dvirbaumel9@gmail.co")).toBe(
      "Please double-check your email. Did you mean dvirbaumel9@gmail.com?",
    );
  });
});
