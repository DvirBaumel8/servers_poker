import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { SanitizePipe } from "./common/pipes/sanitize.pipe";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";

  const app = await NestFactory.create(AppModule, {
    logger: isProduction
      ? ["error", "warn", "log"]
      : ["error", "warn", "log", "debug", "verbose"],
  });

  const configService = app.get(ConfigService);

  // Security: Enforce JWT_SECRET in production
  const jwtSecret = configService.get<string>("jwtSecret");
  if (isProduction && (!jwtSecret || jwtSecret === "change-me-in-production")) {
    logger.error(
      "FATAL: JWT_SECRET environment variable must be set in production",
    );
    process.exit(1);
  }

  // Security: Helmet for HTTP security headers
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'", "wss:", "ws:"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false, // Disable CSP in development for easier debugging
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

  const corsOrigins = configService.get<string[]>("corsOrigins") || [
    "http://localhost:3001",
  ];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.setGlobalPrefix("api/v1");

  const port = configService.get<number>("port") || 3000;

  await app.listen(port);
  logger.log(`Poker server running on port ${port}`);
  logger.log(`Environment: ${nodeEnv}`);
  if (isProduction) {
    logger.log("Production security hardening enabled");
  }
}

bootstrap();
