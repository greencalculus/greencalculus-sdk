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
const lookup = {
  meta: { gc_version: '2026.186' }, served_version: '2026.181',
  factor: browse.factors[1],
  attribution: { text: 'UK Government GHG Conversion Factors 2026 — DESNZ', url: 'https://verify.greencalculus.com/' + KEY + '@2026.181', required: true },
  provenance: { publisher: 'DESNZ' },
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
  assert.equal(r.attribution, 'UK Government GHG Conversion Factors 2026 — DESNZ');
});
test('citation line carries attribution, cell, retrieval, version, key and proof', () => {
  const c = core.gcCitation(core.gcExtract(browse, KEY));
  assert.equal(c, 'UK Government GHG Conversion Factors 2026 — Department for Energy Security and Net Zero (DESNZ). '
    + "cell 'UK electricity'!E25, retrieved 2026-06-18. via GreenCalculus data version 2026.186, factor " + KEY + '. '
    + 'https://verify.greencalculus.com/' + KEY + '@2026.186');
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
  assert.deepEqual(out, [[0.13096, '#GC_UNKNOWN_KEY: grid.x'], ['']]);
  const err = core.gcMapGrid(core.gcCollectKeys(KEY), { [KEY]: { __error: 'HTTP 503' } }, r => r.value);
  assert.equal(err, '#GC_ERROR: HTTP 503');
});
