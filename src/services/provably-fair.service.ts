/**
 * Provably Fair RNG Service
 * =========================
 * Implements HMAC-based commit-reveal scheme for verifiable deck shuffling.
 *
 * How it works:
 * 1. Before each hand, server generates:
 *    - Server seed (random secret)
 *    - Client seed (can be provided by players or generated)
 *    - Nonce (hand number)
 *
 * 2. Server creates commitment:
 *    - seedHash = SHA256(serverSeed)
 *    - This hash is shared with clients BEFORE the hand starts
 *
 * 3. During the hand:
 *    - Combined seed = HMAC-SHA256(serverSeed, clientSeed + nonce)
 *    - This combined seed is used to deterministically shuffle the deck
 *
 * 4. After the hand:
 *    - Server reveals serverSeed
 *    - Players can verify:
 *      a) SHA256(serverSeed) matches the commitment
 *      b) The shuffle was deterministic based on the seeds
 *      c) No manipulation was possible after commitment
 */

import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";

export interface HandSeedData {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  combinedHash: string;
  deckOrder: number[];
  createdAt: Date;
}

export interface VerificationResult {
  valid: boolean;
  serverSeedHashMatch: boolean;
  deckOrderMatch: boolean;
  message: string;
  details?: {
    providedServerSeed: string;
    calculatedHash: string;
    expectedHash: string;
    calculatedDeckOrder: number[];
    expectedDeckOrder: number[];
  };
}

export interface HandCommitment {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

@Injectable()
export class ProvablyFairService {
  private readonly logger = new Logger(ProvablyFairService.name);

  /**
   * Generate a cryptographically secure random seed
   */
  generateServerSeed(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Generate a default client seed (can be overridden by player input)
   */
  generateClientSeed(): string {
    return crypto.randomBytes(16).toString("hex");
  }

  /**
   * Create SHA256 hash of the server seed (commitment)
   */
  hashServerSeed(serverSeed: string): string {
    return crypto.createHash("sha256").update(serverSeed).digest("hex");
  }

  /**
   * Combine server seed, client seed, and nonce using HMAC-SHA256
   */
  combineSeedsHmac(
    serverSeed: string,
    clientSeed: string,
    nonce: number,
  ): string {
    const message = `${clientSeed}:${nonce}`;
    return crypto
      .createHmac("sha256", serverSeed)
      .update(message)
      .digest("hex");
  }

  /**
   * Generate deterministic deck order from combined hash
   * Uses Fisher-Yates shuffle with seeded RNG
   */
  generateDeckOrder(combinedHash: string): number[] {
    const deckSize = 52;
    const order = Array.from({ length: deckSize }, (_, i) => i);

    // Use the combined hash to seed a deterministic RNG
    let hashIndex = 0;
    const getNextByte = (): number => {
      if (hashIndex >= combinedHash.length) {
        // Extend the hash if needed by hashing the current state
        const extendedHash = crypto
          .createHash("sha256")
          .update(combinedHash + hashIndex.toString())
          .digest("hex");
        hashIndex = 0;
        return parseInt(extendedHash.substring(hashIndex, hashIndex + 2), 16);
      }
      const byte = parseInt(
        combinedHash.substring(hashIndex, hashIndex + 2),
        16,
      );
      hashIndex += 2;
      return byte;
    };

    // Seeded Fisher-Yates shuffle
    for (let i = deckSize - 1; i > 0; i--) {
      // Generate a random index from 0 to i
      const randomValue = (getNextByte() << 8) | getNextByte();
      const j = randomValue % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }

    return order;
  }

  /**
   * Create seed data for a new hand
   */
  createHandSeeds(
    nonce: number,
    clientSeed?: string,
    serverSeed?: string,
  ): HandSeedData {
    const actualServerSeed = serverSeed || this.generateServerSeed();
    const actualClientSeed = clientSeed || this.generateClientSeed();
    const serverSeedHash = this.hashServerSeed(actualServerSeed);
    const combinedHash = this.combineSeedsHmac(
      actualServerSeed,
      actualClientSeed,
      nonce,
    );
    const deckOrder = this.generateDeckOrder(combinedHash);

    return {
      serverSeed: actualServerSeed,
      serverSeedHash,
      clientSeed: actualClientSeed,
      nonce,
      combinedHash,
      deckOrder,
      createdAt: new Date(),
    };
  }

  /**
   * Get the commitment to share with players before the hand
   * (Does NOT include the server seed - only its hash)
   */
  getCommitment(seedData: HandSeedData): HandCommitment {
    return {
      serverSeedHash: seedData.serverSeedHash,
      clientSeed: seedData.clientSeed,
      nonce: seedData.nonce,
    };
  }

  /**
   * Verify a hand's fairness given all seeds
   */
  verifyHand(
    serverSeed: string,
    serverSeedHash: string,
    clientSeed: string,
    nonce: number,
    expectedDeckOrder: number[],
  ): VerificationResult {
    // Step 1: Verify server seed hash matches commitment
    const calculatedHash = this.hashServerSeed(serverSeed);
    const serverSeedHashMatch = calculatedHash === serverSeedHash;

    if (!serverSeedHashMatch) {
      return {
        valid: false,
        serverSeedHashMatch: false,
        deckOrderMatch: false,
        message:
          "Server seed hash does not match commitment. The server seed was modified after commitment.",
        details: {
          providedServerSeed: serverSeed,
          calculatedHash,
          expectedHash: serverSeedHash,
          calculatedDeckOrder: [],
          expectedDeckOrder,
        },
      };
    }

    // Step 2: Verify deck order is deterministic
    const combinedHash = this.combineSeedsHmac(serverSeed, clientSeed, nonce);
    const calculatedDeckOrder = this.generateDeckOrder(combinedHash);
    const deckOrderMatch =
      JSON.stringify(calculatedDeckOrder) === JSON.stringify(expectedDeckOrder);

    if (!deckOrderMatch) {
      return {
        valid: false,
        serverSeedHashMatch: true,
        deckOrderMatch: false,
        message:
          "Deck order does not match expected order. This should not happen if implementation is correct.",
        details: {
          providedServerSeed: serverSeed,
          calculatedHash,
          expectedHash: serverSeedHash,
          calculatedDeckOrder,
          expectedDeckOrder,
        },
      };
    }

    return {
      valid: true,
      serverSeedHashMatch: true,
      deckOrderMatch: true,
      message:
        "Hand verified successfully. The shuffle was provably fair and deterministic.",
    };
  }

  /**
   * Shuffle a deck using the provably fair seed data
   */
  shuffleDeckWithSeeds<T>(deck: T[], seedData: HandSeedData): T[] {
    const shuffled: T[] = new Array(deck.length);
    for (let i = 0; i < deck.length; i++) {
      shuffled[i] = deck[seedData.deckOrder[i]];
    }
    return shuffled;
  }

  /**
   * Generate verification data to share with players after hand
   */
  getVerificationData(seedData: HandSeedData): {
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    combinedHash: string;
    deckOrder: number[];
    verificationUrl: string;
  } {
    return {
      serverSeed: seedData.serverSeed,
      serverSeedHash: seedData.serverSeedHash,
      clientSeed: seedData.clientSeed,
      nonce: seedData.nonce,
      combinedHash: seedData.combinedHash,
      deckOrder: seedData.deckOrder,
      verificationUrl: `/api/v1/games/verify-hand`,
    };
  }
}
