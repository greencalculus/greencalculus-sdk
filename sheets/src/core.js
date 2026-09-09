/**
 * GreenCalculus for Google Sheets — pure logic.
 *
 * Everything in this file runs unchanged in Apps Script (V8) AND in Node, so
 * the parts of the add-in that can be wrong in a quiet way — URL building,
 * field selection, citation assembly, range batching — are unit-tested
 * outside Sheets. Nothing here touches UrlFetchApp, CacheService or the
 * spreadsheet; Code.js owns those.
 */

var GC_BASE_URL = 'https://api.greencalculus.com';
var GC_VERIFY_URL = 'https://verify.greencalculus.com';
var GC_SIGNUP_URL = 'https://greencalculus.com/developers/welcome?plan=free&ref=sheets';
/** Named range that pins a whole workbook to one data version (item 4). */
var GC_PIN_RANGE = 'GC_AS_OF';
var GC_PIN_SHEET = 'GreenCalculus';
/** Keyed fetches per batch: the free tier allows 30/min, so a 100-key sheet must not fire at once. */
var GC_KEYED_BATCH = 25;

/**
 * The worked example a first-time user inserts with one click (welcome panel
 * and the "Insert a worked example" menu item): a UK grid key, 1,000 kWh, the
 * emissions formula and the citation formula, under a header row.
 */
var GC_EXAMPLE = { key: 'grid.gbr.electricity.location_based', quantity: 1000, quantityLabel: 'kWh' };

/**
 * Build the 2×4 example block. `keyA1` and `qtyA1` are the A1 references of
 * the cells the key and quantity will be written to, so the formulas point at
 * them wherever the block lands.
 */
function gcExampleBlock(keyA1, qtyA1) {
  return {
    headers: ['Factor key', GC_EXAMPLE.quantityLabel, 'kg CO2e', 'Citation'],
    values: [GC_EXAMPLE.key, GC_EXAMPLE.quantity],
    formulas: ['=GC_EMISSIONS(' + keyA1 + ',' + qtyA1 + ')', '=GC_CITE(' + keyA1 + ')'],
  };
}

/** Fields a cell can ask for. `value` is the default. */
var GC_FIELDS = {
  value: 'the factor value (number)',
  unit: 'unit string, e.g. kg CO2e per kWh',
  name: 'human-readable factor name',
  source: 'source id, e.g. DEFRA_2026',
  publisher: 'publishing organisation',
  cell: 'exact source cell reference in the publisher’s workbook',
  retrieved: 'date the row was retrieved from the publisher',
  licence: 'licence name of the source',
  version: 'GreenCalculus data version that served the value',
  gwp: 'GWP set, e.g. AR5_100',
  basis: 'boundary / basis statement for the value',
  scope: 'GHG Protocol scope the factor belongs to',
  citation: 'a ready-to-paste citation line',
  proof: 'public proof URL pinned to the data version',
};

// ── cell messages ───────────────────────────────────────────────────────
// Every message a cell can show names the next action and none names an HTTP
// code: the reader is an analyst, not a developer. Diagnostics (menu) keeps
// the raw detail for the rare case it is needed.
var GC_SIDEBAR_HINT = 'Extensions → GreenCalculus → Open GreenCalculus';
var GC_KEPT = 'already-fetched cells are kept';

function gcUnknownKeyMessage(key) {
  return '#GC_UNKNOWN_KEY: No factor called "' + key + '" — search for it in the sidebar (' + GC_SIDEBAR_HINT + ') or at greencalculus.com/factors';
}
function gcErrorMessage(text) { return '#GC_ERROR: ' + text; }

var GC_MSG = {
  rateLimited: 'Too many lookups this minute — wait 60 s, then press Enter on the cell again; ' + GC_KEPT,
  timedOut: 'This took too long — press Enter on the cell again; ' + GC_KEPT,
  network: 'Could not reach api.greencalculus.com — check the connection, then press Enter on the cell again',
  badReply: 'The API sent a reply this add-in could not read — try again; if it keeps happening, run Extensions → GreenCalculus → Diagnostics',
  noVersion: 'Could not read the current data version — check the connection and try again',
  pinnedNoKey: function (asOf) {
    return 'This workbook is pinned to data version ' + asOf + ' — reading a past version needs a free API key: open the sidebar (' + GC_SIDEBAR_HINT + ') → API key. Get one at ' + GC_SIGNUP_URL;
  },
  badAsOf: function (typed) {
    return '"' + typed + '" is not a data version — use one like 2026.150, or "current"';
  },
  notArchived: function (asked, floor, current) {
    return 'Version ' + asked + ' is not in the archive' + (floor ? ' (it starts at ' + floor + ')' : '')
      + ' — pin to ' + (floor || 'an archived version') + ' or later, or unpin to follow the current version' + (current ? ' (' + current + ')' : '');
  },
};

/**
 * A failed HTTP response as a plain message. `keyed` says whether an API key
 * was sent, which changes what a refusal means. Never echoes the status code.
 */
function gcHttpMessage(code, body, keyed) {
  var detail = body && body.error && body.error.message ? String(body.error.message).replace(/\.$/, '') : '';
  if (code === 401 || code === 403) {
    return keyed
      ? 'Your API key was not accepted — open the sidebar (' + GC_SIDEBAR_HINT + ') → API key and paste a current key from greencalculus.com/developers/'
      : 'This lookup needs a free API key — open the sidebar (' + GC_SIDEBAR_HINT + ') → API key. Get one at ' + GC_SIGNUP_URL;
  }
  if (code === 429) return GC_MSG.rateLimited;
  if (code === 400) return 'The API rejected this request' + (detail ? ' (' + detail + ')' : '') + ' — check the factor key, or search for it in the sidebar';
  if (code >= 500) return 'The GreenCalculus API is having trouble right now — try again in a minute; ' + GC_KEPT;
  if (!code) return GC_MSG.network;
  return 'The lookup failed' + (detail ? ' (' + detail + ')' : '') + ' — try again; if it keeps happening, run Extensions → GreenCalculus → Diagnostics';
}

/**
 * Build the request for one key.
 * Keyless: the open browse route with an exact key prefix (full row, edge-cached).
 * Keyed:   the single-key lookup, which is the only route that honours ?as_of=.
 */
function gcBuildUrl(key, apiKey, asOf) {
  if (apiKey) {
    var u = GC_BASE_URL + '/v1/factors/' + encodeURIComponent(key);
    if (asOf) u += '?as_of=' + encodeURIComponent(asOf);
    return u;
  }
  return GC_BASE_URL + '/v1/factors?key_prefix=' + encodeURIComponent(key) + '&limit=5';
}

/**
 * Normalise a factor key typed into a cell: trim, lower-case, collapse
 * whitespace. Keys are lower-case dotted paths; a stray capital or space is
 * the most common reason a lookup misses.
 */
function gcNormaliseKey(key) {
  if (key === null || key === undefined) return '';
  return String(key).trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Pull the row + envelope out of either response shape into one flat record.
 * Returns null when the key is not present in the response.
 *
 *  - browse:  { meta:{gc_version, licences:{ID:{...}}}, factors:[ROW,...] }
 *  - lookup:  { meta:{gc_version}, factor: ROW, served_version, attribution:{text,url}, ... }
 */
function gcExtract(json, key) {
  if (!json) return null;
  var row = null;
  var version = (json.meta && json.meta.gc_version) || json.served_version || null;
  var attribution = null;
  var proof = null;

  if (Array.isArray(json.factors)) {
    for (var i = 0; i < json.factors.length; i++) {
      if (json.factors[i] && json.factors[i].key === key) { row = json.factors[i]; break; }
    }
    if (!row) return null;
    var lic = json.meta && json.meta.licences && row.source && json.meta.licences[row.source.id];
    if (lic && lic.attribution) attribution = lic.attribution;
    if (lic && lic.publisher) row.__publisher = lic.publisher;
    if (lic && lic.name && !(row.licence && row.licence.name)) row.licence = { name: lic.name };
  } else if (json.factor && json.factor.key === key) {
    row = json.factor;
    if (json.served_version) version = json.served_version;
    // A pin the archive cannot honour: the lookup route serves TODAY's row and
    // labels it. For a workbook pinned for reproducibility that label is not
    // enough — refuse, so the cell says why rather than showing a current
    // value in a workbook that claims a past version.
    if (json.version_pin && json.version_pin.matched === false) {
      var vp = json.version_pin;
      var asked = vp.as_of_requested || vp.as_of || '?';
      var floor = Array.isArray(vp.archived_versions) && vp.archived_versions.length ? vp.archived_versions[0] : '';
      return { __error: GC_MSG.notArchived(asked, floor, vp.current) };
    }
    // `attribution` here is the credit GreenCalculus requires of the caller,
    // NOT the publisher's. The publisher attribution is in `provenance`.
    if (json.attribution && json.attribution.url) proof = json.attribution.url;
    var pv = json.provenance || {};
    if (pv.source_name || pv.publisher) {
      attribution = [pv.source_name, pv.publisher].filter(function (x) { return !!x; }).join(' — ');
    }
    if (pv.publisher) row.__publisher = pv.publisher;
    if (pv.licence && !(row.licence && row.licence.name)) row.licence = { name: pv.licence };
  } else {
    return null;
  }

  var f = row.factor || {};
  var s = row.source || {};
  // The server builds the canonical citation (API PR #109, 2026-09-09):
  // print it VERBATIM when present. gcCitation() assembles the same format
  // only as a fallback for a row that arrives without it.
  var cit = row.citation && typeof row.citation.text === 'string' && row.citation.text ? row.citation : null;
  if (cit && cit.proof_url) proof = cit.proof_url;
  if (!proof && version) proof = GC_VERIFY_URL + '/' + key + '@' + version;

  return {
    key: key,
    name: row.name || null,
    value: (typeof f.value === 'number') ? f.value : null,
    unit: f.unit || null,
    gwp: f.gwp_set || null,
    basis: f.basis || null,
    scope: (row.scope && row.scope.ghg_protocol) || null,
    source: s.id || null,
    publisher: row.__publisher || null,
    cell: s.cell_ref || null,
    retrieved: s.retrieved || null,
    licence: (row.licence && row.licence.name) || null,
    version: version,
    attribution: attribution,
    proof: proof,
    citationText: cit ? cit.text : null,
  };
}

/**
 * The citation line. The API's `citation.text` is printed unchanged; the
 * assembly below exists only for a row that arrives without one and follows
 * the same canonical format (gc-api-gateway src/citation.ts):
 *   <name>. <source — publisher>, cell <cell>, retrieved <date>.
 *   via GreenCalculus data version <v>, factor <key>. <proof URL>
 */
function gcCitation(rec) {
  if (!rec) return '';
  if (rec.citationText) return rec.citationText;
  var parts = [];
  if (rec.name) parts.push(rec.name);
  var who = [rec.attribution || rec.source || ''];
  if (rec.cell) who.push('cell ' + rec.cell);
  if (rec.retrieved) who.push('retrieved ' + rec.retrieved);
  who = who.filter(function (x) { return !!x; });
  if (who.length) parts.push(who.join(', '));
  var via = 'via GreenCalculus';
  if (rec.version) via += ' data version ' + rec.version;
  via += ', factor ' + rec.key;
  parts.push(via);
  var line = parts.join('. ') + '.';
  if (rec.proof) line += ' ' + rec.proof;
  return line;
}

/** Select one field from an extracted record, for the cell. */
function gcField(rec, field) {
  var f = gcNormaliseKey(field || 'value');
  if (f === 'source_cell' || f === 'cell_ref') f = 'cell';
  if (f === 'gwp_set') f = 'gwp';
  if (f === 'url' || f === 'verify') f = 'proof';
  if (!(f in GC_FIELDS)) {
    throw new Error('Unknown field "' + field + '". One of: ' + Object.keys(GC_FIELDS).join(', '));
  }
  if (f === 'citation') return gcCitation(rec);
  var v = rec[f];
  return (v === null || v === undefined) ? '' : v;
}

/**
 * A data version as typed by a person: "2026.150", "v2026.150", " 2026.150 ".
 * Returns the canonical form or null. "current" / "latest" / "" mean no pin.
 */
function gcNormaliseVersion(v) {
  if (v === null || v === undefined) return null;
  var t = String(v).trim().toLowerCase().replace(/^v/, '');
  if (!t || t === 'current' || t === 'latest' || t === 'none') return null;
  return /^\d{4}\.\d{1,3}$/.test(t) ? t : null;
}

/** Explicit cell argument beats the workbook pin; "current" escapes the pin. */
function gcEffectiveAsOf(explicit, pin) {
  if (explicit !== null && explicit !== undefined && String(explicit).trim() !== '') {
    var e = String(explicit).trim().toLowerCase();
    if (e === 'current' || e === 'latest') return null;
    return gcNormaliseVersion(explicit) || 'INVALID:' + String(explicit).trim();
  }
  return gcNormaliseVersion(pin);
}

/** Split an array into batches of n. */
function gcChunk(arr, n) {
  var out = [];
  for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Column order for GC_FACTOR_ROW. */
var GC_ROW_FIELDS = ['value', 'unit', 'source', 'cell', 'version', 'citation'];

/**
 * Turn whatever Sheets passed (a string, a 1-D array, or a 2-D range) into
 * a 2-D array of normalised keys plus the list of unique non-empty keys, so
 * a range of 300 cells with 12 distinct keys costs 12 fetches.
 */
function gcCollectKeys(input) {
  var grid;
  if (Array.isArray(input)) {
    grid = input.map(function (r) { return Array.isArray(r) ? r : [r]; });
  } else {
    grid = [[input]];
  }
  var keys = grid.map(function (r) { return r.map(gcNormaliseKey); });
  var seen = {};
  var unique = [];
  keys.forEach(function (r) {
    r.forEach(function (k) { if (k && !seen[k]) { seen[k] = true; unique.push(k); } });
  });
  return { grid: keys, unique: unique, isScalar: !Array.isArray(input) };
}

/**
 * Map a 2-D key grid to a 2-D output grid using `lookup(key) -> record|null`
 * and `pick(record) -> cell value`. Empty input cells stay empty; a missing
 * key becomes an error string the analyst can read in the cell.
 */
function gcMapGrid(collected, records, pick) {
  var out = collected.grid.map(function (r) {
    return r.map(function (k) {
      if (!k) return '';
      var rec = records[k];
      if (!rec) return gcUnknownKeyMessage(k);
      if (rec.__error) return gcErrorMessage(rec.__error);
      return pick(rec);
    });
  });
  return collected.isScalar ? out[0][0] : out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GC_BASE_URL: GC_BASE_URL, GC_VERIFY_URL: GC_VERIFY_URL, GC_FIELDS: GC_FIELDS, GC_ROW_FIELDS: GC_ROW_FIELDS,
    gcBuildUrl: gcBuildUrl, gcNormaliseKey: gcNormaliseKey, gcExtract: gcExtract, gcCitation: gcCitation,
    gcField: gcField, gcCollectKeys: gcCollectKeys, gcMapGrid: gcMapGrid,
    GC_PIN_RANGE: GC_PIN_RANGE, GC_PIN_SHEET: GC_PIN_SHEET, GC_KEYED_BATCH: GC_KEYED_BATCH,
    gcNormaliseVersion: gcNormaliseVersion, gcEffectiveAsOf: gcEffectiveAsOf, gcChunk: gcChunk,
    GC_EXAMPLE: GC_EXAMPLE, gcExampleBlock: gcExampleBlock,
    GC_MSG: GC_MSG, gcHttpMessage: gcHttpMessage, gcUnknownKeyMessage: gcUnknownKeyMessage, gcErrorMessage: gcErrorMessage,
  };
}
