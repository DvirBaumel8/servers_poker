# Deployment Guide

## Prerequisites

- Docker and Docker Compose
- PostgreSQL 15+ (or managed service)
- Node.js 22+ (for local development)
- npm 10+

## Environment Configuration

Copy the example environment file and configure:

```bash
cp .env.example .env
```

### Required Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=secure_password_here
DB_NAME=poker
DB_SSL=false

# Authentication
JWT_SECRET=generate_a_long_random_string_here

# Server
PORT=3000
NODE_ENV=production
```

### Production Variables

```env
# Production Database
DB_HOST=your-db-host.rds.amazonaws.com
DB_SSL=true
DB_POOL_SIZE=50

# Security
JWT_SECRET=<64+ character random string>
CORS_ORIGINS=https://your-domain.com
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
```

## Local Development

### With Docker Compose

```bash
# Start PostgreSQL and the server
docker-compose up -d

# View logs
docker-compose logs -f poker-server

# Stop
docker-compose down
```

### Without Docker

```bash
# Install dependencies
npm install

# Start PostgreSQL (manually or via homebrew/apt)
# Create database
createdb poker

# Build and run
npm run build
npm run start
```

## Production Deployment

### Docker

Build the production image:

```bash
docker build -t poker-server:latest .
```

Run with environment:

```bash
docker run -d \
  --name poker-server \
  -p 3000:3000 \
  --env-file .env.production \
  poker-server:latest
```

### Health Check

The container includes a health check:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

## Database Setup

### Database Migrations

The application uses TypeORM migrations for schema management. **Never use `synchronize: true` in production.**

#### First-Time Setup

```bash
# Start PostgreSQL (if using Docker)
docker-compose up -d postgres

# Run migrations to create all tables
npm run migration:run
```

#### Using Docker Compose

```bash
# Run migrations in container
docker-compose --profile migrate up migrate
```

#### Migration Commands

```bash
# Run pending migrations
npm run migration:run

# Show migration status
npm run migration:show

# Revert last migration
npm run migration:revert

# Generate new migration (after entity changes)
npm run migration:generate src/migrations/YourMigrationName

# Drop all tables (DANGEROUS - dev only)
npm run db:drop
```

#### Creating New Migrations

When you modify entities, generate a new migration:

```bash
# 1. Make changes to entity files in src/entities/
# 2. Generate migration
npm run migration:generate src/migrations/AddNewColumn

# 3. Review the generated migration in src/migrations/
# 4. Run the migration
npm run migration:run

# 5. Commit both entity and migration files
```

### Backup Strategy

```bash
# Daily backup
pg_dump -h $DB_HOST -U $DB_USERNAME $DB_NAME > backup_$(date +%Y%m%d).sql

# Point-in-time recovery with managed services (AWS RDS, etc.)
```

## Scaling

### Horizontal Scaling

The application is stateless and can be scaled horizontally:

```yaml
# docker-compose.scale.yml
services:
  poker-server:
    deploy:
      replicas: 3
```

### Load Balancing

Use nginx or a cloud load balancer:

```nginx
upstream poker {
    server poker-1:3000;
    server poker-2:3000;
    server poker-3:3000;
}

server {
    listen 80;
    
    location / {
        proxy_pass http://poker;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### WebSocket Sticky Sessions

For WebSocket connections, enable sticky sessions:

```nginx
upstream poker {
    ip_hash;  # Sticky sessions
    server poker-1:3000;
    server poker-2:3000;
}
```

## Monitoring

### Logs

Application logs to stdout in JSON format:

```bash
docker logs poker-server | jq '.'
```

### Metrics (Recommended)

Add Prometheus metrics endpoint:

```bash
# Install prom-client
npm install prom-client
```

### Alerts

Set up alerts for:
- Chip conservation violations (CRITICAL)
- High error rate (WARNING)
- Database connection failures (CRITICAL)
- Memory usage > 80% (WARNING)

## Security Checklist

Before production deployment:

- [ ] Strong JWT_SECRET (64+ characters)
- [ ] Database password is strong and unique
- [ ] SSL/TLS enabled for database connection
- [ ] CORS configured for your domain only
- [ ] Rate limiting enabled
- [ ] Firewall rules configured
- [ ] No debug logging in production
- [ ] Secrets not in version control

## Rollback Procedure

1. Stop new deployments
2. Restore previous Docker image
3. If database migration failed, restore from backup
4. Verify health checks pass
5. Resume traffic

```bash
# Quick rollback
docker stop poker-server
docker run -d --name poker-server poker-server:previous-tag
```

## Frontend Deployment

### Build

```bash
cd frontend
npm install
npm run build
```

### Serve

The built files are in `frontend/dist/`. Serve via:

- nginx
- CDN (CloudFront, Cloudflare)
- Static hosting (Vercel, Netlify)

### nginx Configuration

```nginx
server {
    listen 80;
    root /var/www/poker/dist;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:3000;
    }
    
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```
