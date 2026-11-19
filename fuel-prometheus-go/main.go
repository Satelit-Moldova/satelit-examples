// Command satelit-exporter serves Moldova's fuel prices and BNM exchange rates as Prometheus metrics.
//
//	SATELIT_API_KEY=sat_live_... go run . -listen 127.0.0.1:9418
//
// Prometheus may scrape it every 15 s: the exporter asks Satelit at most once per -refresh (1 h by
// default), so a day costs 48 credits (/fuel 1 + /rates 1, 24 times).
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type fuelAnswer struct {
	Data struct {
		Date     string                                `json:"date"`
		Cap      map[string]float64                    `json:"cap"`
		Range    map[string]struct{ Min, Max float64 } `json:"range"`
		Networks []struct {
			Key      string             `json:"key"`
			Name     string             `json:"name"`
			Stations int                `json:"stations"`
			Stale    bool               `json:"stale"`
			Prices   map[string]float64 `json:"prices"`
		} `json:"networks"`
	} `json:"data"`
}

type ratesAnswer struct {
	Data []struct {
		Code      string  `json:"code"`
		Value     float64 `json:"value"`
		Nominal   float64 `json:"nominal"`
		Change7d  float64 `json:"change_7d_pct"`
		Change30d float64 `json:"change_30d_pct"`
	} `json:"data"`
	Meta struct {
		Attribution string `json:"attribution"`
	} `json:"meta"`
}

// Exporter keeps the last good answers and renders them on every scrape.
type Exporter struct {
	API, Key string
	Refresh  time.Duration
	Client   *http.Client

	mu        sync.Mutex
	fuel      *fuelAnswer
	rates     *ratesAnswer
	fetchedAt time.Time
	lastOK    time.Time
	up        bool
	credits   string // X-Credits-Remaining of the last answer
}

func (e *Exporter) get(path string, v any) error {
	req, err := http.NewRequest("GET", e.API+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+e.Key)
	req.Header.Set("Accept", "application/json")
	res, err := e.Client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return err
	}
	if res.StatusCode != 200 {
		var apiErr struct {
			Error struct{ Code, Message string }
		}
		_ = json.Unmarshal(body, &apiErr)
		return fmt.Errorf("%s: %d %s", path, res.StatusCode, apiErr.Error.Code)
	}
	if c := res.Header.Get("X-Credits-Remaining"); c != "" {
		e.credits = c
	}
	return json.Unmarshal(body, v)
}

// refresh asks Satelit again once the cached answers are older than Refresh.
// On failure the old numbers stay and satelit_up drops to 0.
func (e *Exporter) refresh() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.fetchedAt.IsZero() && time.Since(e.fetchedAt) < e.Refresh {
		return
	}
	e.fetchedAt = time.Now()
	var f fuelAnswer
	var r ratesAnswer
	if err := e.get("/fuel", &f); err != nil {
		log.Printf("satelit: %v", err)
		e.up = false
		return
	}
	if err := e.get("/rates", &r); err != nil {
		log.Printf("satelit: %v", err)
		e.up = false
		return
	}
	e.fuel, e.rates, e.up, e.lastOK = &f, &r, true, time.Now()
}

func label(s string) string {
	return strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`).Replace(s)
}

func num(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }

// Render writes the Prometheus text exposition format.
func (e *Exporter) Render(w io.Writer) {
	e.mu.Lock()
	defer e.mu.Unlock()
	head := func(name, kind, help string) { fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s %s\n", name, help, name, kind) }

	up := 0.0
	if e.up {
		up = 1
	}
	head("satelit_up", "gauge", "1 if the last refresh from api.satelit.md worked.")
	fmt.Fprintf(w, "satelit_up %s\n", num(up))
	if !e.lastOK.IsZero() {
		head("satelit_last_success_timestamp_seconds", "gauge", "When the numbers were last read.")
		fmt.Fprintf(w, "satelit_last_success_timestamp_seconds %d\n", e.lastOK.Unix())
	}
	if c, err := strconv.ParseFloat(e.credits, 64); err == nil {
		head("satelit_credits_remaining", "gauge", "Credits left on the key this period (X-Credits-Remaining).")
		fmt.Fprintf(w, "satelit_credits_remaining %s\n", num(c))
	}
	if e.fuel != nil {
		d := e.fuel.Data
		head("satelit_fuel_price_lei", "gauge", "Pump price per litre by network and fuel (ANRE).")
		for _, n := range d.Networks {
			if n.Stale {
				continue // a network that did not report today
			}
			fuels := make([]string, 0, len(n.Prices))
			for f := range n.Prices {
				fuels = append(fuels, f)
			}
			sort.Strings(fuels)
			for _, f := range fuels {
				if n.Prices[f] <= 0 {
					continue // 0 or null: the network does not sell this fuel
				}
				fmt.Fprintf(w, "satelit_fuel_price_lei{network=\"%s\",name=\"%s\",fuel=\"%s\"} %s\n",
					label(n.Key), label(n.Name), label(f), num(n.Prices[f]))
			}
		}
		head("satelit_fuel_cap_lei", "gauge", "ANRE's price cap per litre.")
		for _, f := range []string{"a95", "diesel"} {
			if v, ok := d.Cap[f]; ok {
				fmt.Fprintf(w, "satelit_fuel_cap_lei{fuel=\"%s\"} %s\n", f, num(v))
			}
		}
		head("satelit_fuel_min_lei", "gauge", "Lowest price among the networks.")
		for _, f := range []string{"a95", "diesel", "lpg"} {
			if v, ok := d.Range[f]; ok {
				fmt.Fprintf(w, "satelit_fuel_min_lei{fuel=\"%s\"} %s\n", f, num(v.Min))
			}
		}
	}
	if e.rates != nil {
		head("satelit_rate_mdl", "gauge", "BNM official rate: MDL for one unit. Sursa: Banca Nationala a Moldovei, bnm.md, CC BY 4.0.")
		for _, r := range e.rates.Data {
			if r.Nominal > 0 {
				fmt.Fprintf(w, "satelit_rate_mdl{code=\"%s\"} %s\n", label(r.Code), num(math.Round(r.Value/r.Nominal*1e6)/1e6))
			}
		}
		head("satelit_rate_change_7d_percent", "gauge", "Change of the BNM rate over 7 days, percent.")
		for _, r := range e.rates.Data {
			fmt.Fprintf(w, "satelit_rate_change_7d_percent{code=\"%s\"} %s\n", label(r.Code), num(r.Change7d))
		}
	}
}

func (e *Exporter) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	e.refresh()
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	e.Render(w)
}

func main() {
	listen := flag.String("listen", "127.0.0.1:9418", "address to serve /metrics on")
	refresh := flag.Duration("refresh", time.Hour, "how often to ask Satelit (fuel and rates change daily)")
	flag.Parse()
	key := os.Getenv("SATELIT_API_KEY")
	if key == "" {
		log.Fatal("set SATELIT_API_KEY")
	}
	api := os.Getenv("SATELIT_API_URL")
	if api == "" {
		api = "https://api.satelit.md/v1"
	}
	e := &Exporter{API: api, Key: key, Refresh: *refresh, Client: &http.Client{Timeout: 10 * time.Second}}
	http.Handle("/metrics", e)
	http.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintln(w, `<a href="/metrics">metrics</a> · Data: <a href="https://satelit.md">Satelit</a>`)
	})
	log.Printf("serving http://%s/metrics", *listen)
	srv := &http.Server{Addr: *listen, ReadHeaderTimeout: 5 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
