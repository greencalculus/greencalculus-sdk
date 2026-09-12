#!/usr/bin/env node
/**
 * The collection must still describe the API the spec describes.
 *
 * WHY. The collection was GENERATED from https://api.greencalculus.com/openapi.json
 * once, by hand, on 2026-09-12. Generation is not a property a file keeps — it is
 * an event that happened to it. From the moment it was committed, the collection
 * and the spec became two independently editable copies of the same 28 worked
 * examples, each with its own gate proving it answers 200, and nothing proving
 * they still agree with each other.
 *
 * That is the failure gc-api-gateway#118 had just finished fixing, one level up.
 * #118 found `cursor=2026.182` in the spec — a version older than the change
 * feed's own record_begins, so the documented example was one the API is built to
 * reject. It was fixed in the spec. The collection carries its own copy of that
 * value and was fixed separately. Next time a pin ages out, whichever artifact is
 * edited first is right and the other ships the broken default — and the
 * collection is the one strangers press Send on before reading anything.
 *
 * check-collection.mjs cannot see this. It proves every request in the collection
 * answers; it has no opinion on whether the spec asks for that request.
 *
 * WHAT FAILS THE BUILD.
 *   - An operation in the spec with no request in the collection, or a request
 *     with no operation. Coverage is the whole claim of a published collection.
 *   - A collection value that CONTRADICTS a declared spec example: a different
 *     path parameter, a different query value, a different request body.
 *   - A query parameter the spec does not document at all. Parameters Postman
 *     has DISABLED are ignored — they are never sent, they sit in the request to
 *     show a reader the option exists.
 *
 * WHAT DOES NOT FAIL THE BUILD. Values the spec declares no example for — it
 * names the parameter but pins nothing, so the collection had to invent one.
 * These are printed, loudly, because nothing governs them and nothing will
 * notice when they rot; but they are not a disagreement between two documents,
 * and failing on them would only push authors to delete the example rather than
 * pin it in the spec. Fix them in the spec, and this gate starts enforcing them.
 *
 * AUTH IS DELIBERATELY NOT CHECKED HERE. The collection marks a request keyless
 * from MEASURED behaviour, not from the spec's `security` block; the two
 * disagreed on six endpoints until #118, and measurement was right. That claim
 * is tested where it belongs — by check-collection.mjs, which sends the keyless
 * ones with no Authorization header at all.
 *
 *   node check-collection-parity.mjs            # against the live spec
 *   GC_SPEC_URL=… node check-collection-parity.mjs
 */
import { readFile } from 'node:fs/promises';

const SPEC_URL = process.env.GC_SPEC_URL || 'https://api.greencalculus.com/openapi.json';
const FILE = process.argv[2] || new URL('./greencalculus.postman_collection.json', import.meta.url).pathname;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const collection = JSON.parse(await readFile(FILE, 'utf8'));
const spec = await (await fetch(SPEC_URL, { signal: AbortSignal.timeout(25000) })).json();

/** Every operation the spec documents. */
const ops = [];
for (const [path, item] of Object.entries(spec.paths || {}))
  for (const [method, op] of Object.entries(item))
    if (METHODS.includes(method)) ops.push({ method: method.toUpperCase(), path, op });

/** Every request the collection ships, flattened out of its folders. */
const reqs = [];
(function walk(items, folder = '') {
  for (const i of items) {
    if (i.item) walk(i.item, i.name);
    else if (i.request) reqs.push({ folder, name: i.name, req: i.request });
  }
})(collection.item);

const bare = u => (typeof u === 'string' ? u : u.raw || '').replace(/\{\{[A-Za-z_]+\}\}/, '').split('?')[0].replace(/\/$/, '');
const rx = path => new RegExp('^' + path.replace(/\./g, '\\.').replace(/\{[^}]+\}/g, '[^/]+') + '$');
const stable = v => JSON.stringify(v, Object.keys(v || {}).sort ? undefined : undefined);
const deep = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  return v;
}

const contradictions = [];
const ungoverned = [];
const matched = new Map();

for (const r of reqs) {
  const hit = ops.find(o => o.method === r.req.method && rx(o.path).test(bare(r.req.url)));
  if (hit) matched.set(hit, r);
  r.op = hit;
}

/* ---- 1. Coverage, both directions ------------------------------------- */
const missing = ops.filter(o => !matched.has(o));
const extra = reqs.filter(r => !r.op);

/* ---- 2. Do the matched pairs describe the same request? ---------------- */
for (const [o, r] of matched) {
  const where = `${o.method} ${o.path}`;
  const params = o.op.parameters || [];
  const url = r.req.url;

  // Path parameters: compare segment by segment against the spec's example.
  const tmpl = o.path.replace(/^\//, '').split('/');
  const actual = typeof url === 'string' ? bare(url).replace(/^\//, '').split('/') : (url.path || []);
  tmpl.forEach((seg, i) => {
    const m = seg.match(/^\{(.+)\}$/);
    if (!m) return;
    const p = params.find(x => x.in === 'path' && x.name === m[1]);
    const got = actual[i];
    if (!p || p.example === undefined) return ungoverned.push([where, `path:${m[1]}`, got, 'spec declares no example']);
    if (String(p.example) !== String(got)) contradictions.push([where, `path:${m[1]}`, `spec ${p.example} ≠ collection ${got}`]);
  });

  // Query parameters the collection actually sends.
  const query = (typeof url === 'object' && url.query) || [];
  for (const q of query) {
    if (q.disabled) continue;   // Postman never sends it; it is there to show the reader the option exists.
    const p = params.find(x => x.in === 'query' && x.name === q.key);
    if (!p) { contradictions.push([where, `query:${q.key}`, 'not documented in the spec at all']); continue; }
    if (p.example === undefined) { ungoverned.push([where, `query:${q.key}`, q.value, 'spec declares no example']); continue; }
    if (String(p.example) !== String(q.value)) contradictions.push([where, `query:${q.key}`, `spec ${p.example} ≠ collection ${q.value}`]);
  }

  // Request body against the spec's own worked example.
  const raw = r.req.body?.raw;
  const ex = o.op.requestBody?.content?.['application/json']?.example;
  if (raw && ex === undefined) ungoverned.push([where, 'body', '(sent)', 'spec declares no requestBody example']);
  else if (raw && ex !== undefined) {
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { contradictions.push([where, 'body', 'collection body is not valid JSON']); continue; }
    if (!deep(parsed, ex)) contradictions.push([where, 'body', 'differs from the spec example']);
  } else if (!raw && ex !== undefined) contradictions.push([where, 'body', 'spec documents a body, the collection sends none']);
}

/* ---- Report ------------------------------------------------------------ */
console.log('collection ↔ spec parity');
console.log('────────────────────────');
console.log(`  spec ${ops.length} operations · collection ${reqs.length} requests · matched ${matched.size}`);

if (missing.length) {
  console.log('\n  IN THE SPEC, NOT IN THE COLLECTION:');
  for (const o of missing) console.log(`    ${o.method} ${o.path}`);
}
if (extra.length) {
  console.log('\n  IN THE COLLECTION, NOT IN THE SPEC:');
  for (const r of extra) console.log(`    ${r.req.method} ${bare(r.req.url)}  (${r.folder} — ${r.name})`);
}
if (contradictions.length) {
  console.log('\n  THE TWO DOCUMENTS DISAGREE:');
  const w = Math.max(...contradictions.map(c => c[0].length));
  for (const [where, what, why] of contradictions) console.log(`    ${where.padEnd(w)}  ${what}  ${why}`);
}
if (ungoverned.length) {
  console.log('\n  Ungoverned — the collection invented these, nothing in the spec pins them:');
  const w = Math.max(...ungoverned.map(u => u[0].length));
  for (const [where, what, got, why] of ungoverned) console.log(`    ${where.padEnd(w)}  ${what} = ${got}  (${why})`);
  console.log('    Pin them in the spec and this gate will enforce them.');
}

const failures = missing.length + extra.length + contradictions.length;
console.log(failures
  ? `\n  FAIL — ${failures} divergence(s) between the collection and the spec.`
  : `\n  PASS — every documented example is the same in both.${ungoverned.length ? ` ${ungoverned.length} ungoverned value(s) above.` : ''}`);
process.exit(failures ? 1 : 0);
