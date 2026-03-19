import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

export interface SignedPayload {
  payload: string;
  signature: string;
  timestamp: number;
  nonce: string;
}

export interface SignatureVerificationResult {
  valid: boolean;
  error?: string;
}

@Injectable()
export class HmacSigningService {
  private readonly logger = new Logger(HmacSigningService.name);
  private readonly algorithm = "sha256";
  private readonly signatureValidityMs: number;
  private readonly usedNonces = new Map<string, number>();
  private readonly nonceCleanupIntervalMs = 60000;

  constructor(private readonly configService: ConfigService) {
    this.signatureValidityMs = this.configService.get<number>(
      "SIGNATURE_VALIDITY_MS",
      300000, // 5 minutes default
    );

    setInterval(() => this.cleanupExpiredNonces(), this.nonceCleanupIntervalMs);
  }

  /**
   * Signs a payload with HMAC-SHA256 using a bot's secret key
   */
  signPayload(payload: object, secretKey: string): SignedPayload {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString("hex");
    const payloadStr = JSON.stringify(payload);

    const dataToSign = `${timestamp}.${nonce}.${payloadStr}`;
    const signature = this.computeHmac(dataToSign, secretKey);

    return {
      payload: payloadStr,
      signature,
      timestamp,
      nonce,
    };
  }

  /**
   * Verifies a signed payload
   */
  verifySignature(
    signedPayload: SignedPayload,
    secretKey: string,
  ): SignatureVerificationResult {
    const { payload, signature, timestamp, nonce } = signedPayload;

    // Check timestamp validity (prevent replay attacks)
    const now = Date.now();
    const age = now - timestamp;

    if (age > this.signatureValidityMs) {
      return {
        valid: false,
        error: `Signature expired (age: ${age}ms, max: ${this.signatureValidityMs}ms)`,
      };
    }

    if (age < -30000) {
      return {
        valid: false,
        error: "Timestamp is in the future",
      };
    }

    // Check nonce uniqueness (prevent replay attacks)
    if (this.usedNonces.has(nonce)) {
      return {
        valid: false,
        error: "Nonce already used (potential replay attack)",
      };
    }

    // Compute expected signature
    const dataToSign = `${timestamp}.${nonce}.${payload}`;
    const expectedSignature = this.computeHmac(dataToSign, secretKey);

    // Constant-time comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex"),
    );

    if (isValid) {
      this.usedNonces.set(nonce, timestamp);
    }

    return {
      valid: isValid,
      error: isValid ? undefined : "Invalid signature",
    };
  }

  /**
   * Generates headers for a signed request
   */
  generateSignedHeaders(
    payload: object,
    secretKey: string,
  ): Record<string, string> {
    const signed = this.signPayload(payload, secretKey);

    return {
      "Content-Type": "application/json",
      "X-Poker-Signature": signed.signature,
      "X-Poker-Timestamp": signed.timestamp.toString(),
      "X-Poker-Nonce": signed.nonce,
    };
  }

  /**
   * Verifies headers from a signed request
   */
  verifySignedRequest(
    body: string,
    headers: Record<string, string>,
    secretKey: string,
  ): SignatureVerificationResult {
    const signature = headers["x-poker-signature"];
    const timestampStr = headers["x-poker-timestamp"];
    const nonce = headers["x-poker-nonce"];

    if (!signature || !timestampStr || !nonce) {
      return {
        valid: false,
        error: "Missing signature headers",
      };
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      return {
        valid: false,
        error: "Invalid timestamp format",
      };
    }

    return this.verifySignature(
      { payload: body, signature, timestamp, nonce },
      secretKey,
    );
  }

  /**
   * Generates a new secret key for a bot
   */
  generateSecretKey(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  private computeHmac(data: string, secretKey: string): string {
    return crypto
      .createHmac(this.algorithm, secretKey)
      .update(data)
      .digest("hex");
  }

  private cleanupExpiredNonces(): void {
    const cutoff = Date.now() - this.signatureValidityMs * 2;
    let cleaned = 0;

    for (const [nonce, timestamp] of this.usedNonces.entries()) {
      if (timestamp < cutoff) {
        this.usedNonces.delete(nonce);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired nonces`);
    }
  }
}
