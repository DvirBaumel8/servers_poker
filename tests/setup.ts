import { beforeAll, afterAll, vi } from "vitest";

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-key-for-testing";
  process.env.JWT_EXPIRES_IN = "1h";
  process.env.DB_HOST = "localhost";
  process.env.DB_PORT = "5432";
  process.env.DB_USERNAME = "postgres";
  process.env.DB_PASSWORD = "postgres";
  process.env.DB_NAME = "poker_test";
});

afterAll(() => {
  vi.restoreAllMocks();
});

vi.mock("nestjs-pino", () => ({
  Logger: vi.fn().mockImplementation(() => ({
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  })),
  LoggerModule: {
    forRoot: vi.fn().mockReturnValue({
      module: class MockLoggerModule {},
      providers: [],
      exports: [],
    }),
    forRootAsync: vi.fn().mockReturnValue({
      module: class MockLoggerModule {},
      providers: [],
      exports: [],
    }),
  },
  InjectPinoLogger: vi.fn().mockReturnValue(() => {}),
  PinoLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  })),
}));
