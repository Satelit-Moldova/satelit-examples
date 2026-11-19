# Google Sheets: rates, fuel and shop prices as formulas

Custom functions for Google Sheets, written in Apps Script:

| Formula | Returns | Credits (once per cache period) |
|---|---|---|
| `=SATELIT_RATE("EUR")` | MDL for one unit, BNM's official rate | 1, kept 6 h |
| `=SATELIT_FUEL("a95")` / `=SATELIT_FUEL("diesel"; "Petrom")` | lowest price among the networks, or one network's | 1, kept 3 h |
| `=SATELIT_PRICE("lapte 2.5%")` | one row: lowest in-stock price, shop, product | 5, kept 3 h |
| `=SATELIT_SOURCE("rates")` | the attribution line to keep near the numbers | 0 |

A menu **Satelit → Refresh data** forgets the cache and recalculates every `SATELIT_` cell.

**Who it is for:** finance and purchasing people who already live in a spreadsheet: price lists in lei and euro,
fuel budgets for a fleet, a family's shopping sheet.

Real results from the live run on 19 Nov 2026 (the same `Code.gs`, run under Node with `shim.js`):

```
=SATELIT_RATE("EUR")              ->  20.1411
=SATELIT_FUEL("a95")              ->  27.9
=SATELIT_FUEL("diesel", "Petrom") ->  33.46
=SATELIT_PRICE("lapte 2.5%")      ->  [[16.99,"MegaAlina","Lapte JLC 2.5% 1 l"]]
=SATELIT_PRICE("cafea lavazza")   ->  [[89.99,"Local","Cafea macinată Lavazza Crema e Gusto 250 g"]]
=SATELIT_RATE("XYZ")              ->  #ERROR! Unknown currency: XYZ
HTTP calls made: 6
```

## Install in 3 steps

1. In your sheet: **Extensions → Apps Script**. Replace `Code.gs` with this folder's `Code.gs`. In
   **Project Settings**, tick "Show appsscript.json" and paste this folder's `appsscript.json`.
2. **Project Settings → Script Properties → Add**: `SATELIT_API_KEY` = your key from the
   [console](https://developer.satelit.md/en/console/) ([plans](https://developer.satelit.md/en/pricing/)).
   The key stays in the script's properties, never in a cell. Anyone who can edit the script can read it, so share
   the sheet with edit rights only with people you would give the key to.
3. Reload the sheet, type `=SATELIT_RATE("EUR")` in a cell and allow the script once.

Keep `=SATELIT_SOURCE("rates")` (or the line it returns) on any sheet that shows BNM's rates: it is the licence's
condition.

## Caching and credits

Answers are kept in `CacheService` (6 h at most, Google's limit), as small values: the rates as one map, the fuel as
one map, each product query on its own. A sheet with 200 `SATELIT_RATE` cells costs 1 credit per 6 hours. Apps
Script does not let a custom function set a timeout; `UrlFetchApp` gives up on its own after Google's limit.

## Refresh on a schedule

Apps Script → **Triggers → Add trigger**: function `satelitRefresh`, time-driven, every day at 10:00 (BNM publishes
the day's rates in the morning).

## Test it without Google

`shim.js` loads `Code.gs` in a Node `vm` with small stand-ins for `UrlFetchApp`, `CacheService` and
`PropertiesService`:

```sh
node --test                                              # offline, fake answers
SATELIT_API_KEY=sat_live_... node run-gs.js 'SATELIT_RATE("EUR")' 'SATELIT_PRICE("lapte")'   # live
```

## Troubleshooting

- `#ERROR! Set SATELIT_API_KEY in Project Settings > Script Properties`: step 2.
- `#ERROR! Satelit 401 key_invalid: …`: the key was revoked or mistyped.
- A cell keeps an old number: use **Satelit → Refresh data**; Sheets only reruns a formula when its arguments change.

## Pe scurt (română)

Funcții pentru Google Sheets: `=SATELIT_RATE("EUR")`, `=SATELIT_FUEL("a95")`, `=SATELIT_PRICE("lapte")`. Cheia stă
în Script Properties, răspunsurile în CacheService (puține credite), meniul „Satelit → Refresh data” le
reîmprospătează.
