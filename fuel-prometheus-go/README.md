# Prometheus exporter and Grafana dashboard: fuel and BNM rates

A small Go program that serves Moldova's pump prices (every network, a95 / diesel / LPG, ANRE's caps) and BNM's
exchange rates as Prometheus metrics, plus a Grafana dashboard for them. Standard library only.

**Who it is for:** fleet and logistics teams who already watch their business in Grafana, and anyone who wants
30 days of fuel prices on a graph without writing a scraper.

Real `/metrics` from the live run on 19 Nov 2026 (trimmed; 81 networks reported that day):

```
satelit_up 1
satelit_last_success_timestamp_seconds 1795100175
satelit_credits_remaining 298908
satelit_fuel_price_lei{network="lukoil",name="Lukoil",fuel="a95"} 28.08
satelit_fuel_price_lei{network="tlx",name="TLX",fuel="a95"} 27.9
satelit_fuel_price_lei{network="tlx",name="TLX",fuel="diesel"} 33.25
satelit_fuel_cap_lei{fuel="a95"} 28.08
satelit_fuel_cap_lei{fuel="diesel"} 33.46
satelit_fuel_min_lei{fuel="lpg"} 18.6
satelit_rate_mdl{code="EUR"} 20.1411
satelit_rate_mdl{code="USD"} 18.3744
satelit_rate_mdl{code="RUB"} 0.2232
satelit_rate_change_7d_percent{code="USD"} 1.5
```

## Run it in 3 commands

```sh
cd satelit-examples/fuel-prometheus-go
export SATELIT_API_KEY=sat_live_...
go run . -listen 127.0.0.1:9418          # then open http://127.0.0.1:9418/metrics
```

Requirements: Go (go.mod asks 1.22, tested with 1.27.0). Build a binary with `go build -o satelit-exporter .`.

## Metrics

| Metric | Labels | Meaning |
|---|---|---|
| `satelit_fuel_price_lei` | `network`, `name`, `fuel` | pump price per litre. Networks marked stale that day are left out |
| `satelit_fuel_cap_lei` | `fuel` | ANRE's cap (a95, diesel) |
| `satelit_fuel_min_lei` | `fuel` | lowest price among the networks |
| `satelit_rate_mdl` | `code` | MDL for one unit (nominal already divided) |
| `satelit_rate_change_7d_percent` | `code` | change over 7 days |
| `satelit_up` | | 1 when the last refresh worked. On failure the old numbers stay and this drops to 0 |
| `satelit_credits_remaining` | | `X-Credits-Remaining` of the last answer |

## Caching and credits

Prometheus may scrape every 15 s. The exporter asks Satelit at most once per `-refresh` (default `1h`): 2 credits
(`/fuel` 1 + `/rates` 1), so 48 a day. Fuel and rates change once a day; `-refresh 3h` is enough too. Every call
has a 10 s timeout.

## Prometheus and Grafana

```yaml
# prometheus.yml
scrape_configs:
  - job_name: satelit
    scrape_interval: 5m
    static_configs:
      - targets: ["127.0.0.1:9418"]
```

Grafana → **Dashboards → New → Import** → upload [`grafana-dashboard.json`](grafana-dashboard.json) and pick your
Prometheus data source. Panels: EUR, USD, lowest price of the chosen fuel, exporter health and credits. The fuel by
network against ANRE's cap. The cheapest networks today. BNM rates. A sources note (keep it: BNM's licence asks for
the line).

## Run it as a service

```ini
# /etc/systemd/system/satelit-exporter.service
[Service]
EnvironmentFile=/etc/satelit-exporter.env
ExecStart=/usr/local/bin/satelit-exporter -listen 127.0.0.1:9418 -refresh 1h
Restart=always
DynamicUser=yes
[Install]
WantedBy=multi-user.target
```

## Tests

```sh
go vet ./... && go test ./...     # a fake API (httptest): metrics, text format, cache, failure, dashboard queries
```

`TestDashboard` checks that the dashboard JSON parses and that every query asks for a metric the exporter writes.
The dashboard was not imported into a running Grafana for this release.

## Troubleshooting

- `satelit_up 0`: see the exporter's log line (`satelit: /fuel: 401 key_invalid`).
- Empty graphs: the first points appear after Prometheus' first scrapes. The time series grows from the day you start.

## Pe scurt (română)

Exporter Prometheus (Go, fără dependențe) pentru prețurile carburanților pe rețele, plafoanele ANRE și cursul BNM,
plus un dashboard Grafana. Întreabă Satelit cel mult o dată pe oră: 48 de credite pe zi.
