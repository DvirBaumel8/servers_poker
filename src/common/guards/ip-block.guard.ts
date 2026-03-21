import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

@Injectable()
export class IpBlockGuard implements CanActivate {
  private readonly logger = new Logger(IpBlockGuard.name);
  private readonly blockedIps: Set<string>;
  private readonly allowedIps: Set<string>;
  private readonly useAllowlist: boolean;

  constructor(private readonly configService: ConfigService) {
    // Load blocked IPs from environment (comma-separated)
    const blockedIpsStr = this.configService.get<string>("BLOCKED_IPS", "");
    this.blockedIps = new Set(
      blockedIpsStr
        .split(",")
        .map((ip) => ip.trim())
        .filter(Boolean),
    );

    // Load allowed IPs from environment (for admin endpoints)
    const allowedIpsStr = this.configService.get<string>("ALLOWED_IPS", "");
    this.allowedIps = new Set(
      allowedIpsStr
        .split(",")
        .map((ip) => ip.trim())
        .filter(Boolean),
    );

    // If allowlist is set, use whitelist mode
    this.useAllowlist = this.allowedIps.size > 0;

    if (this.blockedIps.size > 0) {
      this.logger.log(`Loaded ${this.blockedIps.size} blocked IP(s)`);
    }
    if (this.allowedIps.size > 0) {
      this.logger.log(
        `Allowlist mode enabled with ${this.allowedIps.size} allowed IP(s)`,
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = this.getClientIp(request);

    // Check blocklist
    if (this.blockedIps.has(clientIp)) {
      this.logger.warn(`Blocked request from IP: ${clientIp}`);
      throw new ForbiddenException("Access denied");
    }

    // Check CIDR ranges in blocklist
    for (const blockedIp of this.blockedIps) {
      if (blockedIp.includes("/") && this.isIpInCidr(clientIp, blockedIp)) {
        this.logger.warn(`Blocked request from IP in CIDR range: ${clientIp}`);
        throw new ForbiddenException("Access denied");
      }
    }

    return true;
  }

  private getClientIp(request: Request): string {
    // Check common proxy headers
    const forwardedFor = request.headers["x-forwarded-for"];
    if (forwardedFor) {
      // Take the first IP in the chain (original client)
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(",")[0];
      return ips.trim();
    }

    const realIp = request.headers["x-real-ip"];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return request.ip || request.socket.remoteAddress || "unknown";
  }

  private isIpInCidr(ip: string, cidr: string): boolean {
    try {
      const [range, bits] = cidr.split("/");
      const mask = parseInt(bits, 10);

      const ipNum = this.ipToNumber(ip);
      const rangeNum = this.ipToNumber(range);
      const maskNum = ~(2 ** (32 - mask) - 1);

      return (ipNum & maskNum) === (rangeNum & maskNum);
    } catch {
      return false;
    }
  }

  private ipToNumber(ip: string): number {
    const parts = ip.split(".").map(Number);
    return (
      ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
    );
  }

  // Method to dynamically add blocked IP (for runtime blocking)
  blockIp(ip: string): void {
    this.blockedIps.add(ip);
    this.logger.log(`IP blocked at runtime: ${ip}`);
  }

  // Method to dynamically unblock IP
  unblockIp(ip: string): void {
    this.blockedIps.delete(ip);
    this.logger.log(`IP unblocked: ${ip}`);
  }

  // Get list of blocked IPs
  getBlockedIps(): string[] {
    return Array.from(this.blockedIps);
  }
}
