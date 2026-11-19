# Movie night: what is on tonight, and a calendar invite

Today's films in a Moldovan city's cinemas with their ratings, filtered by genre, audio language and hour, and an
`.ics` invitation (with a reminder an hour before) for the session you pick. Node 18+, no dependencies.

**Who it is for:** couples and friends deciding at 17:00 what to see tonight, office event organisers, anyone who
wants "Romanian audio, after 18:00" in one line.

Real output from the live run on 19 Nov 2026:

```
$ node movie-night.js --city Chișinău
Cinema 2026-11-19 · Chișinău
 1. În inima sălbăticiei (2026) ★ 7.7
    10:30 Mall ru · 21:30 Mall ru
 2. Ramayana: Rise of a Legend (2026) ★ 7.5
    17:50 Mall ru
 ...
 6. Badanta (2026) new
    10:10 Mall ro · 11:10 Mall ro · 13:10 Mall ro · 15:10 Mall ro · 17:10 Mall ro · 19:10 Mall ro · 21:10 Mall ro · 22:10 Mall ro
 ...
Data: Satelit (satelit.md)

$ node movie-night.js --city Chișinău --genre animaț
Cinema 2026-11-19 · Chișinău · animaț
 1. Shaun the Sheep: The Beast of Mossy Bottom (2026) ★ 7.3  Animaţie, SF, Comedie, Familie
    11:50 Loteanu

$ node movie-night.js --city Chișinău --after 18:00 --lang ro --pick 1 --at 19:10
Cinema 2026-11-19 · Chișinău · audio ro
 1. Badanta (2026) new
    19:10 Mall ro · 21:10 Mall ro · 22:10 Mall ro
 2. Vacanță all inclusive (2026) new
    20:30 Mall ro

Badanta, 2026-11-19 19:10, Cineplex Mall Sala 2: invitation written to movie-night.ics

$ node movie-night.js --city Bălți --genre SF
 1. Dune (2021) ★ 7.8  SF, Aventuri
    10:40 Balti ru · 16:00 Balti ru
```

"new" marks a film without a rating yet (often a new local film).

## Run it in 3 commands

```sh
cd satelit-examples/movie-night
export SATELIT_API_KEY=sat_live_...
node movie-night.js --city Chișinău --after 18:00
```

| Option | |
|---|---|
| `--city` | `Chișinău`, `Bălți`; empty: every city |
| `--after HH:MM` | sessions from this hour |
| `--lang ro` | audio language of the session (`ro`, `ru`, `en`) |
| `--genre` | part of a genre's name, in Romanian, any diacritics (`anim`, `comedie`, `SF`) |
| `--pick N [--at HH:MM]` | write an invitation for film N of the list (its first session, or the one at that hour) |
| `--out file.ics` | where to write it (default `movie-night.ics`) |

## Credits and cache

Every Movies call costs 40 credits, so answers are cached on disk in `.cache/`:

| Answer | Route | Credits | Kept |
|---|---|---|---|
| the day's programme of a city | `/movies/cinemas/today` | 40 | 2 h |
| a film's genres (only with `--genre`) | `/movies/titles/{id}` | 40 per film | 30 days |

A first `--genre` run in Chișinău (9 films that day) costs about 40 + 7 × 40; every run in the next hours costs 0,
and the genre cards serve the whole run of a film. When the API fails, the cached copy is shown.

## Schedule it

Warm the cache before people ask, e.g. at 16:00, and post the list somewhere:

```cron
0 16 * * * cd /opt/movie-night && SATELIT_API_KEY=sat_live_... node movie-night.js --city Chișinău --after 18:00 > tonight.txt
```

## Tests

```sh
node --test      # a fake API: grouping across cinemas, films without a catalogue id, filters, cache, .ics
```

## Pe scurt (română)

Filmele de azi într-un oraș, cu rating, filtrate după gen, limba audio și oră, plus o invitație `.ics` pentru
seanța aleasă. Fiecare apel Movies costă 40 de credite, așa că totul stă în cache pe disc.
