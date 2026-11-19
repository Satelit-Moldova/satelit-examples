#!/usr/bin/env node
// Movie night: today's films in a city's cinemas, with ratings, filtered by genre and audio
// language, and an .ics invitation for the session you pick. Node 18+, no dependencies.
//
//   node movie-night.js --city Chișinău --after 18:00
//   node movie-night.js --city Chișinău --genre SF --lang ro
//   node movie-night.js --city Chișinău --pick 2 --at 19:30      -> movie-night.ics
//
// Movies calls cost 40 credits each, so answers are cached on disk (.cache/): the day's programme
// 2 hours (40 credits), a film's card with its genres 30 days (40 per film, only with --genre).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const API = process.env.SATELIT_API_URL || 'https://api.satelit.md/v1';
const CACHE = process.env.SATELIT_CACHE_DIR || path.join(__dirname, '.cache');
const HOUR = 3600 * 1000;

async function satelit(route, ttl) {
  const file = path.join(CACHE, crypto.createHash('sha1').update(API + route).digest('hex') + '.json');
  const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < ttl;
  if (fresh) return JSON.parse(fs.readFileSync(file, 'utf8'));
  try {
    const res = await fetch(API + route, {
      headers: { Authorization: `Bearer ${process.env.SATELIT_API_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Satelit ${res.status} ${body.error?.code ?? ''}: ${body.error?.message ?? ''}`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(body));
    return body;
  } catch (e) {
    if (fs.existsSync(file)) { console.error(`${e.message}; showing the cached copy`); return JSON.parse(fs.readFileSync(file, 'utf8')); }
    throw e;
  }
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i] ?? true;
  return out;
}

const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Today's programme as one list of films, each with its genres and the sessions left.
async function programme({ city, genre, lang, after }) {
  const q = `country=MD${city ? `&city=${encodeURIComponent(city)}` : ''}`;
  const today = await satelit(`/movies/cinemas/today?${q}`, 2 * HOUR);
  const films = new Map();
  for (const { cinema, films: list } of today.data.cinemas) {
    for (const f of list) {
      const sessions = f.sessions
        .filter((s) => !after || s.time >= after)
        .filter((s) => !lang || fold(s.audio || s.language || '').startsWith(fold(lang)))
        .map((s) => ({ ...s, cinema: cinema.name, address: cinema.address, city: cinema.city }));
      if (!sessions.length) continue;
      const key = f.id || `title:${fold(f.title)}`; // a local film the catalogue does not know has no id
      const film = films.get(key) || { ...f, genres: [], sessions: [] };
      film.sessions.push(...sessions);
      films.set(key, film);
    }
  }
  let list = [...films.values()];
  if (genre) {
    // Genres come with a title's card (40 credits). Asked only for --genre, kept 30 days: a film's genres do not change.
    for (const f of list) if (f.id) f.genres = (await satelit(`/movies/titles/${f.id}`, 30 * 24 * HOUR)).data.genres || [];
    list = list.filter((f) => f.genres.some((g) => fold(g).includes(fold(genre))));
  }
  list.forEach((f) => f.sessions.sort((a, b) => a.time.localeCompare(b.time)));
  // Rated films first, best first; unrated (new local films) after, by name.
  list.sort((a, b) => (b.rating?.value ?? -1) - (a.rating?.value ?? -1) || a.title.localeCompare(b.title));
  return { day: today.data.day, films: list };
}

// Moldova's time zone (EET/EEST), so the session shows at the cinema's hour anywhere.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Chisinau',
  'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0200', 'TZNAME:EET', 'END:STANDARD',
  'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0300', 'TZNAME:EEST', 'END:DAYLIGHT', 'END:VTIMEZONE',
];

function ics(film, s) {
  const esc = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const start = `${s.date.replace(/-/g, '')}T${s.time.replace(':', '')}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Satelit examples//movie-night//EN', ...VTIMEZONE, 'BEGIN:VEVENT',
    `UID:${film.id || 'film'}-${start}-${crypto.createHash('sha1').update(s.cinema + s.hall).digest('hex').slice(0, 8)}@examples.satelit.md`,
    `DTSTAMP:${stamp}`, `DTSTART;TZID=Europe/Chisinau:${start}`, 'DURATION:PT2H30M',
    `SUMMARY:${esc(`Film: ${film.title}`)}`, `LOCATION:${esc(`${s.cinema}, ${s.hall}, ${s.address}`)}`,
    `DESCRIPTION:${esc(`${s.formats.join(' ')} · ${s.language || s.audio || ''}\nData: Satelit (satelit.md)`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(film.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n'); // Europe/Chisinau is a standard zone id every calendar app knows
}

async function main(argv = process.argv.slice(2)) {
  const a = args(argv);
  if (!process.env.SATELIT_API_KEY) throw new Error('Set SATELIT_API_KEY first.');
  const { day, films } = await programme({ city: a.city, genre: a.genre, lang: a.lang, after: a.after });
  console.log(`Cinema ${day}${a.city ? ` · ${a.city}` : ''}${a.genre ? ` · ${a.genre}` : ''}${a.lang ? ` · audio ${a.lang}` : ''}`);
  if (!films.length) console.log('Nothing matches today.');
  films.forEach((f, i) => {
    const rating = f.rating ? `★ ${f.rating.value}` : 'new';
    console.log(`${String(i + 1).padStart(2)}. ${f.title} (${f.year ?? '?'}) ${rating}${f.genres.length ? '  ' + f.genres.join(', ') : ''}`);
    console.log(`    ${f.sessions.slice(0, 8).map((s) => `${s.time} ${s.cinema.replace(/^Cineplex /, '')}${s.audio ? ' ' + s.audio : ''}`).join(' · ')}`);
  });
  console.log('Data: Satelit (satelit.md)');
  if (a.pick) {
    const film = films[Number(a.pick) - 1];
    const s = film && (a.at ? film.sessions.find((x) => x.time === a.at) : film.sessions[0]);
    if (!s) throw new Error('No such film or session; check --pick and --at against the list above.');
    const out = a.out || 'movie-night.ics';
    fs.writeFileSync(out, ics(film, s));
    console.log(`\n${film.title}, ${s.date} ${s.time}, ${s.cinema} ${s.hall}: invitation written to ${out}`);
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { main, programme, ics };
