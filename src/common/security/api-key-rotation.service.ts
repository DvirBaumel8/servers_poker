import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { UserRepository } from "../../repositories/user.repository";

export interface ApiKeyRotationResult {
  newApiKey: string;
  oldApiKeyValidUntil: Date;
  rotatedAt: Date;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  userId?: string;
  isLegacyKey?: boolean;
  error?: string;
}

@Injectable()
export class ApiKeyRotationService {
  private readonly logger = new Logger(ApiKeyRotationService.name);
  private readonly keyPrefix = "pk_";
  private readonly legacyKeyGracePeriodMs: number;
  private readonly apiKeyHashSecret: string;
  private static readonly API_KEY_HASH_ITERATIONS = 210000;

  // In-memory cache of legacy keys during grace period
  private readonly legacyKeys = new Map<
    string,
    { userId: string; expiresAt: Date }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly userRepository: UserRepository,
  ) {
    this.legacyKeyGracePeriodMs = this.configService.get<number>(
      "API_KEY_GRACE_PERIOD_MS",
      86400000, // 24 hours default
    );

    this.apiKeyHashSecret = this.configService.get<string>(
      "API_KEY_HMAC_SECRET",
      crypto.randomBytes(32).toString("hex"),
    );

    // Cleanup expired legacy keys periodically
    setInterval(
      () => this.cleanupExpiredLegacyKeys(),
      this.legacyKeyGracePeriodMs / 4,
    );
  }

  /**
   * Generates a new API key with a recognizable prefix
   */
  generateApiKey(): string {
    const randomPart = crypto.randomBytes(24).toString("base64url");
    return `${this.keyPrefix}${randomPart}`;
  }

  /**
   * Hash API keys deterministically so they can be re-derived during
   * validation without keeping the raw key at rest.
   */
  hashApiKey(apiKey: string): string {
    return crypto
      .pbkdf2Sync(
        apiKey,
        this.apiKeyHashSecret,
        ApiKeyRotationService.API_KEY_HASH_ITERATIONS,
        32,
        "sha256",
      )
      .toString("hex");
  }

  /**
   * Rotates the API key for a user
   * The old key remains valid during the grace period
   */
  async rotateApiKey(userId: string): Promise<ApiKeyRotationResult> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const oldApiKeyHash = user.api_key_hash;
    const newApiKey = this.generateApiKey();
    const newApiKeyHash = this.hashApiKey(newApiKey);
    const rotatedAt = new Date();
    const oldApiKeyValidUntil = new Date(
      Date.now() + this.legacyKeyGracePeriodMs,
    );

    // Store the old key in the legacy keys cache
    if (oldApiKeyHash) {
      this.legacyKeys.set(oldApiKeyHash, {
        userId: user.id,
        expiresAt: oldApiKeyValidUntil,
      });
    }

    // Update user with new key
    await this.userRepository.update(userId, { api_key_hash: newApiKeyHash });

    this.logger.log(
      `API key rotated for user ${userId}. Old key valid until ${oldApiKeyValidUntil.toISOString()}`,
    );

    return {
      newApiKey,
      oldApiKeyValidUntil,
      rotatedAt,
    };
  }

  /**
   * Validates an API key, checking both current and legacy keys
   */
  async validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
    if (!apiKey) {
      return { valid: false, error: "No API key provided" };
    }

    const apiKeyHash = this.hashApiKey(apiKey);

    // Check current keys first using UserRepository's method
    const user = await this.userRepository.findByApiKeyHash(apiKeyHash);

    if (user) {
      return {
        valid: true,
        userId: user.id,
        isLegacyKey: false,
      };
    }

    // Check legacy keys
    const legacyEntry = this.legacyKeys.get(apiKeyHash);
    if (legacyEntry) {
      if (legacyEntry.expiresAt > new Date()) {
        this.logger.warn(
          `Legacy API key used for user ${legacyEntry.userId}. Expires at ${legacyEntry.expiresAt.toISOString()}`,
        );
        return {
          valid: true,
          userId: legacyEntry.userId,
          isLegacyKey: true,
        };
      } else {
        this.legacyKeys.delete(apiKeyHash);
      }
    }

    return { valid: false, error: "Invalid API key" };
  }

  /**
   * Revokes all API keys for a user (emergency use)
   */
  async revokeAllKeys(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Remove from legacy keys
    for (const [hash, entry] of this.legacyKeys.entries()) {
      if (entry.userId === userId) {
        this.legacyKeys.delete(hash);
      }
    }

    // Generate a completely new key (user will need to retrieve it)
    const newApiKey = this.generateApiKey();
    await this.userRepository.update(userId, {
      api_key_hash: this.hashApiKey(newApiKey),
    });

    this.logger.warn(`All API keys revoked for user ${userId}`);
  }

  /**
   * Gets rotation status for a user
   */
  async getRotationStatus(
    userId: string,
  ): Promise<{ hasLegacyKeys: boolean; legacyKeyExpiresAt?: Date }> {
    let legacyKeyExpiresAt: Date | undefined;

    for (const entry of this.legacyKeys.values()) {
      if (entry.userId === userId && entry.expiresAt > new Date()) {
        if (!legacyKeyExpiresAt || entry.expiresAt > legacyKeyExpiresAt) {
          legacyKeyExpiresAt = entry.expiresAt;
        }
      }
    }

    return {
      hasLegacyKeys: !!legacyKeyExpiresAt,
      legacyKeyExpiresAt,
    };
  }

  private cleanupExpiredLegacyKeys(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [hash, entry] of this.legacyKeys.entries()) {
      if (entry.expiresAt < now) {
        this.legacyKeys.delete(hash);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired legacy API keys`);
    }
  }
}
