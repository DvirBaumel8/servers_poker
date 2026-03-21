import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Validates bot endpoint URLs for security.
 * In production, blocks private IPs and enforces HTTPS.
 */
@Injectable()
export class UrlValidatorService {
  private readonly isProduction: boolean;

  // Private IP ranges to block in production
  private readonly privateRanges = [
    /^127\./, // Loopback
    /^10\./, // Class A private
    /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
    /^192\.168\./, // Class C private
    /^169\.254\./, // Link-local (AWS metadata, etc.)
    /^0\./, // Current network
    /^localhost$/i,
    /^\[::1\]$/, // IPv6 loopback
  ];

  constructor(configService: ConfigService) {
    const nodeEnv = configService.get("NODE_ENV") || process.env.NODE_ENV;
    this.isProduction = nodeEnv === "production";
  }

  /**
   * Validate a bot endpoint URL
   */
  validate(endpoint: string): UrlValidationResult {
    const warnings: string[] = [];

    try {
      const url = new URL(endpoint);

      // Check protocol
      if (!["http:", "https:"].includes(url.protocol)) {
        return {
          valid: false,
          error: "Only HTTP and HTTPS protocols are allowed",
        };
      }

      // In production, enforce HTTPS
      if (this.isProduction && url.protocol !== "https:") {
        return {
          valid: false,
          error: "HTTPS is required for bot endpoints in production",
        };
      }

      // Check for private IPs
      const hostname = url.hostname.toLowerCase();

      if (this.isProduction) {
        if (this.isPrivateHost(hostname)) {
          return {
            valid: false,
            error: "Private IP addresses are not allowed in production",
          };
        }
      } else {
        // In development, warn but allow
        if (this.isPrivateHost(hostname)) {
          warnings.push(
            "Using localhost/private IP - will be blocked in production",
          );
        }
        if (url.protocol === "http:") {
          warnings.push("Using HTTP - HTTPS will be required in production");
        }
      }

      // Check for suspicious ports (common internal services)
      const suspiciousPorts = [
        22, 23, 25, 53, 110, 143, 389, 445, 636, 1433, 3306, 5432, 6379, 27017,
      ];
      if (url.port && suspiciousPorts.includes(parseInt(url.port, 10))) {
        if (this.isProduction) {
          return {
            valid: false,
            error: `Port ${url.port} is not allowed for security reasons`,
          };
        } else {
          warnings.push(
            `Port ${url.port} looks like an internal service - be careful`,
          );
        }
      }

      return {
        valid: true,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch {
      return { valid: false, error: "Invalid URL format" };
    }
  }

  /**
   * Check if hostname is a private/local address
   */
  private isPrivateHost(hostname: string): boolean {
    // Check against private IP patterns
    for (const pattern of this.privateRanges) {
      if (pattern.test(hostname)) {
        return true;
      }
    }

    // Check for localhost variations
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    ) {
      return true;
    }

    return false;
  }

  /**
   * Validate and also perform a health check
   * In non-production environments with localhost endpoints, skip the actual health check
   */
  async validateWithHealthCheck(
    endpoint: string,
    timeoutMs: number = 5000,
  ): Promise<
    UrlValidationResult & {
      healthCheck?: { success: boolean; latencyMs: number };
    }
  > {
    const validation = this.validate(endpoint);
    if (!validation.valid) {
      return validation;
    }

    // In dev/test, skip health check for localhost endpoints (no real bot server)
    if (!this.isProduction) {
      try {
        const url = new URL(endpoint);
        if (this.isPrivateHost(url.hostname)) {
          return {
            ...validation,
            healthCheck: { success: true, latencyMs: 0 },
          };
        }
      } catch {
        // Continue with health check if URL parsing fails
      }
    }

    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      // Try health endpoint first
      let healthUrl = endpoint;
      if (!endpoint.endsWith("/health")) {
        const url = new URL(endpoint);
        url.pathname = "/health";
        healthUrl = url.toString();
      }

      const response = await fetch(healthUrl, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - start;

      if (response.ok) {
        return {
          ...validation,
          healthCheck: { success: true, latencyMs },
        };
      }

      // If /health fails, try the main endpoint with POST
      const mainResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "health_check" }),
        signal: controller.signal,
      });

      if (mainResponse.ok) {
        return {
          ...validation,
          healthCheck: { success: true, latencyMs: Date.now() - start },
        };
      }

      return {
        valid: false,
        error: `Bot endpoint returned HTTP ${mainResponse.status}`,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          valid: false,
          error: `Bot endpoint timed out after ${timeoutMs}ms`,
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, error: `Cannot reach bot endpoint: ${message}` };
    }
  }
}
