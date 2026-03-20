import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "10.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",
  "169.254.",
  "metadata.google.internal",
  "metadata.aws.internal",
  ".internal",
  ".local",
];

@ValidatorConstraint({ async: false })
export class IsValidBotEndpointConstraint implements ValidatorConstraintInterface {
  validate(endpoint: string): boolean {
    if (!endpoint || typeof endpoint !== "string") {
      return false;
    }

    try {
      const url = new URL(endpoint);

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return false;
      }

      const hostname = url.hostname.toLowerCase();

      for (const blocked of BLOCKED_HOSTS) {
        if (
          hostname === blocked ||
          hostname.startsWith(blocked) ||
          hostname.endsWith(blocked)
        ) {
          return false;
        }
      }

      const ipMatch = hostname.match(
        /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
      );
      if (ipMatch) {
        const octets = ipMatch.slice(1).map(Number);

        if (octets[0] === 10) return false;
        if (octets[0] === 127) return false;
        if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
          return false;
        if (octets[0] === 192 && octets[1] === 168) return false;
        if (octets[0] === 169 && octets[1] === 254) return false;
        if (octets[0] === 0) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return "Bot endpoint must be a valid public HTTP(S) URL. Internal/private IPs are not allowed.";
  }
}

export function IsValidBotEndpoint(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidBotEndpointConstraint,
    });
  };
}
