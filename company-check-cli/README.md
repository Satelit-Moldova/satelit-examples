# Company check: a Moldovan company in one command

Look a company up by IDNO or name and get the state register's card, its directors and founders, its latest
financial statements, the public contracts it won and its court cases. Python standard library only.

**Who it is for:** KYC and compliance checks, sales teams qualifying a lead, procurement checking a supplier,
accountants confirming an IDNO before an invoice.

Real output from the live run on 19 Nov 2026:

```
$ python company.py 1002600048836
MOLDTELECOM (SA)  IDNO 1002600048836
  Register name : Societatea pe Acţiuni MOLDTELECOM
  State         : active; registered 1999-01-05; register file of 2026-11-16
  Address       : MD-2001, CHIŞINĂU, CENTRU CHIŞINĂU, bd. ŞTEFAN CEL MARE ŞI SFÂNT, 10
  Activity      : Poștă și telecomunicații
  2025 statement: revenue 1 679 938 170 MDL, profit 137 528 280 MDL, employees 2091
  2024 statement: revenue 1 657 703 400 MDL, profit 159 870 790 MDL, employees 2320
  Public contracts won: 2225, 23 406 973 MDL
    top buyer: Serviciul Vamal (3, 3 606 000 MDL)
    top buyer: Serviciul Tehnologii Informaționale al MAI (2, 2 528 452 MDL)
    top buyer: Agentia Servicii Publice (11, 1 600 310 MDL)
  Website       : http://www.moldtelecom.md
  Page          : https://satelit.md/ro/legislatie/companii/moldtelecom-1002600048836

Sursa: Agenția Servicii Publice, registrul de stat al persoanelor juridice (date.gov.md, asp.gov.md); Sursa: MTender (public.mtender.gov.md)
Data: Satelit (satelit.md)

$ python company.py moldtelecom
2 companies match "moldtelecom":
  1002600048836  MOLDTELECOM (SA), Chișinău, 2225 contracts
  2600048836836  MOLDTELECOM (SA), b Ctefan cel mare 10, 1 contracts
Run again with the IDNO for the full card.

$ python company.py 1002600048836 --contracts
2026-11-19            70 MDL  Servicii telefonie fixa                          GIMNAZIUL GRIBOVA DIN S. GRIBOVA, R-NUL DROCHIA
2026-11-19        70 000 MDL  Servicii publice de comunicații electronice      APA-CANAL CHISINAU S.A.
...
50 contracts on page 1.
```

For a company with court cases the card adds a line such as
`Court cases : 1047 (918 as plaintiff, 124 as defendant); next hearing 2026-11-24 09:00 Judecătoria Chișinău`.

## Run it in 3 commands

```sh
cd satelit-examples/company-check-cli
export SATELIT_API_KEY=sat_live_...
python company.py "iute credit"
```

Options: `--contracts [--page N]` (50 a page), `--json` (the API's answer, for scripts and `jq`).

## Credits

| Lookup | Route | Credits |
|---|---|---|
| by IDNO | `/companies/{idno}` | 2 |
| by name | `/companies?q=` (+ `/companies/{idno}` when one matches) | 3 (+2) |
| contracts | `/companies/{idno}/contracts` | 2 per 50 |

For a batch (a CRM export of IDNOs), loop over the file and keep the JSON: a company's register card changes rarely,
so cache it for a day or more.

## What it does not show

The API leaves out sole traders and farms (a person's name and address), phones and e-mails. A licence register
(BNM's lenders) is not part of the `/companies/{idno}` answer. The statements, contracts and court lines are.

## Tests

```sh
python -m unittest -v      # a fake Satelit API on 127.0.0.1
```

## Pe scurt (română)

Verificarea unei companii după IDNO sau denumire: fișa din registru, conducătorii, situațiile financiare,
contractele publice câștigate și dosarele în instanțe. 2-3 credite pe căutare.
