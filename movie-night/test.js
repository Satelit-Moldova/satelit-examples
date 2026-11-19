// Offline tests: node --test   (a fake Satelit API on 127.0.0.1, a temporary cache folder)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');

const S = (time, audio, hall = 'Sala 1') => ({ date: '2026-11-19', time, hall, formats: ['2D'], audio, language: audio.toUpperCase() });
const TODAY = {
  data: {
    day: '2026-11-19',
    cinemas: [
      {
        cinema: { name: 'Cineplex Mall', city: 'Chișinău', address: 'Arborilor 21' },
        films: [
          { id: 'm1477104', title: 'Shaun the Sheep', year: 2026, rating: { value: 7.3 }, sessions: [S('11:50', 'ro'), S('19:00', 'ru')] },
          { id: null, title: 'Chisinau, My Love', rating: null, sessions: [S('18:30', 'en')] },
          { id: null, title: 'Ebenezer', rating: null, sessions: [S('19:30', 'ru')] },
        ],
      },
      { cinema: { name: 'Cineplex Loteanu', city: 'Chișinău', address: 'Ștefan cel Mare 103' }, films: [{ id: 'm1477104', title: 'Shaun the Sheep', year: 2026, rating: { value: 7.3 }, sessions: [S('13:20', 'ro')] }] },
    ],
  },
  meta: {},
};
const calls = [];
const api = http.createServer((req, res) => {
  calls.push(req.url);
  const body = req.url.startsWith('/v1/movies/cinemas/today') ? TODAY
    : req.url === '/v1/movies/titles/m1477104' ? { data: { id: 'm1477104', genres: ['Animaţie', 'Comedie'] }, meta: {} } : null;
  res.writeHead(body ? 200 : 422, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body || { error: { code: 'invalid', message: 'x' } }));
});

test('programme, filters, cache and .ics', async (t) => {
  t.after(() => api.close());
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'movies-'));
  Object.assign(process.env, { SATELIT_API_KEY: 'sat_live_test', SATELIT_API_URL: `http://127.0.0.1:${api.address().port}/v1`, SATELIT_CACHE_DIR: dir });
  const { programme, ics, main } = require('./movie-night');

  const all = await programme({ city: 'Chișinău' });
  assert.deepStrictEqual(all.films.map((f) => f.title), ['Shaun the Sheep', 'Chisinau, My Love', 'Ebenezer']); // id-less films stay apart
  assert.deepStrictEqual(all.films[0].sessions.map((s) => s.time), ['11:50', '13:20', '19:00']); // both cinemas, in order

  const ro = await programme({ city: 'Chișinău', lang: 'ro', after: '12:00' });
  assert.deepStrictEqual(ro.films.map((f) => [f.title, f.sessions.map((s) => s.time)]), [['Shaun the Sheep', ['13:20']]]);

  const anim = await programme({ city: 'Chișinău', genre: 'animaț' }); // ț and ţ both match
  assert.deepStrictEqual(anim.films.map((f) => f.title), ['Shaun the Sheep']);
  await programme({ city: 'Chișinău', genre: 'comedie' });
  assert.strictEqual(calls.length, 2, 'programme and the title card asked once each');

  const cal = ics(all.films[0], all.films[0].sessions[0]);
  assert.match(cal, /DTSTART;TZID=Europe\/Chisinau:20261119T115000\r\n/);
  assert.ok(cal.includes('LOCATION:Cineplex Mall\\, Sala 1\\, Arborilor 21'));
  assert.match(cal, /BEGIN:VTIMEZONE[\s\S]+END:VTIMEZONE[\s\S]+BEGIN:VEVENT/);

  const out = path.join(dir, 'night.ics');
  const log = console.log; console.log = () => {};
  await main(['--city', 'Chișinău', '--pick', '1', '--at', '19:00', '--out', out]);
  console.log = log;
  assert.match(fs.readFileSync(out, 'utf8'), /20261119T190000/);

});
