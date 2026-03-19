# ADR 002: NestJS Framework Adoption

## Status

Accepted

## Context

The original poker platform used a custom HTTP server implementation with manual routing, middleware, and WebSocket handling. While functional, this approach presented challenges:

1. **No standardized structure** - Code organization varied
2. **Manual dependency injection** - Services tightly coupled
3. **Limited middleware support** - Custom implementations required
4. **WebSocket complexity** - Raw implementation with manual state management
5. **Testing difficulties** - Hard to mock dependencies

## Decision

Adopt NestJS as the backend framework with the following structure:

### Module Architecture

```
src/
  modules/
    auth/        # Authentication (JWT + API Key)
    users/       # User management
    bots/        # Bot registration and validation
    games/       # Game state and history
    tournaments/ # Tournament lifecycle
```

### Key NestJS Features Used

1. **Dependency Injection** - Clean service composition
2. **Guards** - JWT, API Key, and Role-based auth
3. **Interceptors** - Logging, audit, timeout handling
4. **Exception Filters** - Standardized error responses
5. **WebSocket Gateway** - Real-time game updates
6. **Validation Pipes** - DTO validation with class-validator

### WebSocket Gateway

Replace custom WebSocket implementation with `@nestjs/websockets`:
- Socket.IO for broad client support
- Room-based subscriptions per table
- Authenticated connections
- Type-safe event handling

## Consequences

### Positive

- Standardized architecture patterns
- Excellent TypeScript integration
- Built-in validation and serialization
- Mature WebSocket support
- Easy to test with testing utilities
- Large ecosystem of plugins

### Negative

- Learning curve for team unfamiliar with NestJS
- Slight runtime overhead from decorators
- More boilerplate for simple endpoints
- Framework lock-in

### Neutral

- Express under the hood (familiar HTTP model)
- Different file organization pattern
- Configuration via decorators vs. explicit code

## Migration Strategy

1. Set up NestJS application structure
2. Create modules for each domain area
3. Implement services wrapping existing logic
4. Replace custom HTTP handlers with controllers
5. Implement WebSocket gateway
6. Add guards and interceptors
7. Remove old implementation files
