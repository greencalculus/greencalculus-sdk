#!/usr/bin/env node
/**
 * Execute every request in the collection.
 *
 * WHY. A Postman collection is published to strangers who press Send before
 * they read anything. The v0.1.0 collection shipped 6 of the API's 26
 * operations and was never run; when it was finally executed on 2026-09-12 the
 * browse request would not even leave curl, because a spec example carried an
 * unencoded space. So: every request, every time.
 *
 * The keyless requests are the point of the collection — they run the moment
 * someone imports it, with no signup. They are sent here with NO Authorization
 * header at all, because that is the claim being tested.
 *
 *   node check-collection.mjs                       # keyless only (CI-safe)
 *   GREENCALCULUS_API_KEY=gc_… node check-collection.mjs   # the keyed ones too
 *   GC_CHECK_MUTATIONS=1 …                          # and the account writes
 */
import { readFile } from 'node:fs/promises';

const FILE = process.argv[2] || new URL('./greencalculus.postman_collection.json', import.meta.url).pathname;
const KEY = process.env.GREENCALCULUS_API_KEY || '';
const MUTATE = process.env.GC_CHECK_MUTATIONS === '1';

const collection = JSON.parse(await readFile(FILE, 'utf8'));
const vars = Object.fromEntries((collection.variable || []).map(v => [v.key, v.value]));
const rows = [];

function expand(raw) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), raw);
}

async function send(item, folder) {
  const req = item.request;
  const url = expand(typeof req.url === 'string' ? req.url : req.url.raw);
  const keyless = req.auth?.type === 'noauth';
  const writesAccount = req.method !== 'GET' && url.includes('/v1/account/');

  if (!keyless && !KEY) return rows.push(['skip', '—', folder, item.name, 'needs a key']);
  if (writesAccount && !MUTATE) return rows.push(['skip', '—', folder, item.name, 'writes account state']);

  const init = { method: req.method, headers: {} };
  if (!keyless) init.headers.Authorization = `Bearer ${KEY}`;
  if (req.body?.raw) {
    init.headers['Content-Type'] = 'application/json';
    init.body = req.body.raw;
  }

  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) });
  } catch (err) {
    return rows.push(['FAIL', 'ERR', folder, item.name, err.message]);
  }
  // 403 on a keyed request is an entitlement (a plan that excludes the
  // endpoint), not a broken request. On a KEYLESS one it is the collection
  // lying about what runs without a key, and that is a failure.
  const ok = res.ok || (res.status === 403 && !keyless);
  rows.push([ok ? 'ok' : 'FAIL', String(res.status), folder, item.name, keyless ? 'keyless' : 'keyed']);
}

async function walk(items, folder = '') {
  for (const item of items) {
    if (item.item) await walk(item.item, item.name);
    else await send(item, folder);
  }
}

await walk(collection.item);

const width = Math.max(...rows.map(r => r[3].length));
for (const [status, code, folder, name, note] of rows) {
  const flag = status === 'ok' ? '  ' : status === 'skip' ? '··' : '!!';
  console.log(`${flag} ${code.padStart(4)}  ${folder.padEnd(10)} ${name.padEnd(width)}  ${note}`);
}
const failed = rows.filter(r => r[0] === 'FAIL');
const skipped = rows.filter(r => r[0] === 'skip').length;
console.log(`\n${rows.length} requests · ${failed.length} failing · ${skipped} skipped`);
process.exit(failed.length ? 1 : 0);
