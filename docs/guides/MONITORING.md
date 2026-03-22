# Monitoring & Observability Guide

This guide covers the Prometheus + Grafana monitoring stack for the poker server.

## Architecture

```
┌─────────────────┐     scrape      ┌─────────────────┐
│  Poker Server   │ ◄────────────── │   Prometheus    │
│   :3000         │   /api/v1/      │     :9090       │
│                 │   metrics       │                 │
└─────────────────┘                 └────────┬────────┘
                                             │
                         ┌───────────────────┼───────────────────┐
                         │                   │                   │
                         ▼                   ▼                   ▼
                 ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
                 │    Grafana    │   │  Alertmanager │   │  Alert Rules  │
                 │     :3002     │   │     :9093     │   │  (YAML)       │
                 └───────────────┘   └───────┬───────┘   └───────────────┘
                                             │
                                             ▼
                                     ┌───────────────┐
                                     │    Email      │
                                     │  (SMTP)       │
                                     └───────────────┘
```

## Quick Start

### Start Monitoring Stack (Local Development)

```bash
# Start postgres, redis, poker-server + monitoring stack
docker compose --profile monitoring up -d

# Or start just the monitoring services (if poker-server runs locally)
docker compose --profile monitoring up -d prometheus grafana alertmanager
```

### Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Poker Server | http://localhost:3000 | - |
| Prometheus | http://localhost:9090 | - |
| Grafana | http://localhost:3002 | admin / `$GRAFANA_ADMIN_PASSWORD` |
| Alertmanager | http://localhost:9093 | - |

### Verify Metrics

```bash
# Check if metrics are being scraped
curl http://localhost:3000/api/v1/metrics

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Run full monitoring verification
npm run test:monitoring

# Quick check (metrics endpoint only)
npm run test:monitoring:quick
```

**Note:** The default Prometheus config uses `host.docker.internal:3000` to reach a locally-running poker server. When running the full stack in Docker, change `monitoring/prometheus/prometheus.yml` to use `poker-server:3000` instead.

## Configuration

### Environment Variables

Copy `.env.example` and configure these for production:

```bash
# Grafana
GRAFANA_ADMIN_PASSWORD=your-secure-password
GRAFANA_ROOT_URL=https://grafana.yourcompany.com
```

### Configure Email Alerts

Edit `monitoring/alertmanager/alertmanager.yml` directly for production:

```yaml
global:
  smtp_smarthost: "smtp.gmail.com:587"
  smtp_from: "alerts@yourcompany.com"
  smtp_auth_username: "alerts@yourcompany.com"
  smtp_auth_password: "your-app-password"  # Gmail App Password
  smtp_require_tls: true

receivers:
  - name: "email-critical"
    email_configs:
      - to: "oncall@yourcompany.com"
        # ...
```

**Gmail Setup:**
1. Enable 2-Factor Authentication on your Google account
2. Go to https://myaccount.google.com/apppasswords
3. Generate an App Password for "Mail"
4. Use that password in `smtp_auth_password`

### File Locations

```
monitoring/
├── prometheus/
│   ├── prometheus.yml        # Scrape configuration
│   └── alert.rules.yml       # Alerting rules
├── alertmanager/
│   └── alertmanager.yml      # Alert routing & email config
└── grafana/
    ├── provisioning/
    │   ├── datasources/      # Auto-configure Prometheus
    │   └── dashboards/       # Auto-load dashboards
    └── dashboards/
        └── poker-overview.json  # Main dashboard
```

## Dashboard Overview

The **Poker Server Overview** dashboard includes:

### Overview Row
- **Active Games** - Currently running games
- **Active Tournaments** - In-progress tournaments
- **Connected Bots** - Registered bot connections
- **WebSocket Connections** - Active WebSocket clients
- **Total Hands Dealt** - Cumulative hand count
- **Tournaments Completed** - Finished tournaments

### HTTP Metrics Row
- **Request Rate** - Requests per second by status code (2xx/4xx/5xx)
- **Error Rate** - 5xx error percentage (gauge)
- **Response Time Percentiles** - P50, P95, P99 latency

### Game & Bot Metrics Row
- **Hands Dealt Rate** - Hands per minute
- **Bot Actions by Type** - fold/check/call/raise/bet breakdown
- **Bot Errors by Type** - Error categorization

### Infrastructure Row
- **Memory Usage** - RSS and heap memory
- **Database Pool** - Connection pool utilization
- **Bot Response Time** - P50/P95 latency

## Alerting

### Active Alerts

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| ServiceDown | Target unreachable > 1m | Critical | Check poker-server container, network |
| HighErrorRate | 5xx > 1% for 5m | Critical | Check logs, recent deployments |
| HighLatency | P95 > 1s for 5m | Warning | Check DB queries, bot timeouts |
| HighMemoryUsage | RSS > 80% of 512MB | Warning | Check for memory leaks, restart |
| BotErrorSpike | Error rate elevated | Warning | Check bot health, circuit breakers |
| DatabasePoolExhausted | Pool > 80% utilized | Warning | Increase pool size, check queries |
| WebSocketConnectionsDrop | > 50% drop in 5m | Warning | Check for network issues |
| TournamentStuck | No hands for 10m | Warning | Check game state, bot responses |

### Test Alerts

```bash
# Trigger a test alert (requires amtool)
docker exec poker-alertmanager amtool alert add \
  alertname=TestAlert \
  severity=warning \
  instance=test \
  --annotation.summary="Test alert" \
  --annotation.description="This is a test alert"
```

### Silence Alerts

```bash
# Silence all warnings for 1 hour
docker exec poker-alertmanager amtool silence add \
  severity=warning \
  --duration=1h \
  --comment="Maintenance window"
```

## Adding Custom Metrics

### 1. Define in `metrics.module.ts`

```typescript
makeCounterProvider({
  name: "poker_custom_metric_total",
  help: "Description of what this counts",
  labelNames: ["label1"],
}),
```

### 2. Inject in `metrics.service.ts`

```typescript
@InjectMetric("poker_custom_metric_total")
public readonly customMetric: Counter<string>,

incrementCustomMetric(label1: string): void {
  this.customMetric.inc({ label1 });
}
```

### 3. Add to Dashboard

1. Open Grafana → Poker Server Overview
2. Click "Add panel"
3. Query: `poker_custom_metric_total`
4. Save dashboard (it will persist in the JSON file)

## Adding Custom Alerts

Edit `monitoring/prometheus/alert.rules.yml`:

```yaml
- alert: MyCustomAlert
  expr: my_metric > 100
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Custom alert triggered"
    description: "Value is {{ $value }}"
```

Reload Prometheus:

```bash
curl -X POST http://localhost:9090/-/reload
```

## Production Deployment

### Cloud Monitoring Options

For production, consider managed services:

| Provider | Prometheus | Grafana | Alerting |
|----------|------------|---------|----------|
| AWS | Amazon Managed Prometheus | Amazon Managed Grafana | SNS |
| GCP | Cloud Monitoring | - | Cloud Alerting |
| Grafana Cloud | ✓ | ✓ | ✓ |
| Datadog | ✓ | ✓ | ✓ |

### Self-Hosted Production Checklist

- [ ] Set strong `GRAFANA_ADMIN_PASSWORD`
- [ ] Configure SMTP with real credentials
- [ ] Set up SSL/TLS termination (reverse proxy)
- [ ] Configure data retention (`--storage.tsdb.retention.time`)
- [ ] Set up backup for Prometheus data volume
- [ ] Create additional alert recipients (PagerDuty, Slack, etc.)
- [ ] Set up Grafana authentication (LDAP, OAuth, etc.)

### Prometheus Remote Write (Optional)

For long-term storage, configure remote write to services like Grafana Cloud, Thanos, or Cortex:

```yaml
# In prometheus.yml
remote_write:
  - url: "https://prometheus-us-central1.grafana.net/api/prom/push"
    basic_auth:
      username: "<user>"
      password: "<api-key>"
```

## Troubleshooting

### Prometheus not scraping

```bash
# Check targets page
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets'

# Common issues:
# - poker-server not reachable from prometheus container
# - Metrics endpoint returns error
# - Network connectivity between containers
```

### Alerts not firing

```bash
# Check alert rules
curl http://localhost:9090/api/v1/rules | jq '.data.groups'

# Check Alertmanager receivers
curl http://localhost:9093/api/v2/status | jq '.config'
```

### Email not sending

```bash
# Test SMTP connectivity from alertmanager container
docker exec poker-alertmanager wget -q -O- http://localhost:9093/-/healthy

# Check alertmanager logs
docker logs poker-alertmanager

# Common issues:
# - Gmail requires App Password (not regular password)
# - SMTP port blocked by firewall
# - Environment variables not set
```

### Grafana dashboard not loading

```bash
# Check provisioning logs
docker logs poker-grafana | grep -i error

# Verify dashboard JSON syntax
cat monitoring/grafana/dashboards/poker-overview.json | jq .

# Check datasource
curl -u admin:$GRAFANA_ADMIN_PASSWORD \
  http://localhost:3002/api/datasources
```

## Useful PromQL Queries

```promql
# Request rate by endpoint
sum by (path) (rate(poker_http_requests_total[5m]))

# Error rate percentage
sum(rate(poker_http_requests_total{status=~"5.."}[5m])) 
/ sum(rate(poker_http_requests_total[5m])) * 100

# 95th percentile latency
histogram_quantile(0.95, 
  sum(rate(poker_http_request_duration_seconds_bucket[5m])) by (le)
)

# Bot success rate
1 - (sum(rate(poker_bot_errors_total[5m])) 
     / sum(rate(poker_bot_actions_total[5m])))

# Hands per minute
rate(poker_hands_dealt_total[1m]) * 60
```
