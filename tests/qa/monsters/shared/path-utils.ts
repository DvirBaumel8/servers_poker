/**
 * Monster Army - Path Utilities
 *
 * Utilities for working with API paths, URL parameters, and endpoints.
 * Centralizes path manipulation logic used across monsters.
 */

/**
 * Default test IDs for path parameter replacement.
 * Uses valid UUID format but with recognizable test patterns.
 */
export const DEFAULT_TEST_IDS: Record<string, string> = {
  id: "00000000-0000-0000-0000-000000000000",
  botId: "00000000-0000-0000-0000-000000000001",
  tournamentId: "00000000-0000-0000-0000-000000000002",
  gameId: "00000000-0000-0000-0000-000000000003",
  userId: "00000000-0000-0000-0000-000000000004",
  handId: "00000000-0000-0000-0000-000000000005",
  tableId: "00000000-0000-0000-0000-000000000006",
  subscriptionId: "00000000-0000-0000-0000-000000000007",
};

/**
 * Replace path parameters in a URL path.
 *
 * @example
 * replacePathParams('/bots/:id', { id: 'abc-123' })
 * // Returns: '/bots/abc-123'
 *
 * replacePathParams('/bots/:botId/subscribe/:tournamentId')
 * // Returns: '/bots/00000000.../subscribe/00000000...' (using defaults)
 */
export function replacePathParams(
  path: string,
  params: Record<string, string> = {},
): string {
  let result = path;

  const allParams = { ...DEFAULT_TEST_IDS, ...params };

  for (const [key, value] of Object.entries(allParams)) {
    result = result.replace(`:${key}`, value);
  }

  return result;
}

/**
 * Parse an endpoint string in the format "METHOD /path".
 *
 * @example
 * parseEndpoint('GET /bots/:id')
 * // Returns: { method: 'GET', path: '/bots/:id' }
 */
export function parseEndpoint(endpoint: string): {
  method: string;
  path: string;
} {
  const parts = endpoint.trim().split(/\s+/);

  if (parts.length === 1) {
    return { method: "GET", path: parts[0] };
  }

  return {
    method: parts[0].toUpperCase(),
    path: parts.slice(1).join(" "),
  };
}

/**
 * Convert an endpoint string to a full URL.
 *
 * @example
 * endpointToUrl('GET /bots/:id', 'http://localhost:3000/api/v1', { id: 'abc' })
 * // Returns: 'http://localhost:3000/api/v1/bots/abc'
 */
export function endpointToUrl(
  endpoint: string,
  baseUrl: string,
  params: Record<string, string> = {},
): string {
  const { path } = parseEndpoint(endpoint);
  const resolvedPath = replacePathParams(path, params);

  const cleanBase = baseUrl.replace(/\/$/, "");
  const cleanPath = resolvedPath.startsWith("/")
    ? resolvedPath
    : `/${resolvedPath}`;

  return `${cleanBase}${cleanPath}`;
}

/**
 * Extract path parameter names from a path.
 *
 * @example
 * extractPathParams('/bots/:botId/games/:gameId')
 * // Returns: ['botId', 'gameId']
 */
export function extractPathParams(path: string): string[] {
  const matches = path.match(/:(\w+)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1));
}

/**
 * Check if a path contains any path parameters.
 */
export function hasPathParams(path: string): boolean {
  return /:(\w+)/.test(path);
}

/**
 * Normalize a path by removing trailing slashes and ensuring leading slash.
 */
export function normalizePath(path: string): string {
  let result = path.trim();

  if (!result.startsWith("/")) {
    result = `/${result}`;
  }

  if (result.length > 1 && result.endsWith("/")) {
    result = result.slice(0, -1);
  }

  return result;
}

/**
 * Join path segments safely.
 *
 * @example
 * joinPaths('/api/v1/', '/bots', 'list/')
 * // Returns: '/api/v1/bots/list'
 */
export function joinPaths(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}
