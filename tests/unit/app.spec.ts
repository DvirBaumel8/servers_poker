import { describe, it, expect, beforeEach } from "vitest";
import { AppController } from "../../src/app.controller";
import { AppService } from "../../src/app.service";

describe("AppController", () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(() => {
    appService = new AppService();
    appController = new AppController(appService);
  });

  describe("getHealth", () => {
    it("should return OK", () => {
      const result = appController.getHealth();
      expect(result).toBe("OK");
    });
  });
});

describe("AppService", () => {
  let appService: AppService;

  beforeEach(() => {
    appService = new AppService();
  });

  describe("getHealth", () => {
    it("should return OK", () => {
      const result = appService.getHealth();
      expect(result).toBe("OK");
    });
  });
});
