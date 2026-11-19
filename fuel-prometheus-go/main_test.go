package main

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const fuelJSON = `{"data":{"date":"2026-11-19","cap":{"a95":28.08,"diesel":33.46},
"range":{"a95":{"min":27.9,"max":28.8},"diesel":{"min":33.25,"max":34.14},"lpg":{"min":18.6,"max":19.2}},
"networks":[{"key":"lukoil","name":"Lukoil","stations":103,"stale":false,"prices":{"a95":28.08,"diesel":33.46,"lpg":18.95}},
{"key":"old","name":"Old \"Q\"","stations":1,"stale":true,"prices":{"a95":30}}]},"meta":{}}`

const ratesJSON = `{"data":[{"code":"EUR","value":20.1411,"nominal":1,"change_7d_pct":-0.1},
{"code":"RUB","value":2.5,"nominal":10,"change_7d_pct":0.4}],"meta":{"attribution":"Sursa: BNM"}}`

func fakeAPI(t *testing.T, calls *int32, fail *atomic.Bool) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(calls, 1)
		if fail.Load() || r.Header.Get("Authorization") != "Bearer sat_live_test" {
			w.WriteHeader(503)
			w.Write([]byte(`{"error":{"code":"busy","message":"x"}}`))
			return
		}
		w.Header().Set("X-Credits-Remaining", "299000")
		switch r.URL.Path {
		case "/v1/fuel":
			w.Write([]byte(fuelJSON))
		case "/v1/rates":
			w.Write([]byte(ratesJSON))
		default:
			w.WriteHeader(404)
		}
	}))
}

func scrape(e *Exporter) string {
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest("GET", "/metrics", nil))
	return rec.Body.String()
}

func TestMetrics(t *testing.T) {
	var calls int32
	var fail atomic.Bool
	srv := fakeAPI(t, &calls, &fail)
	defer srv.Close()
	e := &Exporter{API: srv.URL + "/v1", Key: "sat_live_test", Refresh: time.Hour, Client: srv.Client()}
	out := scrape(e)
	for _, want := range []string{
		`satelit_up 1`,
		`satelit_fuel_price_lei{network="lukoil",name="Lukoil",fuel="a95"} 28.08`,
		`satelit_fuel_cap_lei{fuel="diesel"} 33.46`,
		`satelit_fuel_min_lei{fuel="lpg"} 18.6`,
		`satelit_rate_mdl{code="EUR"} 20.1411`,
		`satelit_rate_mdl{code="RUB"} 0.25`,
		`satelit_credits_remaining 299000`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in\n%s", want, out)
		}
	}
	if strings.Contains(out, `network="old"`) {
		t.Error("a stale network must be left out")
	}
	// Every line is a comment or `name{labels} value`, the text format Prometheus reads.
	line := regexp.MustCompile(`^[a-z_][a-z0-9_]*(\{([a-z_]+="([^"\\]|\\.)*",?)+\})? -?[0-9.e+]+$`)
	sc := bufio.NewScanner(strings.NewReader(out))
	for sc.Scan() {
		if l := sc.Text(); !strings.HasPrefix(l, "# ") && !line.MatchString(l) {
			t.Errorf("bad exposition line %q", l)
		}
	}
}

func TestCacheAndFailure(t *testing.T) {
	var calls int32
	var fail atomic.Bool
	srv := fakeAPI(t, &calls, &fail)
	defer srv.Close()
	e := &Exporter{API: srv.URL + "/v1", Key: "sat_live_test", Refresh: time.Hour, Client: srv.Client()}
	for i := 0; i < 10; i++ {
		scrape(e)
	}
	if calls != 2 {
		t.Fatalf("10 scrapes made %d API calls, want 2", calls)
	}
	fail.Store(true)
	e.fetchedAt = time.Time{} // as if the hour had passed
	out := scrape(e)
	if !strings.Contains(out, "satelit_up 0") || !strings.Contains(out, `satelit_rate_mdl{code="EUR"} 20.1411`) {
		t.Fatalf("a failed refresh must keep the last numbers and report up 0:\n%s", out)
	}
}

func TestLabelEscaping(t *testing.T) {
	if got := label(`a"b\c`); got != `a\"b\\c` {
		t.Fatal(got)
	}
}

// The dashboard must parse and only ask for metrics the exporter writes.
func TestDashboard(t *testing.T) {
	raw, err := os.ReadFile("grafana-dashboard.json")
	if err != nil {
		t.Fatal(err)
	}
	var d struct {
		Title  string
		Panels []struct {
			ID      int
			Type    string
			Targets []struct{ Expr string }
		}
	}
	if err := json.Unmarshal(raw, &d); err != nil {
		t.Fatal(err)
	}
	var calls int32
	var fail atomic.Bool
	srv := fakeAPI(t, &calls, &fail)
	defer srv.Close()
	out := scrape(&Exporter{API: srv.URL + "/v1", Key: "sat_live_test", Refresh: time.Hour, Client: srv.Client()})
	metric := regexp.MustCompile(`satelit_[a-z0-9_]+`)
	ids := map[int]bool{}
	for _, p := range d.Panels {
		if ids[p.ID] {
			t.Errorf("panel id %d twice", p.ID)
		}
		ids[p.ID] = true
		for _, tg := range p.Targets {
			for _, m := range metric.FindAllString(tg.Expr, -1) {
				if !strings.Contains(out, "\n"+m) {
					t.Errorf("panel %d asks for %s, which the exporter never writes", p.ID, m)
				}
			}
		}
	}
	if len(d.Panels) < 5 {
		t.Fatal("dashboard lost its panels")
	}
}
