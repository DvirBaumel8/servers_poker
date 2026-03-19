import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

export interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: number;
  webhookId: string;
}

export interface SignedWebhook {
  payload: WebhookPayload;
  signature: string;
  headers: Record<string, string>;
}

export interface WebhookVerificationResult {
  valid: boolean;
  payload?: WebhookPayload;
  error?: string;
}

@Injectable()
export class WebhookSigningService {
  private readonly logger = new Logger(WebhookSigningService.name);
  private readonly algorithm = "sha256";
  private readonly signatureHeader = "X-Poker-Webhook-Signature";
  private readonly timestampHeader = "X-Poker-Webhook-Timestamp";
  private readonly idHeader = "X-Poker-Webhook-Id";
  private readonly signatureValidityMs: number;

  constructor(private readonly configService: ConfigService) {
    this.signatureValidityMs = this.configService.get<number>(
      "WEBHOOK_SIGNATURE_VALIDITY_MS",
      300000, // 5 minutes default
    );
  }

  /**
   * Creates a signed webhook payload
   */
  createSignedWebhook(
    event: string,
    data: Record<string, unknown>,
    webhookSecret: string,
  ): SignedWebhook {
    const timestamp = Date.now();
    const webhookId = crypto.randomUUID();

    const payload: WebhookPayload = {
      event,
      data,
      timestamp,
      webhookId,
    };

    const payloadString = JSON.stringify(payload);
    const signature = this.computeSignature(payloadString, timestamp, webhookSecret);

    return {
      payload,
      signature,
      headers: {
        "Content-Type": "application/json",
        [this.signatureHeader]: signature,
        [this.timestampHeader]: timestamp.toString(),
        [this.idHeader]: webhookId,
      },
    };
  }

  /**
   * Verifies a webhook signature
   */
  verifyWebhook(
    body: string,
    headers: Record<string, string>,
    webhookSecret: string,
  ): WebhookVerificationResult {
    const signature = headers[this.signatureHeader.toLowerCase()];
    const timestampStr = headers[this.timestampHeader.toLowerCase()];
    const webhookId = headers[this.idHeader.toLowerCase()];

    if (!signature) {
      return { valid: false, error: `Missing ${this.signatureHeader} header` };
    }

    if (!timestampStr) {
      return { valid: false, error: `Missing ${this.timestampHeader} header` };
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      return { valid: false, error: "Invalid timestamp format" };
    }

    // Check timestamp validity
    const now = Date.now();
    const age = now - timestamp;

    if (age > this.signatureValidityMs) {
      return {
        valid: false,
        error: `Webhook expired (age: ${age}ms, max: ${this.signatureValidityMs}ms)`,
      };
    }

    if (age < -30000) {
      return { valid: false, error: "Timestamp is in the future" };
    }

    // Compute expected signature
    const expectedSignature = this.computeSignature(body, timestamp, webhookSecret);

    // Parse signature format: v1=<signature>
    const signatureParts = signature.split(",");
    let isValid = false;

    for (const part of signatureParts) {
      const [version, sig] = part.split("=");
      if (version === "v1" && sig) {
        try {
          isValid = crypto.timingSafeEqual(
            Buffer.from(sig, "hex"),
            Buffer.from(expectedSignature, "hex"),
          );
          if (isValid) break;
        } catch {
          continue;
        }
      }
    }

    if (!isValid) {
      return { valid: false, error: "Invalid signature" };
    }

    try {
      const payload = JSON.parse(body) as WebhookPayload;
      return { valid: true, payload };
    } catch {
      return { valid: false, error: "Invalid JSON payload" };
    }
  }

  /**
   * Generates a webhook secret for a bot/user
   */
  generateWebhookSecret(): string {
    return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
  }

  /**
   * Creates webhook headers for outgoing requests
   */
  createWebhookHeaders(
    event: string,
    data: Record<string, unknown>,
    webhookSecret: string,
  ): { body: string; headers: Record<string, string> } {
    const signed = this.createSignedWebhook(event, data, webhookSecret);
    return {
      body: JSON.stringify(signed.payload),
      headers: signed.headers,
    };
  }

  private computeSignature(
    payload: string,
    timestamp: number,
    secret: string,
  ): string {
    const signedPayload = `${timestamp}.${payload}`;
    return crypto
      .createHmac(this.algorithm, secret)
      .update(signedPayload)
      .digest("hex");
  }
}
