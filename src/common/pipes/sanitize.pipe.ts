import { PipeTransform, Injectable, ArgumentMetadata } from "@nestjs/common";
import * as sanitizeHtml from "sanitize-html";

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

  private sanitizeString(value: string): string {
    // Strip HTML tags and decode HTML entities
    const sanitized = sanitizeHtml(value, this.options);
    // Also prevent script injection through attributes
    return sanitized
      .replace(/javascript:/gi, "")
      .replace(/on\w+=/gi, "")
      .trim();
  }

  private sanitizeObject(
    obj: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
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
        result[sanitizedKey] = this.sanitizeString(value);
      } else if (Array.isArray(value)) {
        result[sanitizedKey] = value.map((item) =>
          typeof item === "string"
            ? this.sanitizeString(item)
            : typeof item === "object" && item !== null
              ? this.sanitizeObject(item as Record<string, unknown>)
              : item,
        );
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
