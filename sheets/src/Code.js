/**
 * GreenCalculus for Google Sheets — Apps Script layer.
 *
 * Custom functions:
 *   =GC_FACTOR(key, [field], [as_of])   value (default) or one field; key may be a range
 *   =GC_FACTOR_ROW(key, [headers])      value | unit | source | cell | version | citation
 *   =GC_CITE(key)                       the citation line
 *   =GC_EMISSIONS(key, quantity)        quantity × factor, in the factor's CO2e unit
 *   =GC_SEARCH(text, [limit])           key | name | value | unit | source
 *
 * Everything the API needs is keyless (open browse route, edge-cached).
 * Setting an API key (GreenCalculus menu) adds ?as_of= version pinning and
 * per-account entitlements. Pure logic lives in core.js and is unit-tested.
 */

var GC_CACHE_SECONDS = 6 * 60 * 60; // 6h is the CacheService maximum
var GC_UA = 'greencalculus-sheets/0.1.0';
var GC_CLIENT = 'sheets/0.1.0'; // X-GC-Client — how the funnel attributes add-in traffic
var GC_SIGNUP_URL = 'https://greencalculus.com/developers/welcome?plan=free&ref=sheets';

// ── menu ────────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createAddonMenu()
    .addItem('Set API key…', 'gcSetApiKey')
    .addItem('Clear API key', 'gcClearApiKey')
    .addSeparator()
    .addItem('Insert example', 'gcInsertExample')
    .addItem('Help', 'gcHelp')
    .addToUi();
}
function onInstall() { onOpen(); }

function gcSetApiKey() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('GreenCalculus API key',
    'Paste a key (gc_live_…). Free, no card: ' + GC_SIGNUP_URL + '\n\n'
    + 'Custom functions run as the spreadsheet OWNER, so set the key on the owner\'s account.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var k = String(r.getResponseText() || '').trim();
  if (!/^gc_(live|test)_[A-Za-z0-9_-]{8,}$/.test(k)) { ui.alert('That does not look like a GreenCalculus key.'); return; }
  PropertiesService.getUserProperties().setProperty('GC_API_KEY', k);
  ui.alert('Saved. Formulas will now use your key (version pinning via as_of is available).');
}
function gcClearApiKey() {
  PropertiesService.getUserProperties().deleteProperty('GC_API_KEY');
  SpreadsheetApp.getUi().alert('API key removed. Formulas fall back to the open, keyless route.');
}
function gcApiKey_() {
  try { return PropertiesService.getUserProperties().getProperty('GC_API_KEY') || null; } catch (e) { return null; }
}
function gcInsertExample() {
  var sh = SpreadsheetApp.getActiveSheet();
  var r = sh.getActiveRange();
  var row = r.getRow(), col = r.getColumn();
  sh.getRange(row, col, 1, 4).setValues([['Factor key', 'kWh', 'kg CO2e', 'Citation']]);
  sh.getRange(row + 1, col, 1, 4).setFormulas([[
    '="grid.gbr.electricity.location_based"', '=1000',
    '=GC_EMISSIONS(' + a1_(row + 1, col) + ',' + a1_(row + 1, col + 1) + ')',
    '=GC_CITE(' + a1_(row + 1, col) + ')']]);
}
function a1_(row, col) { return SpreadsheetApp.getActiveSheet().getRange(row, col).getA1Notation(); }
function gcHelp() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 system-ui;padding:8px 12px">'
    + '<b>=GC_FACTOR(key, [field], [as_of])</b><br>Fields: ' + Object.keys(GC_FIELDS).join(', ') + '<br><br>'
    + '<b>=GC_FACTOR_ROW(key)</b> · <b>=GC_CITE(key)</b> · <b>=GC_EMISSIONS(key, qty)</b> · <b>=GC_SEARCH(text)</b><br><br>'
    + 'Keys: <a href="https://greencalculus.com/factors/?ref=sheets" target="_blank">greencalculus.com/factors</a> · '
    + 'Docs: <a href="https://greencalculus.com/developers/docs/?ref=sheets" target="_blank">developers/docs</a> · '
    + '<a href="' + GC_SIGNUP_URL + '" target="_blank">Get a free API key</a> (version pinning, calculations)<br><br>'
    + '<small>Sharing sheets that contain these values with clients is redistribution under the '
    + '<a href="https://greencalculus.com/terms/?ref=sheets" target="_blank">terms</a> — the Business plan covers it.</small></div>'
  ).setWidth(420).setHeight(220);
  SpreadsheetApp.getUi().showModalDialog(html, 'GreenCalculus');
}

// ── fetch layer ─────────────────────────────────────────────────────────
/**
 * Fetch records for a list of unique keys: cache first, then ONE fetchAll
 * for the misses. Returns { key: record | {__error} }.
 */
function gcFetchRecords_(keys, asOf) {
  var apiKey = gcApiKey_();
  if (asOf && !apiKey) {
    var e = {}; keys.forEach(function (k) { e[k] = { __error: 'as_of needs an API key — free at ' + GC_SIGNUP_URL + ' (GreenCalculus menu → Set API key)' }; });
    return e;
  }
  var cache = CacheService.getScriptCache();
  var out = {};
  var misses = [];
  var cacheKey = function (k) { return 'gc:' + (asOf || 'cur') + ':' + (apiKey ? 'k' : 'o') + ':' + k; };

  var cached = {};
  try { cached = cache.getAll(keys.map(cacheKey)) || {}; } catch (e) { cached = {}; }
  keys.forEach(function (k) {
    var hit = cached[cacheKey(k)];
    if (hit) { try { out[k] = JSON.parse(hit); return; } catch (e) { /* fall through */ } }
    misses.push(k);
  });
  if (!misses.length) return out;

  var reqs = misses.map(function (k) {
    var r = { url: gcBuildUrl(k, apiKey, asOf), method: 'get', muteHttpExceptions: true,
      headers: { 'User-Agent': GC_UA, 'X-GC-Client': GC_CLIENT, 'Accept': 'application/json' } };
    if (apiKey) r.headers['Authorization'] = 'Bearer ' + apiKey;
    return r;
  });
  var responses;
  try { responses = UrlFetchApp.fetchAll(reqs); }
  catch (e) { misses.forEach(function (k) { out[k] = { __error: 'network: ' + e.message }; }); return out; }

  var toCache = {};
  responses.forEach(function (res, i) {
    var k = misses[i];
    var code = res.getResponseCode();
    var body = null;
    try { body = JSON.parse(res.getContentText()); } catch (e) { body = null; }
    if (code === 200 && body) {
      var rec = gcExtract(body, k);
      if (rec) { out[k] = rec; toCache[cacheKey(k)] = JSON.stringify(rec); }
      else if (Array.isArray(body.factors)) { out[k] = null; } // keyless: not in the corpus
      else { out[k] = { __error: 'unexpected response shape' }; }
    } else if (code === 404) {
      out[k] = null;
    } else {
      var msg = (body && body.error && body.error.message) || ('HTTP ' + code);
      out[k] = { __error: msg };
    }
  });
  if (Object.keys(toCache).length) { try { cache.putAll(toCache, GC_CACHE_SECONDS); } catch (e) { /* cache is best-effort */ } }
  return out;
}

// ── custom functions ────────────────────────────────────────────────────
/**
 * Look up a sourced emission factor by its GreenCalculus key.
 *
 * @param {string|Array<Array<string>>} key Factor key, e.g. "grid.gbr.electricity.location_based", or a range of keys.
 * @param {string} [field] What to return: value (default), unit, name, source, publisher, cell, retrieved, licence, version, gwp, basis, scope, citation, proof.
 * @param {string} [as_of] Pin to a past data version, e.g. "2026.150" (needs an API key).
 * @return The requested field for each key.
 * @customfunction
 */
function GC_FACTOR(key, field, as_of) {
  var c = gcCollectKeys(key);
  if (!c.unique.length) return c.isScalar ? '' : c.grid.map(function (r) { return r.map(function () { return ''; }); });
  var recs = gcFetchRecords_(c.unique, as_of ? String(as_of) : null);
  return gcMapGrid(c, recs, function (rec) { return gcField(rec, field); });
}

/**
 * One factor as a row: value, unit, source id, source cell, data version, citation.
 *
 * @param {string} key Factor key.
 * @param {boolean} [headers] TRUE to include a header row above the values.
 * @return {Array<Array>} A 1×6 row (2×6 with headers).
 * @customfunction
 */
function GC_FACTOR_ROW(key, headers) {
  var k = gcNormaliseKey(key);
  if (!k) return '';
  var rec = gcFetchRecords_([k], null)[k];
  if (!rec) return '#GC_UNKNOWN_KEY: ' + k;
  if (rec.__error) return '#GC_ERROR: ' + rec.__error;
  var row = GC_ROW_FIELDS.map(function (f) { return gcField(rec, f); });
  return headers ? [GC_ROW_FIELDS.slice(), row] : [row];
}

/**
 * A ready-to-paste citation for a factor: publisher attribution, source cell,
 * retrieval date, data version and a public proof link.
 *
 * @param {string|Array<Array<string>>} key Factor key or a range of keys.
 * @return {string} Citation line(s).
 * @customfunction
 */
function GC_CITE(key) { return GC_FACTOR(key, 'citation'); }

/**
 * Emissions for a quantity: quantity × factor value, in the factor's CO2e unit
 * (e.g. kWh × kg CO2e per kWh = kg CO2e). Pass matching ranges to fill a column.
 *
 * @param {string|Array<Array<string>>} key Factor key or range of keys.
 * @param {number|Array<Array<number>>} quantity Activity amount(s) in the factor's activity unit.
 * @return {number} kg CO2e (or the factor's CO2e unit).
 * @customfunction
 */
function GC_EMISSIONS(key, quantity) {
  var c = gcCollectKeys(key);
  var q = Array.isArray(quantity) ? quantity : [[quantity]];
  var recs = c.unique.length ? gcFetchRecords_(c.unique, null) : {};
  var out = c.grid.map(function (r, i) {
    return r.map(function (k, j) {
      if (!k) return '';
      var rec = recs[k];
      if (!rec) return '#GC_UNKNOWN_KEY: ' + k;
      if (rec.__error) return '#GC_ERROR: ' + rec.__error;
      var qv = (q[i] && q[i][j] !== undefined) ? q[i][j] : (q[0] && q[0][0]);
      var n = Number(qv);
      if (qv === '' || qv === null || qv === undefined || isNaN(n)) return '';
      return n * rec.value;
    });
  });
  return c.isScalar ? out[0][0] : out;
}

/**
 * Search the factor corpus by plain text. Returns key, name, value, unit, source.
 *
 * @param {string} text Free text, e.g. "diesel litre" or "uk grid".
 * @param {number} [limit] Rows to return (default 10, max 50).
 * @return {Array<Array>} Matching factors, one per row.
 * @customfunction
 */
function GC_SEARCH(text, limit) {
  var t = String(text || '').trim();
  if (!t) return '';
  var n = Math.max(1, Math.min(50, Number(limit) || 10));
  var url = GC_BASE_URL + '/v1/factors?search=' + encodeURIComponent(t) + '&limit=' + n;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': GC_UA, 'X-GC-Client': GC_CLIENT } });
  var code = res.getResponseCode();
  var body; try { body = JSON.parse(res.getContentText()); } catch (e) { body = null; }
  if (code !== 200 || !body || !Array.isArray(body.factors)) {
    return '#GC_ERROR: ' + ((body && body.error && body.error.message) || ('HTTP ' + code));
  }
  if (!body.factors.length) return 'No factors match "' + t + '"';
  return body.factors.map(function (f) {
    return [f.key, f.name || '', (f.factor && typeof f.factor.value === 'number') ? f.factor.value : '',
      (f.factor && f.factor.unit) || '', (f.source && f.source.id) || ''];
  });
}
