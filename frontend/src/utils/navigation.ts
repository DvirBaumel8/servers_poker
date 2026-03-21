export function normalizeRedirectPath(
  candidate: string | null | undefined,
  fallback: string = "/",
): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//")) return fallback;

  return candidate;
}
