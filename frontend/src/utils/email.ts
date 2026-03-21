const COMMON_EMAIL_DOMAIN_CORRECTIONS: Record<string, string> = {
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotnail.com": "hotmail.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "outlok.com": "outlook.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getLikelyEmailSuggestion(email: string): string | null {
  const normalized = normalizeEmail(email);
  const [localPart, domain] = normalized.split("@");

  if (!localPart || !domain) {
    return null;
  }

  const correctedDomain = COMMON_EMAIL_DOMAIN_CORRECTIONS[domain];
  if (!correctedDomain) {
    return null;
  }

  return `${localPart}@${correctedDomain}`;
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function getEmailValidationMessage(email: string): string | null {
  const normalized = normalizeEmail(email);

  if (!normalized) {
    return null;
  }

  const suggestion = getLikelyEmailSuggestion(normalized);
  if (suggestion) {
    return `Please double-check your email. Did you mean ${suggestion}?`;
  }

  if (!isValidEmailFormat(normalized)) {
    return "Enter a valid email address.";
  }

  return null;
}
