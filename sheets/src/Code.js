/**
 * GreenCalculus for Google Sheets — Apps Script layer.
 *
 * Custom functions:
 *   =GC_FACTOR(key, [field], [as_of])   value (default) or one field; key may be a range
 *   =GC_FACTOR_ROW(key, [headers])      value | unit | source | cell | version | citation
 *   =GC_CITE(key)                       the citation line
 *   =GC_EMISSIONS(key, quantity)        quantity × factor, in the factor's CO2e unit
 *   =GC_SEARCH(text, [limit])           key | name | value | unit | source
 *   =GC_VERSION()                       the data version formulas are reading (pin or current)
 *
 * Sidebar (Extensions → GreenCalculus → Open): search + insert, workbook
 * version pin, API key. Keyless by default (open browse route, edge-cached).
 * A key adds ?as_of= pinning. Pure logic lives in core.js and is unit-tested.
 *
 * WORKBOOK PIN. A custom function may read the spreadsheet but NOT document
 * properties, so the pin lives IN the workbook: a named range GC_AS_OF on a
 * "GreenCalculus" sheet. Visible to an auditor, travels with a copy, readable
 * from every cell. Pinning reads the archive, which needs a key; a pinned
 * workbook whose owner has no key shows a readable message, never a current
 * value under a past label.
 */

var GC_CACHE_SECONDS = 6 * 60 * 60; // 6h is the CacheService maximum
var GC_UA = 'greencalculus-sheets/0.3.0';
var GC_CLIENT = 'sheets/0.3.0'; // X-GC-Client — how the funnel attributes add-in traffic
var GC_DOCS_URL = 'https://greencalculus.com/developers/docs/?ref=sheets';
var GC_FACTORS_URL = 'https://greencalculus.com/factors/?ref=sheets';
var GC_TERMS_URL = 'https://greencalculus.com/terms/?ref=sheets';

// ── menu + sidebar ──────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createAddonMenu()
    .addItem('Open GreenCalculus', 'gcShowSidebar')
    .addItem('Build me a starter sheet', 'gcInsertExampleFromMenu')
    .addSeparator()
    .addItem('Set API key…', 'gcSetApiKey')
    .addItem('Clear API key', 'gcClearApiKey')
    .addItem('Help', 'gcHelp')
    .addItem('Diagnostics', 'gcDiagDialog')
    .addToUi();
}
/**
 * Marketplace install runs in AuthMode.FULL, so the sidebar may open here:
 * a new user sees the welcome panel instead of an empty sheet and a menu.
 */
function onInstall(e) {
  onOpen(e);
  try { gcShowSidebar(); } catch (err) { /* menu is enough if the UI is unavailable */ }
}

function gcShowSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('GreenCalculus');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Everything the sidebar renders from. */
function gcSidebarState() {
  var key = gcApiKey_();
  return {
    welcomed: gcWelcomed_(),
    hasKey: !!key,
    keyMasked: key ? key.slice(0, 8) + '…' + key.slice(-4) : '',
    pin: gcWorkbookPin_(),
    current: gcCurrentVersion_(),
    signupUrl: GC_SIGNUP_URL, docsUrl: GC_DOCS_URL, factorsUrl: GC_FACTORS_URL, termsUrl: GC_TERMS_URL,
  };
}

/** Sidebar search: plain records for the result cards. */
function gcSidebarSearch(text) {
  var rows = gcSearch_(text, 8);
  return rows.map(function (f) {
    return { key: f.key, name: f.name || '', value: (f.factor && f.factor.value), unit: (f.factor && f.factor.unit) || '',
      source: (f.source && f.source.id) || '', cell: (f.source && f.source.cell_ref) || '' };
  });
}

/**
 * Write a formula at the active cell; returns the sheet-qualified address for
 * the toast. The record is fetched here first so the custom function that
 * follows finds it in CacheService — the cell still shows Google's "Loading…"
 * for its own round trip, but no second network wait.
 */
function gcInsertFormula(key, type) {
  var k = gcNormaliseKey(key);
  if (!k) throw new Error('No factor key.');
  var f = type === 'row' ? '=GC_FACTOR_ROW("' + k + '")'
        : type === 'cite' ? gcCitationLinkFormula('"' + k + '"')
        : type === 'cite_full' ? '=GC_CITE("' + k + '")'
        : '=GC_FACTOR("' + k + '")';
  try { gcFetchRecords_([k], gcEffectiveAsOf(null, gcWorkbookPin_())); } catch (e) { /* pre-warm only */ }
  var r = SpreadsheetApp.getActiveSpreadsheet().getActiveRange();
  var cell = r.getCell(1, 1);
  cell.setFormula(f);
  return cell.getSheet().getName() + '!' + cell.getA1Notation();
}

function gcSaveKey(k) {
  k = String(k || '').trim();
  if (!/^gc_(live|test)_[A-Za-z0-9_-]{8,}$/.test(k)) throw new Error('That does not look like a GreenCalculus key (gc_live_…).');
  PropertiesService.getUserProperties().setProperty('GC_API_KEY', k);
  return gcSidebarState();
}
function gcClearKey() {
  PropertiesService.getUserProperties().deleteProperty('GC_API_KEY');
  return gcSidebarState();
}

// ── workbook pin (item 4) ───────────────────────────────────────────────
function gcWorkbookPin_() {
  try {
    var r = SpreadsheetApp.getActiveSpreadsheet().getRangeByName(GC_PIN_RANGE);
    return r ? gcNormaliseVersion(r.getValue()) : null;
  } catch (e) { return null; }
}

/** Current corpus version, keyless, cached 10 min. */
function gcCurrentVersion_() {
  var cache = CacheService.getScriptCache();
  try { var c = cache.get('gc:version'); if (c) return c; } catch (e) { /* best-effort */ }
  var res = UrlFetchApp.fetch(GC_BASE_URL + '/v1/factors?limit=1', { muteHttpExceptions: true, headers: gcHeaders_(null) });
  if (res.getResponseCode() !== 200) return null;
  var body; try { body = JSON.parse(res.getContentText()); } catch (e) { return null; }
  var v = body && body.meta && body.meta.gc_version ? String(body.meta.gc_version) : null;
  if (v) { try { cache.put('gc:version', v, 600); } catch (e) { /* best-effort */ } }
  return v;
}

/** Pin the workbook. Empty version = current. Needs a key (reads the archive). */
function gcPinWorkbook(version) {
  if (!gcApiKey_()) throw new Error('Pinning needs an API key — free at ' + GC_SIGNUP_URL);
  var v = gcNormaliseVersion(version);
  if (String(version || '').trim() && !v) throw new Error('Versions look like 2026.150.');
  if (!v) { v = gcCurrentVersion_(); if (!v) throw new Error('Could not read the current data version — try again.'); }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(GC_PIN_SHEET);
  if (!sh) {
    sh = ss.insertSheet(GC_PIN_SHEET);
    sh.getRange('A1:B1').setValues([['GreenCalculus data version pin', '']]).setFontWeight('bold');
    sh.getRange('A2').setValue('Every GC_ formula in this workbook reads factors as they stood at the version in B1. Clear B1 (or use the sidebar) to follow the current version. Proof pages: https://verify.greencalculus.com/<key>@<version>');
    sh.setColumnWidth(1, 320);
  }
  var cell = sh.getRange('B1');
  cell.setValue(v).setFontFamily('Courier New');
  ss.setNamedRange(GC_PIN_RANGE, cell);
  return gcSidebarState();
}
function gcUnpinWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r = ss.getRangeByName(GC_PIN_RANGE);
  if (r) r.clearContent();
  return gcSidebarState();
}

// ── diagnostics: which Google service refuses? ──────────────────────────
function gcDiag() {
  var lines = [];
  var step = function (name, fn) {
    try { var r = fn(); lines.push('OK   ' + name + (r !== undefined ? ' → ' + String(r).slice(0, 80) : '')); }
    catch (e) { lines.push('FAIL ' + name + ' → ' + (e && e.message ? e.message : e)); }
  };
  step('PropertiesService.getUserProperties().getProperty', function () { return PropertiesService.getUserProperties().getProperty('GC_API_KEY') ? 'set' : 'unset'; });
  step('PropertiesService user set/delete', function () { var u = PropertiesService.getUserProperties(); u.setProperty('GC_DIAG', '1'); u.deleteProperty('GC_DIAG'); return 'ok'; });
  step('PropertiesService.getScriptProperties', function () { return PropertiesService.getScriptProperties().getProperty('x') === null ? 'readable' : 'readable'; });
  step('CacheService get/put', function () { var c = CacheService.getScriptCache(); c.put('gc:diag', '1', 60); return c.get('gc:diag'); });
  step('UrlFetchApp keyless version', function () { return gcCurrentVersion_(); });
  step('SpreadsheetApp.getActiveSpreadsheet().getName', function () { return SpreadsheetApp.getActiveSpreadsheet().getName(); });
  step('getRangeByName(GC_AS_OF)', function () { var r = SpreadsheetApp.getActiveSpreadsheet().getRangeByName(GC_PIN_RANGE); return r ? r.getA1Notation() : 'none'; });
  step('getActiveRange', function () { return SpreadsheetApp.getActiveSpreadsheet().getActiveRange().getA1Notation(); });
  step('HtmlService.createHtmlOutputFromFile(Sidebar)', function () { return HtmlService.createHtmlOutputFromFile('Sidebar').getContent().length + ' chars'; });
  step('gcSidebarState()', function () { return JSON.stringify(gcSidebarState()).slice(0, 60); });
  return lines.join('\n');
}
function gcDiagDialog() {
  var txt = gcDiag();
  var html = HtmlService.createHtmlOutput('<pre style="font:12px ui-monospace,Menlo,monospace;white-space:pre-wrap;padding:8px">' + txt.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) + '</pre>').setWidth(560).setHeight(360);
  SpreadsheetApp.getUi().showModalDialog(html, 'GreenCalculus diagnostics');
}

// ── legacy menu items (kept: they work without the sidebar) ─────────────
function gcSetApiKey() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('GreenCalculus API key',
    'Paste a key (gc_live_…). Free, no card: ' + GC_SIGNUP_URL + '\n\n'
    + 'Custom functions run as the spreadsheet OWNER, so set the key on the owner\'s account.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try { gcSaveKey(r.getResponseText()); ui.alert('Saved. Version pinning is now available in the sidebar.'); }
  catch (e) { ui.alert(e.message); }
}
function gcClearApiKey() {
  gcClearKey();
  SpreadsheetApp.getUi().alert('API key removed. Formulas fall back to the open, keyless route.');
}
function gcApiKey_() {
  try { return PropertiesService.getUserProperties().getProperty('GC_API_KEY') || null; } catch (e) { return null; }
}
/**
 * Write the starter sheet at the active cell: a header row, then one row per
 * GC_EXAMPLE_ROWS (key, amount, unit, =GC_EMISSIONS, linked short citation).
 * Returns the A1 range it filled. Rows are built in core.js (gcExampleBlock)
 * so the formulas are unit-tested. Keys are pre-fetched so the cells fill
 * from cache.
 */
function gcInsertExample() {
  var sh = SpreadsheetApp.getActiveSheet();
  var r = sh.getActiveRange();
  var row = r.getRow(), col = r.getColumn();
  try { gcFetchRecords_(GC_EXAMPLE_ROWS.map(function (x) { return x.key; }), gcEffectiveAsOf(null, gcWorkbookPin_())); } catch (e) { /* pre-warm only */ }
  sh.getRange(row, col, 1, GC_EXAMPLE_HEADERS.length).setValues([GC_EXAMPLE_HEADERS]).setFontWeight('bold');
  for (var i = 0; i < GC_EXAMPLE_ROWS.length; i++) {
    var rr = row + 1 + i;
    var block = gcExampleBlock(a1_(sh, rr, col), a1_(sh, rr, col + 1), GC_EXAMPLE_ROWS[i]);
    sh.getRange(rr, col, 1, 3).setValues([block.values]);
    sh.getRange(rr, col + 3, 1, 2).setFormulas([block.formulas]);
  }
  return sh.getRange(row, col, 1 + GC_EXAMPLE_ROWS.length, GC_EXAMPLE_HEADERS.length).getA1Notation();
}
function a1_(sh, row, col) { return sh.getRange(row, col).getA1Notation(); }

/** Menu entry point: insert, then say where it went. */
function gcInsertExampleFromMenu() {
  var where = gcInsertExample();
  gcSetWelcomed_();
  try { SpreadsheetApp.getActiveSpreadsheet().toast('Starter sheet at ' + where + ' — the figures and citations fill in a few seconds.', 'GreenCalculus', 8); } catch (e) { /* toast is a nicety */ }
}

// ── first run ───────────────────────────────────────────────────────────
// The welcome panel shows until this user inserts the example or skips it.
// Stored per user (not per workbook): the person who has seen it once does
// not need it in every sheet they open.
function gcWelcomed_() {
  try { return PropertiesService.getUserProperties().getProperty('GC_WELCOMED') === '1'; } catch (e) { return true; }
}
function gcSetWelcomed_() {
  try { PropertiesService.getUserProperties().setProperty('GC_WELCOMED', '1'); } catch (e) { /* best-effort */ }
}
/** Sidebar "Insert a worked example": inserts at the selection, ends the welcome. */
function gcInsertExampleFromSidebar() {
  var where = gcInsertExample();
  gcSetWelcomed_();
  return { where: where, state: gcSidebarState() };
}
/** Sidebar "Skip": ends the welcome without inserting. */
function gcDismissWelcome() {
  gcSetWelcomed_();
  return gcSidebarState();
}
/** Sidebar footer "Show intro": brings the welcome panel back for this user. */
function gcShowWelcomeAgain() {
  try { PropertiesService.getUserProperties().deleteProperty('GC_WELCOMED'); } catch (e) { /* best-effort */ }
  return gcSidebarState();
}
function gcHelp() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 system-ui;padding:8px 12px">'
    + '<b>=GC_FACTOR(key, [field], [as_of])</b><br>Fields: ' + Object.keys(GC_FIELDS).join(', ') + '<br><br>'
    + '<b>=GC_FACTOR_ROW(key)</b> · <b>=GC_CITE(key, ["short"])</b> · <b>=GC_EMISSIONS(key, qty)</b> · <b>=GC_SEARCH(text)</b> · <b>=GC_VERSION()</b><br>'
    + 'Linked citation: <code>=HYPERLINK(GC_FACTOR(key,"proof"), GC_CITE(key,"short"))</code><br><br>'
    + 'Every value comes with the publisher\'s exact source cell, the data version and a citation, and stays current when the publisher updates.<br><br>'
    + 'Keys: <a href="' + GC_FACTORS_URL + '" target="_blank">greencalculus.com/factors</a> · '
    + 'Docs: <a href="' + GC_DOCS_URL + '" target="_blank">developers/docs</a> · '
    + '<a href="' + GC_SIGNUP_URL + '" target="_blank">Get a free API key</a> (version pinning)<br><br>'
    + '<small>Sharing sheets that contain these values with clients is redistribution under the '
    + '<a href="' + GC_TERMS_URL + '" target="_blank">terms</a> — the Business plan covers it.</small></div>'
  ).setWidth(460).setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, 'GreenCalculus');
}

// ── fetch layer ─────────────────────────────────────────────────────────
function gcHeaders_(apiKey) {
  var h = { 'User-Agent': GC_UA, 'X-GC-Client': GC_CLIENT, 'Accept': 'application/json' };
  if (apiKey) h['Authorization'] = 'Bearer ' + apiKey;
  return h;
}

function gcSearch_(text, limit) {
  var t = String(text || '').trim();
  if (!t) return [];
  var n = Math.max(1, Math.min(50, Number(limit) || 10));
  var url = GC_BASE_URL + '/v1/factors?search=' + encodeURIComponent(t) + '&limit=' + n;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: gcHeaders_(null) });
  var code = res.getResponseCode();
  var body; try { body = JSON.parse(res.getContentText()); } catch (e) { body = null; }
  if (code !== 200 || !body || !Array.isArray(body.factors)) {
    throw new Error(gcHttpMessage(code, body, false));
  }
  return body.factors;
}

/**
 * Fetch records for a list of unique keys: cache first, then batched
 * fetchAll for the misses. Keyed batches are capped (free tier: 30/min) and
 * a 429 waits for Retry-After once, inside the 30 s custom-function budget.
 * Returns { key: record | null | {__error} }.
 */
function gcFetchRecords_(keys, asOf) {
  var apiKey = gcApiKey_();
  var out = {};
  if (asOf && String(asOf).indexOf('INVALID:') === 0) {
    keys.forEach(function (k) { out[k] = { __error: GC_MSG.badAsOf(asOf.slice(8)) }; });
    return out;
  }
  if (asOf && !apiKey) {
    keys.forEach(function (k) { out[k] = { __error: GC_MSG.pinnedNoKey(asOf) }; });
    return out;
  }
  var cache = CacheService.getScriptCache();
  var cacheKey = function (k) { return 'gc:' + (asOf || 'cur') + ':' + (apiKey ? 'k' : 'o') + ':' + k; };
  var misses = [];
  var cached = {};
  try { cached = cache.getAll(keys.map(cacheKey)) || {}; } catch (e) { cached = {}; }
  keys.forEach(function (k) {
    var hit = cached[cacheKey(k)];
    if (hit) { try { out[k] = JSON.parse(hit); return; } catch (e) { /* fall through */ } }
    misses.push(k);
  });
  if (!misses.length) return out;

  var started = Date.now();
  var batches = gcChunk(misses, apiKey ? GC_KEYED_BATCH : GC_OPEN_BATCH);
  var toCache = {};
  for (var b = 0; b < batches.length; b++) {
    var batch = batches[b];
    if (Date.now() - started > 24000) { // leave headroom under the 30 s limit
      batch.forEach(function (k) { out[k] = { __error: GC_MSG.timedOut }; });
      continue;
    }
    var retry = gcFetchBatch_(batch, apiKey, asOf, out, toCache);
    if (retry.length) {
      var wait = Math.min(retry.after || 5, 20);
      if (Date.now() - started + wait * 1000 < 25000) {
        Utilities.sleep(wait * 1000);
        var again = gcFetchBatch_(retry, apiKey, asOf, out, toCache);
        again.forEach(function (k) { out[k] = { __error: GC_MSG.rateLimited }; });
      } else {
        retry.forEach(function (k) { out[k] = { __error: GC_MSG.rateLimited }; });
      }
    }
  }
  if (Object.keys(toCache).length) { try { cache.putAll(toCache, GC_CACHE_SECONDS); } catch (e) { /* cache is best-effort */ } }
  return out;
}

/** One fetchAll. Fills `out`/`toCache`; returns the keys that got a 429 (with .after seconds). */
function gcFetchBatch_(keys, apiKey, asOf, out, toCache) {
  var reqs = keys.map(function (k) {
    return { url: gcBuildUrl(k, apiKey, asOf), method: 'get', muteHttpExceptions: true, headers: gcHeaders_(apiKey) };
  });
  var responses;
  try { responses = UrlFetchApp.fetchAll(reqs); }
  catch (e) { keys.forEach(function (k) { out[k] = { __error: GC_MSG.network }; }); var none = []; none.after = 0; return none; }
  var retry = []; retry.after = 0;
  var cacheKey = function (k) { return 'gc:' + (asOf || 'cur') + ':' + (apiKey ? 'k' : 'o') + ':' + k; };
  responses.forEach(function (res, i) {
    var k = keys[i];
    var code = res.getResponseCode();
    var body = null;
    try { body = JSON.parse(res.getContentText()); } catch (e) { body = null; }
    if (code === 200 && body) {
      var rec = gcExtract(body, k);
      if (rec && rec.__error) { out[k] = rec; }
      else if (rec) { out[k] = rec; toCache[cacheKey(k)] = JSON.stringify(rec); }
      else if (Array.isArray(body.factors)) { out[k] = null; }
      else { out[k] = { __error: GC_MSG.badReply }; }
    } else if (code === 404) {
      out[k] = null;
    } else if (code === 429) {
      retry.push(k);
      var ra = 0; try { ra = Number((res.getHeaders() || {})['Retry-After'] || (res.getHeaders() || {})['retry-after']) || 0; } catch (e) { ra = 0; }
      if (ra > retry.after) retry.after = ra;
    } else {
      out[k] = { __error: gcHttpMessage(code, body, !!apiKey) };
    }
  });
  return retry;
}

// ── custom functions ────────────────────────────────────────────────────
/**
 * Look up a sourced emission factor by its GreenCalculus key.
 *
 * @param {string|Array<Array<string>>} key Factor key, e.g. "grid.gbr.electricity.location_based", or a range of keys.
 * @param {string} [field] What to return: value (default), unit, name, source, publisher, cell, retrieved, licence, version, gwp, basis, scope, citation, proof.
 * @param {string} [as_of] Pin to a past data version, e.g. "2026.150" (needs an API key). "current" ignores a workbook pin.
 * @return The requested field for each key.
 * @customfunction
 */
function GC_FACTOR(key, field, as_of) {
  var c = gcCollectKeys(key);
  // Nothing to fetch — but a cell that holds a number or another GC message
  // still gets its named message from gcMapGrid (an early '' hid it, 2026-09-09).
  if (!c.unique.length) return gcMapGrid(c, {}, function () { return ''; });
  var recs = gcFetchRecords_(c.unique, gcEffectiveAsOf(as_of, gcWorkbookPin_()));
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
  var problem = gcKeyProblem(key);
  if (problem) return gcErrorMessage(problem);
  var k = gcNormaliseKey(key);
  if (!k) return '';
  var rec = gcFetchRecords_([k], gcEffectiveAsOf(null, gcWorkbookPin_()))[k];
  if (!rec) return gcUnknownKeyMessage(k);
  if (rec.__error) return gcErrorMessage(rec.__error);
  var row = GC_ROW_FIELDS.map(function (f) { return gcField(rec, f); });
  return headers ? [GC_ROW_FIELDS.slice(), row] : [row];
}

/**
 * A ready-to-paste citation for a factor: factor name, publisher, source cell,
 * retrieval date, data version and a public proof link. Pass "short" for a
 * cell-sized form (source id, source cell, data version); wrap in HYPERLINK
 * with GC_FACTOR(key,"proof") to make it a link.
 *
 * @param {string|Array<Array<string>>} key Factor key or a range of keys.
 * @param {string} [style] "full" (default) or "short".
 * @return {string} Citation line(s).
 * @customfunction
 */
function GC_CITE(key, style) {
  var st = String(style || 'full').trim().toLowerCase();
  return GC_FACTOR(key, st === 'short' ? 'citation_short' : 'citation');
}

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
  var recs = c.unique.length ? gcFetchRecords_(c.unique, gcEffectiveAsOf(null, gcWorkbookPin_())) : {};
  var out = c.grid.map(function (r, i) {
    return r.map(function (k, j) {
      var problem = c.problems && c.problems[i] && c.problems[i][j];
      if (problem) return gcErrorMessage(problem);
      if (!k) return '';
      var rec = recs[k];
      if (!rec) return gcUnknownKeyMessage(k);
      if (rec.__error) return gcErrorMessage(rec.__error);
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
  var rows;
  try { rows = gcSearch_(t, limit); } catch (e) { return gcErrorMessage(e.message); }
  if (!rows.length) return 'No factors match "' + t + '" — try a fuel, activity or country name';
  return rows.map(function (f) {
    return [f.key, f.name || '', (f.factor && typeof f.factor.value === 'number') ? f.factor.value : '',
      (f.factor && f.factor.unit) || '', (f.source && f.source.id) || ''];
  });
}

/**
 * The data version this workbook's formulas read: the workbook pin if set,
 * otherwise the current corpus version.
 *
 * @return {string} e.g. "2026.186"
 * @customfunction
 */
function GC_VERSION() {
  var pin = gcWorkbookPin_();
  if (pin) return pin;
  return gcCurrentVersion_() || gcErrorMessage(GC_MSG.noVersion);
}
