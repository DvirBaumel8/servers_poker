import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { SanitizePipe } from "./common/pipes/sanitize.pipe";
import { BigIntInterceptor } from "./common/interceptors/bigint.interceptor";
import {
  DEFAULT_CORS_ORIGINS,
  DEFAULT_DEV_CONNECT_SRC,
} from "./config/app.config";

// BigInt → string for WebSocket JSON.stringify (Socket.IO) and any other non-HTTP path.
// HTTP responses are handled by BigIntInterceptor below.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  if (isProduction) {
    app.useLogger(app.get(PinoLogger));
  }

  const configService = app.get(ConfigService);

  // Security: Enforce JWT_SECRET in all non-development environments
  const jwtSecret = configService.get<string>("jwtSecret");
  if (
    nodeEnv !== "development" &&
    (!jwtSecret || jwtSecret === "change-me-in-production")
  ) {
    logger.error(
      "FATAL: JWT_SECRET environment variable must be set in non-development environments",
    );
    process.exit(1);
  }

  // Security: Helmet for HTTP security headers (including hiding X-Powered-By)
  app.use(
    helmet({
      hidePoweredBy: true,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: isProduction
            ? ["'self'"]
            : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: [
            "'self'",
            "wss:",
            "ws:",
            ...(isProduction ? [] : DEFAULT_DEV_CONNECT_SRC),
          ],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Can break legitimate embedding
      hsts: isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  // Security: Request body size limits (1MB default, 100KB for most endpoints)
  app.use(
    (req: { path: string }, _res: unknown, next: (err?: Error) => void) => {
      const contentLength = parseInt(
        (req as { headers?: Record<string, string> }).headers?.[
          "content-length"
        ] || "0",
        10,
      );
      const maxSize = req.path.includes("/upload") ? 10 * 1024 * 1024 : 102400; // 10MB for uploads, 100KB otherwise

      if (contentLength > maxSize) {
        const error = new Error("Request body too large");
        (error as Error & { status: number }).status = 413;
        return next(error);
      }
      next();
    },
  );

  // Serialize BigInt values as strings in all HTTP responses
  app.useGlobalInterceptors(new BigIntInterceptor());

  // Security: Input sanitization (XSS protection)
  app.useGlobalPipes(
    new SanitizePipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const corsOrigins =
    configService.get<string[]>("corsOrigins") || DEFAULT_CORS_ORIGINS;
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.setGlobalPrefix("api/v1");

  // Swagger / OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle("BotRoyale Poker API")
    .setDescription("No-Limit Texas Hold'em tournament platform")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, swaggerDocument);

  const port = configService.get<number>("port") || 3000;

  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`Poker server running on port ${port}`);
  logger.log(`Environment: ${nodeEnv}`);
  if (isProduction) {
    logger.log("Production security hardening enabled");
  }
}

bootstrap();
