import { describe, it, expect } from "vitest";
import {
  Public,
  IS_PUBLIC_KEY,
} from "../../../src/common/decorators/public.decorator";
import {
  Roles,
  ROLES_KEY,
} from "../../../src/common/decorators/roles.decorator";

describe("Decorators", () => {
  describe("Public decorator", () => {
    it("should export IS_PUBLIC_KEY constant", () => {
      expect(IS_PUBLIC_KEY).toBe("isPublic");
    });

    it("should be a function", () => {
      expect(typeof Public).toBe("function");
    });

    it("should return a decorator function", () => {
      const decorator = Public();
      expect(typeof decorator).toBe("function");
    });
  });

  describe("Roles decorator", () => {
    it("should export ROLES_KEY constant", () => {
      expect(ROLES_KEY).toBe("roles");
    });

    it("should be a function", () => {
      expect(typeof Roles).toBe("function");
    });

    it("should return a decorator function", () => {
      const decorator = Roles("admin", "user");
      expect(typeof decorator).toBe("function");
    });

    it("should accept single role", () => {
      const decorator = Roles("admin");
      expect(typeof decorator).toBe("function");
    });

    it("should accept multiple roles", () => {
      const decorator = Roles("admin", "user", "moderator");
      expect(typeof decorator).toBe("function");
    });
  });
});
