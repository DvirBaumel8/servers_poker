import { Injectable, ExecutionContext, Inject } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";

/**
 * Custom throttler guard that allows bypassing rate limits for:
 * 1. Localhost/internal IPs (for load testing)
 * 2. Requests with X-Load-Test-Key header matching configured secret
 * 3. Health and metrics endpoints (monitoring should never be blocked)
 *
 * Set LOAD_TEST_KEY env var to enable header-based bypass.
 * Set RATE_LIMIT_SKIP_LOCALHOST=true to skip localhost (default in dev).
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  @Inject(ConfigService)
  private readonly configService: ConfigService;

  /**
   * Override shouldSkip to implement custom bypass logic.
   * Returns true to skip rate limiting entirely.
   */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Skip rate limiting for excluded paths
    if (this.shouldSkipPath(request.url || request.path || "")) {
      return true;
    }

    // Skip rate limiting for localhost in dev/test environments
    if (this.shouldSkipLocalhost(request)) {
      return true;
    }

    // Skip rate limiting if valid load test key is provided
    if (this.hasValidLoadTestKey(request)) {
      return true;
    }

    return false;
  }

  /**
   * Skip rate limiting for health and metrics endpoints.
   * These are used by load balancers and monitoring systems.
   */
  private shouldSkipPath(url: string): boolean {
    const skipPaths = [
      "/api/v1/health",
      "/api/health",
      "/health",
      "/api/metrics",
      "/metrics",
    ];

    const path = url.split("?")[0]; // Remove query string
    return skipPaths.some(
      (skip) => path === skip || path.startsWith(skip + "/"),
    );
  }

  /**
   * Skip rate limiting for localhost/internal IPs.
   * Useful for local development and load testing.
   */
  private shouldSkipLocalhost(request: any): boolean {
    const skipLocalhost = this.configService.get<string>(
      "RATE_LIMIT_SKIP_LOCALHOST",
      process.env.NODE_ENV !== "production" ? "true" : "false",
    );

    if (skipLocalhost !== "true") {
      return false;
    }

    const ip = this.getClientIp(request);
    const localhostIps = ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"];

    return localhostIps.includes(ip);
  }

  /**
   * Check if request has a valid load test key header.
   * This allows external load testing tools to bypass rate limits.
   */
  private hasValidLoadTestKey(request: any): boolean {
    const loadTestKey = this.configService.get<string>("LOAD_TEST_KEY");

    if (!loadTestKey) {
      return false;
    }

    const headerKey = request.headers["x-load-test-key"];
    return headerKey === loadTestKey;
  }

  /**
   * Extract client IP from request, handling proxies.
   */
  private getClientIp(request: any): string {
    // Check X-Forwarded-For header (set by proxies/load balancers)
    const forwardedFor = request.headers["x-forwarded-for"];
    if (forwardedFor) {
      // Take the first IP (original client)
      return forwardedFor.split(",")[0].trim();
    }

    // Check X-Real-IP header (set by some proxies)
    const realIp = request.headers["x-real-ip"];
    if (realIp) {
      return realIp;
    }

    // Fall back to connection remote address
    return (
      request.ip ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      "unknown"
    );
  }
}
