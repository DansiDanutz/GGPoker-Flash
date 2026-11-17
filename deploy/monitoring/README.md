# Monitoring (Prometheus + Grafana + blackbox)

Host-only stack on Dexter at `/opt/monitoring` (compose project `monitoring`, containers
`nervix-prometheus`, `nervix-grafana`, `nervix-blackbox`). The files here mirror the live
ones so the configuration survives losing the host.

## What is watched

- `https://dangg.live/healthz` — blackbox `http_2xx` probe (critical alert after 2 minutes)
- `https://dangg.live` — TLS probe; `probe_ssl_earliest_cert_expiry` drives a 14-day warning
- `https://danslab.vercel.app/OpenPoker-roadmap` — the daily roadmap page
- Nervix API and site, plus Prometheus itself

Alerts are evaluated by Prometheus and shown in Grafana; there is no Alertmanager on this
host, so nothing is paged. Hermes covers delivery gaps separately (backup freshness, deploy
drift, disk guard).

## Files

| File | Purpose |
|---|---|
| `prometheus.yml` | scrape jobs + `rule_files` mount |
| `rules.yml` | alert rules (group `dangro`) |
| `dangro-dashboard.json` | provisioned Grafana dashboard `DanGG — production` (`dangro-prod`) |

## Apply

```bash
ssh dexter
sudo cp prometheus.yml rules.yml /opt/monitoring/
sudo chmod 644 /opt/monitoring/rules.yml /opt/monitoring/prometheus.yml
sudo cp dangro-dashboard.json /opt/monitoring/grafana/provisioning/dashboards/json/dangro.json
sudo chown root:root /opt/monitoring/rules.yml /opt/monitoring/prometheus.yml
cd /opt/monitoring && sudo docker compose up -d prometheus grafana
```

`rules.yml` **must be world-readable**: Prometheus runs as a non-root user and crash-loops
with `permission denied` on a `600` mount.

Verify:

```bash
curl -sS http://127.0.0.1:9090/api/v1/targets | grep -o '"health":"up"' | wc -l
curl -sS http://127.0.0.1:9090/api/v1/rules   | head -c 200
curl -sS -u "admin:$GRAFANA_ADMIN_PASSWORD" 'http://127.0.0.1:3003/api/search?query=DanGG'
```

All monitoring ports are bound to `127.0.0.1` — Docker publishes bypass UFW, so never
publish these on `0.0.0.0`.
