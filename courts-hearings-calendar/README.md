# Court hearings in your calendar

Exports a company's upcoming court hearings in Moldova, or every future hearing of one case, to an `.ics` file that
Google Calendar, Outlook and Apple Calendar import or subscribe to. Python standard library only.

**Who it is for:** in-house lawyers and law firms following a client's cases, debt-collection and credit teams
with hundreds of files, journalists following a public company in court.

Real output from the live run on 19 Nov 2026:

```
$ python hearings.py "iute credit"
OCN Iute Credit SRL: 1047 cases, 10 upcoming hearings
  2026-11-24 09:00  Judecătoria Chișinău, sediul Rîșcani, Rîșcani, sala 22 - Jom  2-25001485-12-3-03012025
  2026-11-25 09:00  Curtea Supremă de Justiție, Completul nr.1 · În lipsa părţil  2ra-651/23
  2026-12-01 14:00  Judecătoria Chișinău, sediul Centru, Sala nr.9                2-19095382-02-2a-24042025
  ...
10 hearings written to hearings.ics

$ python hearings.py --case 2-25001485-12-3-03012025
  2026-11-24 09:00  Judecătoria Chișinău, sediul Rîșcani, Rîșcani, sala 22 - Jom  2-25001485-12-3-03012025
1 hearings written to hearings.ics
```

One event of the file:

```
BEGIN:VEVENT
UID:hearing-43814@examples.satelit.md
DTSTART;TZID=Europe/Chisinau:20261124T090000
DURATION:PT1H
SUMMARY:Ședință: Organizaţia de Creditare Nebancară IUTE CREDIT Societ
 ate cu Răspundere Limitată
LOCATION:Judecătoria Chișinău\, sediul Rîșcani\, Rîșcani\, sala 22 -
  Jomiru-Niculiță Veronica
DESCRIPTION:Dosar 2-25001485-12-3-03012025\n…\nDate: Satelit (satelit.md)
URL:https://satelit.md/ro/legislatie/sedinte-de-judecata/judecatoria-chisin
 au/2-25001485-12-3-03012025
END:VEVENT
```

## Run it in 3 commands

```sh
cd satelit-examples/courts-hearings-calendar
export SATELIT_API_KEY=sat_live_...
python hearings.py "moldtelecom" -o moldtelecom.ics
```

Then import the file (Google Calendar: **Settings → Import**), or publish it at a URL your calendar subscribes to,
and regenerate it daily. Each hearing has a stable `UID`, so a re-import updates events instead of doubling them.
Times are in `Europe/Chisinau`; a hearing without an hour becomes an all-day entry.

## How the name is matched

`/courts/search?q=<name>` finds the cases and the party's page; `/courts/names/{kind}/{slug}` gives its next 10
hearings. Write the name as it appears in the cases (`iute credit`, `moldtelecom`). For a case number or PIGD use
`--case`, which reads `/courts/case` and keeps the hearings from today on.

## Credits

A name: 6 (search 3 + the party's page 3). A case: 1. Agendas change during the day; a daily run is enough.

## Schedule it

```cron
15 7 * * 1-5 cd /opt/hearings && SATELIT_API_KEY=sat_live_... python3 hearings.py "iute credit" -o /var/www/cal/iute.ics
```

## Tests

```sh
python -m unittest -v      # a fake API; checks folding at 75 octets, escaping, all-day entries, UIDs
```

## Good to know

Coverage is in every answer's `meta.coverage` (on 19 Nov 2026: all 18 courts read, agendas complete from
30.10.2026). The courts' own pages (instante.justice.md, agenda.csj.md) are the official record.

## Pe scurt (română)

Ședințele de judecată ale unei companii sau ale unui dosar, exportate într-un fișier `.ics` pentru calendar.
6 credite pentru un nume, 1 pentru un dosar.
