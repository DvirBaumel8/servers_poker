# Monitoring & Observability

This document describes the monitoring and observability features available in the Poker Tournament Server.

## Overview

The server includes the following monitoring capabilities:

| Feature | Endpoint/Tool | Purpose |
|---------|---------------|---------|
| Health Checks | `/api/v1/health/*` | Kubernetes readiness/liveness probes |
| Prometheus Metrics | `/metrics` | Time-series metrics for Prometheus |
| Structured Logging | stdout (JSON) | Production-ready logs for ELK/DataDog |
| Error Tracking | Sentry | Exception tracking and alerting |

## Health Checks

Health check endpoints are provided via `@nestjs/terminus` for Kubernetes and load balancer integration.

### Endpoints

| Endpoint | Purpose | Checks |
|----------|---------|--------|
| `GET /api/v1/health` | Basic health | Database, Memory |
| `GET /api/v1/health/ready` | Readiness probe | Database, Redis |
| `GET /api/v1/health/live` | Liveness probe | Memory heap |
| `GET /api/v1/health/detailed` | Full diagnostics | All checks + Disk |

### Example Response

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" }
  }
}
```

### Kubernetes Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: poker-server
          livenessProbe:
            httpGet:
              path: /api/v1/health/live
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/v1/health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
```

## Prometheus Metrics

Prometheus metrics are exposed at `/metrics` in the standard Prometheus text format.

### Available Metrics

#### HTTP Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `poker_http_requests_total` | Counter | method, path, status | Total HTTP requests |
| `poker_http_request_duration_seconds` | Histogram | method, path, status | Request duration |

#### Game Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `poker_active_games` | Gauge | - | Currently active games |
| `poker_active_tournaments` | Gauge | - | Currently active tournaments |
| `poker_hands_dealt_total` | Counter | - | Total hands dealt |

#### Bot Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `poker_connected_bots` | Gauge | - | Connected bots |
| `poker_bot_actions_total` | Counter | action_type, bot_id | Bot actions |
| `poker_bot_errors_total` | Counter | error_type, bot_id | Bot errors |
| `poker_bot_response_time_seconds` | Histogram | bot_id | Bot response time |

#### Tournament Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `poker_tournament_entries_total` | Counter | - | Tournament registrations |
| `poker_tournament_completions_total` | Counter | - | Completed tournaments |

#### Infrastructure Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `poker_websocket_connections` | Gauge | - | Active WebSocket connections |
| `poker_database_pool_size` | Gauge | - | DB pool size |
| `poker_database_pool_active` | Gauge | - | Active DB connections |

### Prometheus Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'poker-server'
    static_configs:
      - targets: ['poker-server:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Grafana Dashboard

Import the provided dashboard JSON from `docs/grafana-dashboard.json` or create panels for:

1. **Request Rate**: `rate(poker_http_requests_total[5m])`
2. **Error Rate**: `rate(poker_http_requests_total{status=~"5.."}[5m])`
3. **P95 Latency**: `histogram_quantile(0.95, rate(poker_http_request_duration_seconds_bucket[5m]))`
4. **Active Games**: `poker_active_games`
5. **Bot Response Time**: `histogram_quantile(0.95, rate(poker_bot_response_time_seconds_bucket[5m]))`

## Structured Logging

In production (`NODE_ENV=production`), logs are output as JSON for ingestion by log aggregators.

### Log Format

```json
{
  "level": "info",
  "time": 1679856000000,
  "service": "poker-engine",
  "environment": "production",
  "req": {
    "method": "POST",
    "url": "/api/v1/games/123/action"
  },
  "res": {
    "statusCode": 200
  },
  "responseTime": 45,
  "msg": "request completed"
}
```

### Log Levels

| Level | When Used |
|-------|-----------|
| `error` | Exceptions, failed operations |
| `warn` | Recoverable issues, deprecations |
| `info` | Request completion, state changes |
| `debug` | Detailed debugging (dev only) |

### ELK Stack Integration

Configure Filebeat to collect logs:

```yaml
# filebeat.yml
filebeat.inputs:
  - type: container
    paths:
      - /var/lib/docker/containers/*/*.log
    processors:
      - decode_json_fields:
          fields: ["message"]
          target: ""
          overwrite_keys: true

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "poker-logs-%{+yyyy.MM.dd}"
```

### DataDog Integration

Use the DataDog agent with JSON log parsing:

```yaml
# datadog.yaml
logs:
  - type: docker
    service: poker-engine
    source: nodejs
    log_processing_rules:
      - type: multi_line
        name: json_logs
        pattern: '^\{'
```

## Sentry Error Tracking

Sentry captures unhandled exceptions and provides alerting.

### Configuration

Set the `SENTRY_DSN` environment variable:

```bash
SENTRY_DSN=https://your-key@sentry.io/your-project
```

### What's Captured

- All 5xx errors
- Unhandled exceptions
- Request context (URL, method, headers)
- User context (when authenticated)
- Environment and release info

### Sensitive Data

The following are automatically stripped:
- Authorization headers
- Cookies
- Request bodies (by default)

### Alerting

Configure alerts in Sentry for:
- New issues
- Issue frequency spikes
- Specific error types (e.g., database connection failures)

## Docker Compose Monitoring Stack

For local development, you can run a full monitoring stack:

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3002:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana

volumes:
  grafana-data:
```

## Alerting Rules

Example Prometheus alerting rules:

```yaml
# alerts.yml
groups:
  - name: poker-server
    rules:
      - alert: HighErrorRate
        expr: rate(poker_http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High error rate detected

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(poker_http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High request latency detected

      - alert: DatabaseDown
        expr: up{job="poker-server"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: Poker server is down

      - alert: BotHighErrorRate
        expr: rate(poker_bot_errors_total[5m]) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High bot error rate
```

## Best Practices

1. **Set up alerts** for error rates, latency, and availability
2. **Use dashboards** to visualize trends over time
3. **Configure log retention** based on compliance requirements
4. **Test monitoring** in staging before production
5. **Document runbooks** for common alerts
