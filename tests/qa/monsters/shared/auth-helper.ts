/**
 * Monster Army - Authentication Helper
 *
 * Centralized authentication utilities for all monsters.
 * Handles login, token management, and auth headers.
 */

import { getEnv } from "./env-config";

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthResult {
  token: string | null;
  error?: string;
}

export interface AuthHelper {
  adminToken: string | null;
  userToken: string | null;
  authenticateAsAdmin(): Promise<string | null>;
  authenticateAsUser(): Promise<string | null>;
  authenticate(credentials: AuthCredentials): Promise<AuthResult>;
  registerAndVerify(
    credentials: AuthCredentials & { name?: string },
  ): Promise<AuthResult>;
  getBearerHeader(token: string | null): Record<string, string>;
  getAdminHeaders(): Record<string, string>;
  getUserHeaders(): Record<string, string>;
  reset(): void;
}

/**
 * Create an authentication helper instance.
 */
export function createAuthHelper(baseUrl?: string): AuthHelper {
  const env = getEnv();
  const apiBaseUrl = baseUrl || env.apiBaseUrl;

  let adminToken: string | null = null;
  let userToken: string | null = null;

  async function authenticate(
    credentials: AuthCredentials,
  ): Promise<AuthResult> {
    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          token: null,
          error: `Login failed (${response.status}): ${errorText}`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      return { token: extractToken(data) };
    } catch (error) {
      return {
        token: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function extractToken(data: Record<string, unknown>): string | null {
    return (
      ((data.access_token || data.accessToken || data.token) as string) || null
    );
  }

  async function registerAndVerify(
    credentials: AuthCredentials & { name?: string },
  ): Promise<AuthResult> {
    try {
      const regResponse = await fetch(`${apiBaseUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: credentials.email,
          name: credentials.name || "TestUser",
          password: credentials.password,
        }),
      });

      if (regResponse.status === 409) {
        const resendResp = await fetch(
          `${apiBaseUrl}/auth/resend-verification`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: credentials.email }),
          },
        );
        if (resendResp.ok) {
          const resendData = (await resendResp.json()) as Record<
            string,
            unknown
          >;
          if (resendData.verificationCode) {
            const verifyResult = await verifyEmail(
              credentials.email,
              resendData.verificationCode as string,
            );
            if (verifyResult.token) return verifyResult;
          }
        }
        return authenticate(credentials);
      }

      if (!regResponse.ok) {
        return {
          token: null,
          error: `Registration failed (${regResponse.status})`,
        };
      }

      const regData = (await regResponse.json()) as Record<string, unknown>;

      if (regData.requiresVerification && regData.verificationCode) {
        const verifyResult = await verifyEmail(
          credentials.email,
          regData.verificationCode as string,
        );
        if (verifyResult.token) return verifyResult;
      }

      return authenticate(credentials);
    } catch (error) {
      return {
        token: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function verifyEmail(email: string, code: string): Promise<AuthResult> {
    try {
      const resp = await fetch(`${apiBaseUrl}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!resp.ok)
        return { token: null, error: `Verification failed (${resp.status})` };
      const data = (await resp.json()) as Record<string, unknown>;
      return { token: extractToken(data) };
    } catch (error) {
      return { token: null, error: String(error) };
    }
  }

  async function authenticateAsAdmin(): Promise<string | null> {
    if (adminToken) return adminToken;

    const result = await authenticate({
      email: env.adminEmail,
      password: env.adminPassword,
    });

    if (result.token) {
      adminToken = result.token;
    }

    return adminToken;
  }

  async function authenticateAsUser(): Promise<string | null> {
    if (userToken) return userToken;

    const result = await authenticate({
      email: env.userEmail,
      password: env.userPassword,
    });

    if (result.token) {
      userToken = result.token;
    }

    return userToken;
  }

  function getBearerHeader(token: string | null): Record<string, string> {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  function getAdminHeaders(): Record<string, string> {
    return getBearerHeader(adminToken);
  }

  function getUserHeaders(): Record<string, string> {
    return getBearerHeader(userToken);
  }

  function reset(): void {
    adminToken = null;
    userToken = null;
  }

  return {
    get adminToken() {
      return adminToken;
    },
    get userToken() {
      return userToken;
    },
    authenticateAsAdmin,
    authenticateAsUser,
    authenticate,
    registerAndVerify,
    getBearerHeader,
    getAdminHeaders,
    getUserHeaders,
    reset,
  };
}

/**
 * Global auth helper instance for convenience.
 * Use createAuthHelper() if you need multiple instances.
 */
let globalAuthHelper: AuthHelper | null = null;

export function getAuthHelper(baseUrl?: string): AuthHelper {
  if (!globalAuthHelper) {
    globalAuthHelper = createAuthHelper(baseUrl);
  }
  return globalAuthHelper;
}

export function resetGlobalAuth(): void {
  globalAuthHelper?.reset();
  globalAuthHelper = null;
}
