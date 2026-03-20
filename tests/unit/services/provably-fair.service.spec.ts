import { describe, it, expect, beforeEach } from "vitest";
import { ProvablyFairService } from "../../../src/services/provably-fair.service";
import * as crypto from "crypto";

describe("ProvablyFairService", () => {
  let service: ProvablyFairService;

  beforeEach(() => {
    service = new ProvablyFairService();
  });

  describe.concurrent("generateServerSeed", () => {
    it("should generate a 64-character hex string (32 bytes)", () => {
      const seed = service.generateServerSeed();
      expect(seed).toHaveLength(64);
      expect(/^[a-f0-9]+$/i.test(seed)).toBe(true);
    });

    it("should generate unique seeds each time", () => {
      const seeds = new Set(
        Array.from({ length: 100 }, () => service.generateServerSeed()),
      );
      expect(seeds.size).toBe(100);
    });
  });

  describe.concurrent("generateClientSeed", () => {
    it("should generate a 32-character hex string (16 bytes)", () => {
      const seed = service.generateClientSeed();
      expect(seed).toHaveLength(32);
      expect(/^[a-f0-9]+$/i.test(seed)).toBe(true);
    });
  });

  describe.concurrent("hashServerSeed", () => {
    it("should produce consistent SHA256 hashes", () => {
      const serverSeed = "test_server_seed";
      const hash1 = service.hashServerSeed(serverSeed);
      const hash2 = service.hashServerSeed(serverSeed);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("should match Node.js crypto SHA256", () => {
      const serverSeed = "known_seed_value";
      const hash = service.hashServerSeed(serverSeed);
      const expectedHash = crypto
        .createHash("sha256")
        .update(serverSeed)
        .digest("hex");

      expect(hash).toBe(expectedHash);
    });
  });

  describe.concurrent("combineSeedsHmac", () => {
    it("should produce consistent HMAC hashes", () => {
      const serverSeed = "server_seed";
      const clientSeed = "client_seed";
      const nonce = 1;

      const hash1 = service.combineSeedsHmac(serverSeed, clientSeed, nonce);
      const hash2 = service.combineSeedsHmac(serverSeed, clientSeed, nonce);

      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different nonces", () => {
      const serverSeed = "server_seed";
      const clientSeed = "client_seed";

      const hash1 = service.combineSeedsHmac(serverSeed, clientSeed, 1);
      const hash2 = service.combineSeedsHmac(serverSeed, clientSeed, 2);

      expect(hash1).not.toBe(hash2);
    });

    it("should produce different hashes for different client seeds", () => {
      const serverSeed = "server_seed";

      const hash1 = service.combineSeedsHmac(serverSeed, "client1", 1);
      const hash2 = service.combineSeedsHmac(serverSeed, "client2", 1);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe.concurrent("generateDeckOrder", () => {
    it("should generate a valid deck order with 52 cards", () => {
      const combinedHash = service.combineSeedsHmac("server", "client", 1);
      const deckOrder = service.generateDeckOrder(combinedHash);

      expect(deckOrder).toHaveLength(52);
    });

    it("should contain each card index exactly once (valid permutation)", () => {
      const combinedHash = service.combineSeedsHmac("server", "client", 1);
      const deckOrder = service.generateDeckOrder(combinedHash);

      const sorted = [...deckOrder].sort((a, b) => a - b);
      expect(sorted).toEqual(Array.from({ length: 52 }, (_, i) => i));
    });

    it("should produce deterministic results for same input", () => {
      const combinedHash = service.combineSeedsHmac("server", "client", 1);
      const order1 = service.generateDeckOrder(combinedHash);
      const order2 = service.generateDeckOrder(combinedHash);

      expect(order1).toEqual(order2);
    });

    it("should produce different results for different inputs", () => {
      const hash1 = service.combineSeedsHmac("server", "client", 1);
      const hash2 = service.combineSeedsHmac("server", "client", 2);

      const order1 = service.generateDeckOrder(hash1);
      const order2 = service.generateDeckOrder(hash2);

      expect(order1).not.toEqual(order2);
    });
  });

  describe.concurrent("createHandSeeds", () => {
    it("should create complete seed data", () => {
      const seedData = service.createHandSeeds(1);

      expect(seedData.serverSeed).toHaveLength(64);
      expect(seedData.serverSeedHash).toHaveLength(64);
      expect(seedData.clientSeed).toHaveLength(32);
      expect(seedData.nonce).toBe(1);
      expect(seedData.combinedHash).toHaveLength(64);
      expect(seedData.deckOrder).toHaveLength(52);
      expect(seedData.createdAt).toBeInstanceOf(Date);
    });

    it("should use provided server and client seeds", () => {
      const serverSeed = "a".repeat(64);
      const clientSeed = "b".repeat(32);

      const seedData = service.createHandSeeds(1, clientSeed, serverSeed);

      expect(seedData.serverSeed).toBe(serverSeed);
      expect(seedData.clientSeed).toBe(clientSeed);
    });

    it("should produce consistent results with same inputs", () => {
      const serverSeed = "test_server";
      const clientSeed = "test_client";

      const seed1 = service.createHandSeeds(1, clientSeed, serverSeed);
      const seed2 = service.createHandSeeds(1, clientSeed, serverSeed);

      expect(seed1.serverSeedHash).toBe(seed2.serverSeedHash);
      expect(seed1.combinedHash).toBe(seed2.combinedHash);
      expect(seed1.deckOrder).toEqual(seed2.deckOrder);
    });
  });

  describe.concurrent("getCommitment", () => {
    it("should return only public commitment data", () => {
      const seedData = service.createHandSeeds(1);
      const commitment = service.getCommitment(seedData);

      expect(commitment).toHaveProperty("serverSeedHash");
      expect(commitment).toHaveProperty("clientSeed");
      expect(commitment).toHaveProperty("nonce");
      expect(commitment).not.toHaveProperty("serverSeed");
      expect(commitment).not.toHaveProperty("deckOrder");
    });
  });

  describe.concurrent("verifyHand", () => {
    it("should verify a valid hand successfully", () => {
      const seedData = service.createHandSeeds(1);
      const result = service.verifyHand(
        seedData.serverSeed,
        seedData.serverSeedHash,
        seedData.clientSeed,
        seedData.nonce,
        seedData.deckOrder,
      );

      expect(result.valid).toBe(true);
      expect(result.serverSeedHashMatch).toBe(true);
      expect(result.deckOrderMatch).toBe(true);
      expect(result.message).toContain("verified successfully");
    });

    it("should reject if server seed hash does not match", () => {
      const seedData = service.createHandSeeds(1);
      const fakeServerSeed = "fake_server_seed_that_doesnt_match";

      const result = service.verifyHand(
        fakeServerSeed,
        seedData.serverSeedHash,
        seedData.clientSeed,
        seedData.nonce,
        seedData.deckOrder,
      );

      expect(result.valid).toBe(false);
      expect(result.serverSeedHashMatch).toBe(false);
      expect(result.message).toContain("does not match commitment");
    });

    it("should reject if deck order was modified", () => {
      const seedData = service.createHandSeeds(1);
      const tamperedDeckOrder = [...seedData.deckOrder];
      [tamperedDeckOrder[0], tamperedDeckOrder[1]] = [
        tamperedDeckOrder[1],
        tamperedDeckOrder[0],
      ];

      const result = service.verifyHand(
        seedData.serverSeed,
        seedData.serverSeedHash,
        seedData.clientSeed,
        seedData.nonce,
        tamperedDeckOrder,
      );

      expect(result.valid).toBe(false);
      expect(result.serverSeedHashMatch).toBe(true);
      expect(result.deckOrderMatch).toBe(false);
    });

    it("should include details on failure", () => {
      const seedData = service.createHandSeeds(1);
      const fakeServerSeed = "fake_server_seed";

      const result = service.verifyHand(
        fakeServerSeed,
        seedData.serverSeedHash,
        seedData.clientSeed,
        seedData.nonce,
        seedData.deckOrder,
      );

      expect(result.details).toBeDefined();
      expect(result.details?.providedServerSeed).toBe(fakeServerSeed);
      expect(result.details?.calculatedHash).not.toBe(
        result.details?.expectedHash,
      );
    });
  });

  describe.concurrent("shuffleDeckWithSeeds", () => {
    it("should shuffle deck according to deck order", () => {
      const deck = Array.from({ length: 52 }, (_, i) => ({
        value: i,
        name: `Card${i}`,
      }));
      const seedData = service.createHandSeeds(1);
      const shuffled = service.shuffleDeckWithSeeds(deck, seedData);

      expect(shuffled).toHaveLength(52);

      for (let i = 0; i < 52; i++) {
        expect(shuffled[i]).toBe(deck[seedData.deckOrder[i]]);
      }
    });

    it("should produce deterministic shuffles", () => {
      const deck = Array.from({ length: 52 }, (_, i) => `Card${i}`);
      const seedData = service.createHandSeeds(1, "client", "server");

      const shuffled1 = service.shuffleDeckWithSeeds(deck, seedData);
      const shuffled2 = service.shuffleDeckWithSeeds(deck, seedData);

      expect(shuffled1).toEqual(shuffled2);
    });
  });

  describe.concurrent("getVerificationData", () => {
    it("should return complete verification data", () => {
      const seedData = service.createHandSeeds(5);
      const verification = service.getVerificationData(seedData);

      expect(verification.serverSeed).toBe(seedData.serverSeed);
      expect(verification.serverSeedHash).toBe(seedData.serverSeedHash);
      expect(verification.clientSeed).toBe(seedData.clientSeed);
      expect(verification.nonce).toBe(5);
      expect(verification.combinedHash).toBe(seedData.combinedHash);
      expect(verification.deckOrder).toEqual(seedData.deckOrder);
      expect(verification.verificationUrl).toBe("/api/v1/games/verify-hand");
    });
  });

  describe.concurrent("end-to-end verification flow", () => {
    it("should complete full commit-reveal-verify cycle", () => {
      const seedData = service.createHandSeeds(42, "player_client_seed");
      const commitment = service.getCommitment(seedData);
      expect(commitment.serverSeedHash).toBeTruthy();
      expect(commitment.clientSeed).toBe("player_client_seed");
      expect(commitment.nonce).toBe(42);

      const verification = service.getVerificationData(seedData);
      const result = service.verifyHand(
        verification.serverSeed,
        verification.serverSeedHash,
        verification.clientSeed,
        verification.nonce,
        verification.deckOrder,
      );

      expect(result.valid).toBe(true);
      expect(service.hashServerSeed(verification.serverSeed)).toBe(
        commitment.serverSeedHash,
      );
    });
  });
});
