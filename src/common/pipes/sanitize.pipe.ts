import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from "@nestjs/common";
import * as sanitizeHtml from "sanitize-html";
import {
  containsSqlInjection,
  containsXss,
} from "../validators/input-sanitization.validator";

@Injectable()
export class SanitizePipe implements PipeTransform {
  private readonly options: sanitizeHtml.IOptions = {
    allowedTags: [], // Strip all HTML tags
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  };

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === "string") {
      this.rejectDangerousInput(value);
      return this.sanitizeString(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.transform(item, _metadata));
    }

    if (typeof value === "object") {
      return this.sanitizeObject(value as Record<string, unknown>);
    }

    return value;
  }

  private rejectDangerousInput(value: string): void {
    if (containsSqlInjection(value)) {
      throw new BadRequestException(
        "Input contains potentially dangerous SQL characters or keywords",
      );
    }
    if (containsXss(value)) {
      throw new BadRequestException(
        "Input contains potentially dangerous script or HTML content",
      );
    }
  }

  private sanitizeString(value: string): string {
    // Strip HTML tags and decode HTML entities
    const sanitized = sanitizeHtml(value, this.options);

    // Remove dangerous URL schemes (handle whitespace/encoding bypasses)
    // Loop until no more replacements to handle nested/encoded attacks
    let result = sanitized;
    let previous: string;
    do {
      previous = result;
      // Remove whitespace within dangerous schemes
      result = result
        .replace(/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, "")
        .replace(/v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, "")
        .replace(/d\s*a\s*t\s*a\s*:/gi, "")
        .replace(/on\w+\s*=/gi, "");
    } while (result !== previous);

    return result.trim();
  }

  private sanitizeObject(
    obj: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Check keys for dangerous input
      this.rejectDangerousInput(key);

      // Sanitize keys too (prevent prototype pollution)
      const sanitizedKey = this.sanitizeString(key);
      if (
        sanitizedKey === "__proto__" ||
        sanitizedKey === "constructor" ||
        sanitizedKey === "prototype"
      ) {
        continue; // Skip dangerous keys
      }

      if (typeof value === "string") {
        // Check and reject dangerous values
        this.rejectDangerousInput(value);
        result[sanitizedKey] = this.sanitizeString(value);
      } else if (Array.isArray(value)) {
        result[sanitizedKey] = value.map((item) => {
          if (typeof item === "string") {
            this.rejectDangerousInput(item);
            return this.sanitizeString(item);
          } else if (typeof item === "object" && item !== null) {
            return this.sanitizeObject(item as Record<string, unknown>);
          }
          return item;
        });
      } else if (typeof value === "object" && value !== null) {
        result[sanitizedKey] = this.sanitizeObject(
          value as Record<string, unknown>,
        );
      } else {
        result[sanitizedKey] = value;
      }
    }

    return result;
  }
}
