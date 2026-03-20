import { describe, it, expect, beforeEach } from "vitest";
import { ProvablyFairService } from "../../../src/services/provably-fair.service";

describe("ProvablyFairService", () => {
  let service: ProvablyFairService;

  beforeEach(() => {
    service = new ProvablyFairService();
  });

  describe("generateServerSeed", () => {
    it("should generate a 64-character hex string", () => {
      const seed = service.generateServerSeed();
      expect(seed).toHaveLength(64);
      expect(seed).toMatch(/^[0-9a-f]+$/);
    });

    it("should generate unique seeds", () => {
      const seeds = new Set<string>();
      for (let i = 0; i < 100; i++) {
        seeds.add(service.generateServerSeed());
      }
      expect(seeds.size).toBe(100);
    });
  });

  describe("generateClientSeed", () => {
    it("should generate a 32-character hex string", () => {
      const seed = service.generateClientSeed();
      expect(seed).toHaveLength(32);
      expect(seed).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("hashServerSeed", () => {
    it("should produce consistent SHA256 hash", () => {
      const seed = "test-seed-123";
      const hash1 = service.hashServerSeed(seed);
      const hash2 = service.hashServerSeed(seed);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("should produce different hashes for different seeds", () => {
      const hash1 = service.hashServerSeed("seed1");
      const hash2 = service.hashServerSeed("seed2");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("combineSeedsHmac", () => {
    it("should produce consistent HMAC", () => {
      const result1 = service.combineSeedsHmac("server", "client", 1);
      const result2 = service.combineSeedsHmac("server", "client", 1);
      expect(result1).toBe(result2);
    });

    it("should produce different results for different nonces", () => {
      const result1 = service.combineSeedsHmac("server", "client", 1);
      const result2 = service.combineSeedsHmac("server", "client", 2);
      expect(result1).not.toBe(result2);
    });

    it("should produce different results for different client seeds", () => {
      const result1 = service.combineSeedsHmac("server", "client1", 1);
      const result2 = service.combineSeedsHmac("server", "client2", 1);
      expect(result1).not.toBe(result2);
    });
  });

  describe("generateDeckOrder", () => {
    it("should generate array of 52 elements", () => {
      const hash = service.combineSeedsHmac("server", "client", 1);
      const order = service.generateDeckOrder(hash);
      expect(order).toHaveLength(52);
    });

    it("should contain all indices 0-51", () => {
      const hash = service.combineSeedsHmac("server", "client", 1);
      const order = service.generateDeckOrder(hash);
      const sorted = [...order].sort((a, b) => a - b);
      expect(sorted).toEqual(Array.from({ length: 52 }, (_, i) => i));
    });

    it("should produce deterministic order", () => {
      const hash = service.combineSeedsHmac("server", "client", 1);
      const order1 = service.generateDeckOrder(hash);
      const order2 = service.generateDeckOrder(hash);
      expect(order1).toEqual(order2);
    });

    it("should produce different orders for different hashes", () => {
      const hash1 = service.combineSeedsHmac("server", "client1", 1);
      const hash2 = service.combineSeedsHmac("server", "client2", 1);
      const order1 = service.generateDeckOrder(hash1);
      const order2 = service.generateDeckOrder(hash2);
      expect(order1).not.toEqual(order2);
    });
  });

  describe("createHandSeeds", () => {
    it("should create complete seed data", () => {
      const seedData = service.createHandSeeds(1);

      expect(seedData.serverSeed).toBeDefined();
      expect(seedData.serverSeedHash).toBeDefined();
      expect(seedData.clientSeed).toBeDefined();
      expect(seedData.nonce).toBe(1);
      expect(seedData.combinedHash).toBeDefined();
      expect(seedData.deckOrder).toHaveLength(52);
      expect(seedData.createdAt).toBeInstanceOf(Date);
    });

    it("should use provided client seed", () => {
      const seedData = service.createHandSeeds(1, "my-client-seed");
      expect(seedData.clientSeed).toBe("my-client-seed");
    });

    it("should use provided server seed", () => {
      const seedData = service.createHandSeeds(1, "client-seed", "server-seed");
      expect(seedData.serverSeed).toBe("server-seed");
    });

    it("should produce consistent hash for server seed", () => {
      const seedData = service.createHandSeeds(1);
      const expectedHash = service.hashServerSeed(seedData.serverSeed);
      expect(seedData.serverSeedHash).toBe(expectedHash);
    });
  });

  describe("getCommitment", () => {
    it("should return commitment without server seed", () => {
      const seedData = service.createHandSeeds(1);
      const commitment = service.getCommitment(seedData);

      expect(commitment.serverSeedHash).toBe(seedData.serverSeedHash);
      expect(commitment.clientSeed).toBe(seedData.clientSeed);
      expect(commitment.nonce).toBe(seedData.nonce);
      expect((commitment as never)["serverSeed"]).toBeUndefined();
    });
  });

  describe("verifyHand", () => {
    it("should verify valid hand successfully", () => {
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

    it("should fail verification with wrong server seed", () => {
      const seedData = service.createHandSeeds(1);

      const result = service.verifyHand(
        "wrong-server-seed",
        seedData.serverSeedHash,
        seedData.clientSeed,
        seedData.nonce,
        seedData.deckOrder,
      );

      expect(result.valid).toBe(false);
      expect(result.serverSeedHashMatch).toBe(false);
      expect(result.message).toContain("does not match commitment");
    });

    it("should fail verification with wrong deck order", () => {
      const seedData = service.createHandSeeds(1);
      const wrongOrder = [...seedData.deckOrder];
      [wrongOrder[0], wrongOrder[1]] = [wrongOrder[1], wrongOrder[0]];

      const result = service.verifyHand(
        seedData.serverSeed,
        seedData.serverSeedHash,
        seedData.clientSeed,
        seedData.nonce,
        wrongOrder,
      );

      expect(result.valid).toBe(false);
      expect(result.serverSeedHashMatch).toBe(true);
      expect(result.deckOrderMatch).toBe(false);
    });

    it("should include details when verification fails", () => {
      const seedData = service.createHandSeeds(1);

      const result = service.verifyHand(
        "wrong-seed",
        seedData.serverSeedHash,
        seedData.clientSeed,
        seedData.nonce,
        seedData.deckOrder,
      );

      expect(result.details).toBeDefined();
      expect(result.details?.providedServerSeed).toBe("wrong-seed");
    });
  });

  describe("shuffleDeckWithSeeds", () => {
    it("should shuffle deck deterministically", () => {
      const seedData = service.createHandSeeds(1);
      const deck = Array.from({ length: 52 }, (_, i) => `Card${i}`);

      const shuffled1 = service.shuffleDeckWithSeeds(deck, seedData);
      const shuffled2 = service.shuffleDeckWithSeeds(deck, seedData);

      expect(shuffled1).toEqual(shuffled2);
      expect(shuffled1).not.toEqual(deck);
    });

    it("should preserve all deck elements", () => {
      const seedData = service.createHandSeeds(1);
      const deck = Array.from({ length: 52 }, (_, i) => `Card${i}`);

      const shuffled = service.shuffleDeckWithSeeds(deck, seedData);
      const sortedShuffled = [...shuffled].sort();
      const sortedDeck = [...deck].sort();

      expect(sortedShuffled).toEqual(sortedDeck);
    });
  });

  describe("getVerificationData", () => {
    it("should return complete verification data", () => {
      const seedData = service.createHandSeeds(1);
      const verificationData = service.getVerificationData(seedData);

      expect(verificationData.serverSeed).toBe(seedData.serverSeed);
      expect(verificationData.serverSeedHash).toBe(seedData.serverSeedHash);
      expect(verificationData.clientSeed).toBe(seedData.clientSeed);
      expect(verificationData.nonce).toBe(seedData.nonce);
      expect(verificationData.combinedHash).toBe(seedData.combinedHash);
      expect(verificationData.deckOrder).toEqual(seedData.deckOrder);
      expect(verificationData.verificationUrl).toContain("verify-hand");
    });
  });

  describe("end-to-end verification flow", () => {
    it("should allow complete verification workflow", () => {
      // 1. Create seeds for a hand
      const seedData = service.createHandSeeds(1);

      // 2. Get commitment (share with players before hand)
      const commitment = service.getCommitment(seedData);

      // 3. After hand, get verification data
      const verificationData = service.getVerificationData(seedData);

      // 4. Players can verify
      const result = service.verifyHand(
        verificationData.serverSeed,
        commitment.serverSeedHash,
        commitment.clientSeed,
        commitment.nonce,
        verificationData.deckOrder,
      );

      expect(result.valid).toBe(true);
    });
  });
});
