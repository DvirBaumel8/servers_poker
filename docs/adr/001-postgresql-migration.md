# ADR 001: PostgreSQL Migration

## Status

Accepted

## Context

The original poker platform used SQLite (via Node.js 22's experimental `node:sqlite` module) for data persistence. While SQLite served well for development and small-scale deployments, several limitations emerged:

1. **No true concurrency** - SQLite uses file-level locking, limiting write throughput
2. **Limited data types** - No native JSON indexing or advanced constraints
3. **Transaction isolation** - Weaker guarantees for concurrent modifications
4. **Scaling** - No read replicas or connection pooling
5. **Production readiness** - Experimental module not recommended for production

Given the platform's requirement for "zero bugs in chip handling" and treating "data as money," we needed a more robust database solution.

## Decision

Migrate from SQLite to PostgreSQL with the following characteristics:

### Database Features Used

1. **JSONB columns** for flexible data storage (cards, hand details, bot validation results)
2. **CHECK constraints** for chip amount validation (`chips >= 0`)
3. **SERIALIZABLE transactions** for chip movements
4. **Proper foreign keys** with CASCADE deletes
5. **Connection pooling** via pg pool

### ORM Choice: TypeORM

Selected TypeORM for:
- First-class TypeScript support
- Decorator-based entity definitions
- Migration system
- Transaction support
- Active community

### Schema Design Principles

1. **BIGINT for all chip amounts** - Prevent overflow in long tournaments
2. **UUID primary keys** - Avoid sequential ID exposure
3. **Timestamp with timezone** - Proper datetime handling
4. **Indexed foreign keys** - Fast relationship lookups
5. **Audit trails** - Separate tables for chip movements and audit logs

## Consequences

### Positive

- Strong transaction guarantees for chip integrity
- Scalable to production workloads
- Better query capabilities (JSONB indexing)
- Standard production database with mature tooling
- Can use managed PostgreSQL services (AWS RDS, etc.)

### Negative

- Added infrastructure complexity (need PostgreSQL server)
- Migration effort from SQLite
- Slightly more complex local development setup (Docker helps)
- Connection management overhead

### Neutral

- Different SQL dialect (minor syntax differences)
- New deployment considerations

## Migration Strategy

1. Create TypeORM entities matching existing schema
2. Generate initial migration
3. Implement repository layer with transaction support
4. Update services to use new repositories
5. Test chip conservation with new database
6. Deploy with new database, migrate existing data if needed
