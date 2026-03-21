type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  error?: Error;
  data?: Record<string, unknown>;
  timestamp: string;
}

class Logger {
  private isDev = import.meta.env.DEV;

  private formatEntry(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      entry.context ? `[${entry.context}]` : "",
      entry.message,
    ];
    return parts.filter(Boolean).join(" ");
  }

  private log(
    level: LogLevel,
    message: string,
    context?: string,
    error?: Error,
    data?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      level,
      message,
      context,
      error,
      data,
      timestamp: new Date().toISOString(),
    };

    if (this.isDev) {
      const formatted = this.formatEntry(entry);
      switch (level) {
        case "debug":
          console.debug(formatted, data || "");
          break;
        case "info":
          console.info(formatted, data || "");
          break;
        case "warn":
          console.warn(formatted, data || "");
          break;
        case "error":
          console.error(formatted, error || data || "");
          break;
      }
    }

    if (level === "error" && !this.isDev) {
      this.reportToService(entry);
    }
  }

  private reportToService(_entry: LogEntry): void {
    // TODO: Integrate with Sentry or other error tracking service
    // Example: Sentry.captureException(entry.error, { extra: entry.data });
  }

  debug(
    message: string,
    context?: string,
    data?: Record<string, unknown>,
  ): void {
    this.log("debug", message, context, undefined, data);
  }

  info(
    message: string,
    context?: string,
    data?: Record<string, unknown>,
  ): void {
    this.log("info", message, context, undefined, data);
  }

  warn(
    message: string,
    context?: string,
    data?: Record<string, unknown>,
  ): void {
    this.log("warn", message, context, undefined, data);
  }

  error(
    message: string,
    error?: Error | unknown,
    context?: string,
    data?: Record<string, unknown>,
  ): void {
    const err = error instanceof Error ? error : undefined;
    this.log("error", message, context, err, data);
  }
}

export const logger = new Logger();
