/**
 * Satelit for Google Sheets: custom functions with Moldova's rates, fuel and shop prices.
 *
 *   =SATELIT_RATE("EUR")          MDL for one euro (BNM)
 *   =SATELIT_FUEL("a95")          the lowest a95 price among the networks; =SATELIT_FUEL("diesel"; "Petrom")
 *   =SATELIT_PRICE("lapte")       one row: lowest price, shop, product
 *   =SATELIT_SOURCE("rates")      the attribution line to keep near the numbers
 *
 * The key lives in Project Settings -> Script Properties as SATELIT_API_KEY, never in a cell.
 * Answers are kept in CacheService, so a sheet full of formulas costs a few credits, not hundreds.
 */

var SATELIT_URL = 'https://api.satelit.md/v1';
var TTL = { rates: 6 * 3600, fuel: 3 * 3600, prices: 3 * 3600 }; // seconds; CacheService keeps 6 h at most

/** Adds the Satelit menu when the sheet opens. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Satelit')
    .addItem('Refresh data', 'satelitRefresh')
    .addToUi();
}

/**
 * Exchange rate of the National Bank of Moldova: MDL for one unit.
 * @param {string} code Currency code, e.g. "EUR".
 * @return {number} MDL per unit.
 * @customfunction
 */
function SATELIT_RATE(code) {
  var rates = cached_('rates', TTL.rates, function () {
    var map = {};
    satelitGet_('/rates').data.forEach(function (r) { map[r.code] = r.value / r.nominal; });
    return map;
  });
  var value = rates[String(code || '').trim().toUpperCase()];
  if (value === undefined) throw new Error('Unknown currency: ' + code);
  return value;
}

/**
 * Fuel price in lei per litre.
 * @param {string} fuel "a95", "diesel" or "lpg".
 * @param {string} network Optional network name or key ("Petrom"); empty: the lowest of all networks.
 * @return {number} lei per litre.
 * @customfunction
 */
function SATELIT_FUEL(fuel, network) {
  var d = cached_('fuel', TTL.fuel, function () {
    var data = satelitGet_('/fuel').data;
    var nets = {};
    data.networks.forEach(function (n) {
      nets[n.key] = n.prices;
      nets[n.name.toLowerCase()] = n.prices;
    });
    return { range: data.range, nets: nets };
  });
  var f = String(fuel || 'a95').toLowerCase();
  if (network) {
    var prices = d.nets[String(network).toLowerCase()];
    if (!prices || prices[f] == null) throw new Error('No ' + f + ' price for ' + network);
    return prices[f];
  }
  if (!d.range[f]) throw new Error('Unknown fuel: ' + fuel);
  return d.range[f].min;
}

/**
 * The lowest in-stock price of a product in Moldova's online shops.
 * @param {string} query What to look for, e.g. "lapte 2.5%".
 * @return {Array} One row: price, shop, product name.
 * @customfunction
 */
function SATELIT_PRICE(query) {
  var q = String(query || '').trim();
  if (q.length < 2) throw new Error('Write at least two letters');
  return cached_('price:' + q.toLowerCase(), TTL.prices, function () {
    var found = satelitGet_('/prices/search?in_stock=true&q=' + encodeURIComponent(q)).data;
    if (!found.length) return [['', '', 'not found']];
    var item = satelitGet_('/prices/items/' + found[0].id).data;
    var offers = item.offers.filter(function (o) { return o.in_stock; });
    var best = offers.length ? offers[0] : { price: item.min_price, store: { name: '' } };
    return [[best.price, best.store.name, item.name]];
  });
}

/**
 * The line the source asks you to keep next to its data.
 * @param {string} product "rates", "fuel" or "prices".
 * @return {string}
 * @customfunction
 */
function SATELIT_SOURCE(product) {
  var lines = {
    rates: 'Sursa: Banca Națională a Moldovei, bnm.md, CC BY 4.0 · Date: Satelit (satelit.md)',
    fuel: 'Date: Satelit (satelit.md), ANRE',
    prices: 'Prețuri din magazinele online · Date: Satelit (satelit.md)'
  };
  return lines[String(product || 'rates').toLowerCase()] || 'Date: Satelit (satelit.md)';
}

/** Menu action: forget the cached answers and make every SATELIT_ formula run again. */
function satelitRefresh() {
  var keys = JSON.parse(CacheService.getScriptCache().get('satelit:keys') || '[]');
  CacheService.getScriptCache().removeAll(keys.concat(['satelit:keys']));
  SpreadsheetApp.getActive().getSheets().forEach(function (sheet) {
    var range = sheet.getDataRange();
    var formulas = range.getFormulas();
    formulas.forEach(function (row, i) {
      row.forEach(function (f, j) {
        if (f.indexOf('SATELIT_') === -1) return;
        var cell = range.getCell(i + 1, j + 1);
        cell.setValue('');
        SpreadsheetApp.flush();
        cell.setFormula(f); // the same formula again: Sheets runs it anew
      });
    });
  });
}

// ---- helpers ----

/** Runs fn once per ttl and keeps its (small) result in the script cache. */
function cached_(key, ttl, fn) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('satelit:' + key);
  if (hit) return JSON.parse(hit);
  var value = fn();
  cache.put('satelit:' + key, JSON.stringify(value), ttl);
  var keys = JSON.parse(cache.get('satelit:keys') || '[]');
  if (keys.indexOf('satelit:' + key) === -1) {
    keys.push('satelit:' + key);
    cache.put('satelit:keys', JSON.stringify(keys.slice(-200)), 21600);
  }
  return value;
}

/** GET a Satelit route; throws a short, readable error that the cell shows. */
function satelitGet_(path) {
  var key = PropertiesService.getScriptProperties().getProperty('SATELIT_API_KEY');
  if (!key) throw new Error('Set SATELIT_API_KEY in Project Settings > Script Properties');
  var res = UrlFetchApp.fetch(SATELIT_URL + path, {
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
    muteHttpExceptions: true
  });
  var body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200) {
    var err = body.error || {};
    throw new Error('Satelit ' + res.getResponseCode() + ' ' + (err.code || '') + ': ' + (err.message || ''));
  }
  return body;
}
