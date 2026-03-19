import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";

export class GameException extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, any>,
  ) {
    super(message);
    this.name = "GameException";
  }
}

export class ChipConservationError extends GameException {
  constructor(expected: number, actual: number, context?: Record<string, any>) {
    super(
      `Chip conservation violated: expected ${expected}, got ${actual}`,
      "CHIP_CONSERVATION_ERROR",
      { expected, actual, ...context },
    );
  }
}

export class InvalidActionError extends GameException {
  constructor(action: string, reason: string, context?: Record<string, any>) {
    super(`Invalid action '${action}': ${reason}`, "INVALID_ACTION", {
      action,
      reason,
      ...context,
    });
  }
}

export class BotTimeoutError extends GameException {
  constructor(botId: string, timeoutMs: number, context?: Record<string, any>) {
    super(`Bot ${botId} timed out after ${timeoutMs}ms`, "BOT_TIMEOUT", {
      botId,
      timeoutMs,
      ...context,
    });
  }
}

export class TournamentError extends GameException {
  constructor(message: string, context?: Record<string, any>) {
    super(message, "TOURNAMENT_ERROR", context);
  }
}

@Catch(GameException)
export class GameExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GameExceptionFilter.name);

  catch(exception: GameException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception.code === "CHIP_CONSERVATION_ERROR"
        ? HttpStatus.INTERNAL_SERVER_ERROR
        : HttpStatus.BAD_REQUEST;

    this.logger.error(
      `Game error [${exception.code}]: ${exception.message}`,
      JSON.stringify(exception.context),
    );

    response.status(status).json({
      statusCode: status,
      error: exception.code,
      message: exception.message,
      context: exception.context,
      timestamp: new Date().toISOString(),
    });
  }
}
