import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../src/core.js');

const KEY = 'grid.gbr.electricity.location_based';

// A real keyless browse response, trimmed (captured 2026-09-09).
const browse = {
  meta: { gc_version: '2026.186', licences: { DEFRA_2026: {
    name: 'Open Government Licence v3.0', publisher: 'Department for Energy Security and Net Zero (DESNZ)',
    attribution: 'UK Government GHG Conversion Factors 2026 — Department for Energy Security and Net Zero (DESNZ)' } } },
  factors: [
    { key: KEY + '_other', factor: { value: 1 } },
    { key: KEY, name: 'UK grid electricity — location-based (generation)', section: 'grid',
      factor: { value: 0.13096, unit: 'kg CO2e per kWh', gwp_set: 'AR5_100', basis: 'generation basis' },
      source: { id: 'DEFRA_2026', cell_ref: "'UK electricity'!E25", retrieved: '2026-06-18' },
      scope: { ghg_protocol: 'scope2' }, licence: { name: 'Open Government Licence v3.0' } },
  ],
};

// The keyed single-key lookup shape (from the OpenAPI FactorLookup schema).
// Captured live 2026-09-09: `attribution` is OUR required credit, the
// publisher lives in `provenance`.
const lookup = {
  meta: { gc_version: '2026.186' }, served_version: '2026.181',
  factor: browse.factors[1],
  attribution: { text: 'Emission data & calculations by GreenCalculus — greencalculus.com', url: 'https://verify.greencalculus.com/' + KEY + '@2026.181', required: true },
  provenance: { source_id: 'DEFRA_2026', source_name: 'UK Government GHG Conversion Factors 2026', publisher: 'Department for Energy Security and Net Zero (DESNZ)',
    cell_ref: "'UK electricity'!E25", retrieved: '2026-06-18', licence: 'Open Government Licence v3.0' },
};

test('keyless URL uses the open browse route with an exact prefix', () => {
  assert.equal(core.gcBuildUrl(KEY, null, null), 'https://api.greencalculus.com/v1/factors?key_prefix=' + encodeURIComponent(KEY) + '&limit=5');
});
test('keyed URL uses the single-key lookup and carries as_of', () => {
  assert.equal(core.gcBuildUrl(KEY, 'gc_live_x', '2026.150'), 'https://api.greencalculus.com/v1/factors/' + encodeURIComponent(KEY) + '?as_of=2026.150');
  assert.equal(core.gcBuildUrl(KEY, 'gc_live_x'), 'https://api.greencalculus.com/v1/factors/' + encodeURIComponent(KEY));
});
test('key normalisation', () => {
  assert.equal(core.gcNormaliseKey('  Grid.GBR.Electricity.Location_Based '), KEY);
  assert.equal(core.gcNormaliseKey(null), '');
});
test('extract picks the exact key out of a prefix over-match', () => {
  const r = core.gcExtract(browse, KEY);
  assert.equal(r.value, 0.13096);
  assert.equal(r.unit, 'kg CO2e per kWh');
  assert.equal(r.cell, "'UK electricity'!E25");
  assert.equal(r.source, 'DEFRA_2026');
  assert.equal(r.version, '2026.186');
  assert.equal(r.publisher, 'Department for Energy Security and Net Zero (DESNZ)');
  assert.equal(r.proof, 'https://verify.greencalculus.com/' + KEY + '@2026.186');
  assert.equal(core.gcExtract(browse, 'grid.nope'), null);
});
test('extract from the keyed lookup prefers served_version and the API proof URL', () => {
  const r = core.gcExtract(lookup, KEY);
  assert.equal(r.version, '2026.181');
  assert.equal(r.proof, 'https://verify.greencalculus.com/' + KEY + '@2026.181');
  assert.equal(r.attribution, 'UK Government GHG Conversion Factors 2026 — Department for Energy Security and Net Zero (DESNZ)');
  assert.equal(r.licence, 'Open Government Licence v3.0');
  assert.ok(!core.gcCitation(r).includes('Emission data & calculations by GreenCalculus'), 'our own credit must not pose as the publisher');
});
test('a pin the archive cannot honour is refused, not relabelled', () => {
  const r = core.gcExtract({ ...lookup, served_version: '2026.186', version_pin: { as_of_requested: '2026.100', current: '2026.186', matched: false, archived_versions: ['2026.111', '2026.112'] } }, KEY);
  assert.match(r.__error, /Version 2026\.100 is not in the archive \(it starts at 2026\.111\) — pin to 2026\.111 or later, or unpin/);
});
const CANON = 'UK grid electricity — location-based (generation). '
  + 'UK Government GHG Conversion Factors 2026 — Department for Energy Security and Net Zero (DESNZ), '
  + "cell 'UK electricity'!E25, retrieved 2026-06-18. via GreenCalculus data version 2026.186, factor " + KEY + '. '
  + 'https://verify.greencalculus.com/' + KEY + '@2026.186';
test('a row WITH the server citation prints it verbatim, proof URL included', () => {
  const row = { ...browse.factors[1], citation: { text: 'SERVER SAYS SO', source_id: 'DEFRA_2026', cell_ref: "'UK electricity'!E25", version: '2026.186', proof_url: 'https://verify.greencalculus.com/x@2026.186' } };
  const r = core.gcExtract({ ...browse, factors: [row] }, KEY);
  assert.equal(core.gcCitation(r), 'SERVER SAYS SO');
  assert.equal(core.gcField(r, 'citation'), 'SERVER SAYS SO');
  assert.equal(r.proof, 'https://verify.greencalculus.com/x@2026.186', 'proof comes from the citation object when present');
  const lk = core.gcExtract({ ...lookup, factor: row }, KEY);
  assert.equal(core.gcCitation(lk), 'SERVER SAYS SO', 'lookup shape too');
});
test('a row WITHOUT it falls back to the same canonical format', () => {
  const c = core.gcCitation(core.gcExtract(browse, KEY));
  assert.equal(c, CANON);
});
test('field selection, aliases and unknown fields', () => {
  const r = core.gcExtract(browse, KEY);
  assert.equal(core.gcField(r, undefined), 0.13096);
  assert.equal(core.gcField(r, 'CELL'), "'UK electricity'!E25");
  assert.equal(core.gcField(r, 'source_cell'), "'UK electricity'!E25");
  assert.equal(core.gcField(r, 'gwp_set'), 'AR5_100');
  assert.equal(core.gcField(r, 'scope'), 'scope2');
  assert.equal(core.gcField(r, 'proof'), 'https://verify.greencalculus.com/' + KEY + '@2026.186');
  assert.throws(() => core.gcField(r, 'price'), /Unknown field/);
});
test('collectKeys batches a 2-D range down to unique keys and keeps shape', () => {
  const c = core.gcCollectKeys([[KEY, ''], ['GRID.GBR.electricity.location_based', 'grid.deu.electricity.lifecycle_intensity']]);
  assert.deepEqual(c.unique, [KEY, 'grid.deu.electricity.lifecycle_intensity']);
  assert.equal(c.isScalar, false);
  const s = core.gcCollectKeys(KEY);
  assert.equal(s.isScalar, true);
  assert.deepEqual(s.unique, [KEY]);
});
test('mapGrid returns scalar for scalar input, grid for range input, readable misses', () => {
  const recs = { [KEY]: core.gcExtract(browse, KEY) };
  assert.equal(core.gcMapGrid(core.gcCollectKeys(KEY), recs, r => r.value), 0.13096);
  const out = core.gcMapGrid(core.gcCollectKeys([[KEY, 'grid.x'], ['']]), recs, r => r.value);
  assert.equal(out[0][0], 0.13096);
  assert.match(out[0][1], /^#GC_UNKNOWN_KEY: No factor called "grid\.x" — search for it in the sidebar/);
  assert.deepEqual(out[1], ['']);
  const err = core.gcMapGrid(core.gcCollectKeys(KEY), { [KEY]: { __error: 'x' } }, r => r.value);
  assert.equal(err, '#GC_ERROR: x');
});

test('version normalisation accepts human forms and rejects junk', () => {
  assert.equal(core.gcNormaliseVersion(' v2026.150 '), '2026.150');
  assert.equal(core.gcNormaliseVersion('2026.9'), '2026.9');
  assert.equal(core.gcNormaliseVersion('current'), null);
  assert.equal(core.gcNormaliseVersion(''), null);
  assert.equal(core.gcNormaliseVersion('2026'), null);
  assert.equal(core.gcNormaliseVersion('latest-ish'), null);
});
test('effective as_of: explicit beats pin, "current" escapes the pin, junk is flagged', () => {
  assert.equal(core.gcEffectiveAsOf(undefined, '2026.150'), '2026.150');
  assert.equal(core.gcEffectiveAsOf('2026.120', '2026.150'), '2026.120');
  assert.equal(core.gcEffectiveAsOf('current', '2026.150'), null);
  assert.equal(core.gcEffectiveAsOf('', '2026.150'), '2026.150');
  assert.equal(core.gcEffectiveAsOf(undefined, null), null);
  assert.equal(core.gcEffectiveAsOf('yesterday', null), 'INVALID:yesterday');
});
test('chunk', () => {
  assert.deepEqual(core.gcChunk([1,2,3,4,5], 2), [[1,2],[3,4],[5]]);
  assert.deepEqual(core.gcChunk([], 3), []);
});

test('gcExampleBlock: formulas point at the key and amount cells; citation cell is a HYPERLINK to the proof page', () => {
  const b = core.gcExampleBlock('C8', 'D8');
  assert.deepEqual(b.headers, ['Factor key', 'Amount', 'Unit', 'kg CO2e', 'Citation (click for proof)']);
  assert.deepEqual(b.values, [core.GC_EXAMPLE.key, 1000, 'kWh']);
  assert.deepEqual(b.formulas, ['=GC_EMISSIONS(C8,D8)', '=HYPERLINK(GC_FACTOR(C8,"proof"),GC_CITE(C8,"short"))']);
  assert.equal(b.headers.length, b.values.length + b.formulas.length);
  const second = core.gcExampleBlock('A3', 'B3', core.GC_EXAMPLE_ROWS[1]);
  assert.deepEqual(second.values, ['fuels.gbr.diesel_average_biofuel_blend.litre', 500, 'litres']);
  assert.equal(core.gcCitationLinkFormula('"grid.x"'), '=HYPERLINK(GC_FACTOR("grid.x","proof"),GC_CITE("grid.x","short"))');
});
test('short citation: source id, source cell, data version — from fields, never prose', () => {
  const r = core.gcExtract(browse, KEY);
  assert.equal(core.gcCitationShort(r), "DEFRA_2026, 'UK electricity'!E25, v2026.186");
  assert.equal(core.gcField(r, 'short'), core.gcCitationShort(r));
  assert.equal(core.gcField(r, 'citation_short'), core.gcCitationShort(r));
  assert.equal(core.gcCitationShort({ key: 'x', source: null, cell: null, version: '2026.186' }), 'GreenCalculus, v2026.186');
});

// Playbook 1.2: every cell message names the next action and none names an HTTP code.
const NAMES_A_CODE = /\bHTTP\b|\b[45]\d\d\b/;
test('gcHttpMessage: plain language for every status, never the code', () => {
  const body = { error: { message: 'Missing or invalid API key.' } };
  for (const code of [400, 401, 403, 404, 418, 429, 500, 502, 503, 0]) {
    for (const keyed of [true, false]) {
      const m = core.gcHttpMessage(code, body, keyed);
      assert.doesNotMatch(m, NAMES_A_CODE, `${code} keyed=${keyed}: ${m}`);
      assert.match(m, / — /, `${code} keyed=${keyed} names no next action: ${m}`);
    }
  }
  assert.match(core.gcHttpMessage(401, body, true), /API key was not accepted — open the sidebar/);
  assert.match(core.gcHttpMessage(401, body, false), /needs a free API key — open the sidebar/);
  assert.match(core.gcHttpMessage(429, null, false), /^Too many lookups this minute — wait 60 s/);
  assert.match(core.gcHttpMessage(503, null, false), /having trouble right now — try again in a minute/);
  assert.match(core.gcHttpMessage(0, null, false), /^Could not reach api\.greencalculus\.com/);
});
test('GC_MSG: fixed messages name the next action, not a code', () => {
  const all = [core.GC_MSG.rateLimited, core.GC_MSG.timedOut, core.GC_MSG.network, core.GC_MSG.badReply, core.GC_MSG.noVersion,
    core.GC_MSG.pinnedNoKey('2026.150'), core.GC_MSG.badAsOf('yesterday'), core.GC_MSG.notArchived('2026.100', '2026.111', '2026.186'), core.GC_MSG.notArchived('2026.100', '', null),
    core.gcUnknownKeyMessage('grid.nope')];
  for (const m of all) { assert.doesNotMatch(m, NAMES_A_CODE, m); assert.match(m, / — /, m); }
  assert.match(core.GC_MSG.pinnedNoKey('2026.150'), /pinned to data version 2026\.150 — .*open the sidebar \(Extensions → GreenCalculus → Open GreenCalculus\) → API key/);
  assert.match(core.GC_MSG.badAsOf('yesterday'), /"yesterday" is not a data version — use one like 2026\.150, or "current"/);
});

test('a number or a GC message fed as a key is named as such, never fetched, never quoted back as a key', () => {
  const c = core.gcCollectKeys([[0.13096], ['#GC_UNKNOWN_KEY: No factor called "x"'], [KEY], ['']]);
  assert.deepEqual(c.unique, [KEY], 'only the real key is fetched');
  const out = core.gcMapGrid(c, { [KEY]: core.gcExtract(browse, KEY) }, r => r.value);
  assert.match(out[0][0], /^#GC_ERROR: That cell holds a number \(0\.13096\), not a factor key — point this formula at the cell with the key text/);
  assert.match(out[1][0], /^#GC_ERROR: That cell holds an error, not a factor key — fix that cell first/);
  assert.equal(out[2][0], 0.13096);
  assert.equal(out[3][0], '');
  assert.equal(core.gcKeyProblem(' 1000 '), core.gcKeyProblem(1000).replace('(1000)', '(1000)'));
  assert.equal(core.gcKeyProblem('grid.gbr.electricity.location_based'), null);
});
