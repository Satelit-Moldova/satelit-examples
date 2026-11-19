// Calls the sheet functions of Code.gs against the live API, as a sheet would.
//   SATELIT_API_KEY=sat_live_... node run-gs.js 'SATELIT_RATE("EUR")' 'SATELIT_PRICE("lapte")'
'use strict';
const { load } = require('./shim');

const gs = load({ properties: { SATELIT_API_KEY: process.env.SATELIT_API_KEY } });
const formulas = process.argv.slice(2);
for (const f of formulas.length ? formulas : ['SATELIT_RATE("EUR")', 'SATELIT_FUEL("a95")', 'SATELIT_PRICE("lapte")']) {
  let value;
  try {
    value = require('node:vm').runInContext(f, gs);
  } catch (e) {
    value = '#ERROR! ' + e.message;
  }
  console.log(`=${f}  ->  ${JSON.stringify(value)}`);
}
console.log(`HTTP calls made: ${gs.calls.length}`);
