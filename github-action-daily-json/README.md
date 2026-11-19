# Daily JSON snapshot with GitHub Actions

A scheduled workflow that commits `data/rates.json` and `data/fuel.json` to your repository every day, with two
badges drawn from the numbers. A free static "API" for a site, a notebook or a spreadsheet that reads raw files from
GitHub, and a day-by-day history in git. Node 18+, no dependencies.

**Who it is for:** static sites (Hugo, Astro, Jekyll) that show today's rate, data journalists who want a history
in git, anyone who wants the numbers without running a server.

Real files from the live run on 19 Nov 2026:

```
$ node snapshot.js data
2026-11-19: EUR 20.1411, a95 from 27.9 lei -> data/
```

`data/rates.json` (trimmed):

```json
{
  "data": [
    { "code": "EUR", "name": "Euro", "value": 20.1411, "nominal": 1, "date": "2026-11-19", "change_7d_pct": -0.1, "change_30d_pct": 0.2 },
    { "code": "USD", "name": "Dolar SUA", "value": 18.3744, "nominal": 1, "date": "2026-11-19", "change_7d_pct": 1.5, "change_30d_pct": 2.5 }
  ],
  "updated_at": "2026-11-19T17:07:13+02:00",
  "attribution": "Sursa: Banca Națională a Moldovei, bnm.md, CC BY 4.0",
  "notice": "Aceleași date sunt gratuite la bnm.md.",
  "sources": [{ "name": "BNM", "url": "https://www.bnm.md/ro/content/ratele-de-schimb", "license": "CC BY 4.0" }],
  "data_by": "Satelit (satelit.md)"
}
```

and the badges `data/badge-eur.svg` ("EUR (BNM) | 20.1411 MDL") and `data/badge-a95.svg`
("benzină A95 | de la 27.90 lei"), ready for a README:

```markdown
![EUR](data/badge-eur.svg) ![A95](data/badge-a95.svg)
```

## Set it up in 3 steps

1. Copy `snapshot.js` to the root of your repository and `.github/workflows/daily.yml` to the same path there.
2. **Settings → Secrets and variables → Actions → New repository secret**: `SATELIT_API_KEY`, your key from the
   [console](https://developer.satelit.md/en/console/).
3. **Actions → Daily Satelit snapshot → Run workflow** once. After that it runs at 07:30 UTC every day.

The workflow commits only when a number changed (`git diff --cached --quiet`), so weekends without new BNM rates
leave no empty commits. The key lives only in the secret. The files hold no key.

## Credits

2 per run (`/rates` 1, `/fuel` 1): about 60 a month.

## Use the files

```js
const url = 'https://raw.githubusercontent.com/<you>/<repo>/main/data/rates.json';
const { data, attribution } = await (await fetch(url)).json();
```

Keep `attribution` next to the numbers wherever you show them, and the "Data: Satelit" credit.

## Tests

```sh
node --test      # a fake API: both files, both badges, escaping
```

The workflow file was checked to parse as YAML with the expected triggers and steps. It was run locally as
`node snapshot.js` against the live API, not on GitHub's runners.

## Pe scurt (română)

Un workflow GitHub Actions care salvează zilnic `data/rates.json` și `data/fuel.json` în repository, cu două
insigne SVG. Cheia stă în secretele repository-ului; 2 credite pe zi.
