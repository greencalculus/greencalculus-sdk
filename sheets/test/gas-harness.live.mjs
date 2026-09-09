// Runs Code.js under stubbed Apps Script globals, LIVE against the API.
// Not a unit test — a pre-push smoke check: `node test/gas-harness.live.mjs`.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const props = {}; const cache = {};
// Workbook state: named range GC_AS_OF lives in a fake spreadsheet.
const wb = { named: {}, sheets: {}, active: { formula: null, a1: 'C7' } };
const mkRange = (store, addr) => ({
  getValue: () => store[addr] ?? '', setValue: (v) => { store[addr] = v; return mkRange(store, addr); },
  clearContent: () => { store[addr] = ''; }, setFontFamily: () => mkRange(store, addr), setFontWeight: () => mkRange(store, addr),
  setValues: (vv) => { store[addr] = vv; return mkRange(store, addr); }, getCell: () => wb.active, setFormula: (f) => { wb.active.formula = f; }, getA1Notation: () => wb.active.a1,
});
wb.active.setFormula = (f) => { wb.active.formula = f; }; wb.active.getA1Notation = () => wb.active.a1;
const mkSheet = (name) => ({ store: {}, getRange: function (a) { return mkRange(this.store, a); }, setColumnWidth: () => {} });
const ss = {
  getRangeByName: (n) => wb.named[n] || null,
  setNamedRange: (n, r) => { wb.named[n] = r; },
  getSheetByName: (n) => wb.sheets[n] || null,
  insertSheet: (n) => { wb.sheets[n] = mkSheet(n); return wb.sheets[n]; },
  getActiveRange: () => ({ getCell: () => wb.active }),
};
const res = (r) => ({ getResponseCode: () => r.status, getContentText: () => r.text, getHeaders: () => ({}) });
const ctx = {
  console,
  PropertiesService: { getUserProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k,v) => { props[k]=v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ getAll: ks => Object.fromEntries(ks.filter(k => k in cache).map(k => [k, cache[k]])), putAll: (o) => Object.assign(cache, o) }) },
  UrlFetchApp: {
    fetchAll: (reqs) => reqs.map(r => { const x = ctx.__sync(r.url, r.headers); return res(x); }),
    fetch: (url, o) => res(ctx.__sync(url, o.headers)),
  },
  SpreadsheetApp: { getUi: () => ({}), getActiveSpreadsheet: () => ss }, HtmlService: {},
  Utilities: { sleep: (ms) => { const t = Date.now() + Math.min(ms, 50); while (Date.now() < t) {} } },
  Date,
};
// synchronous HTTP via child process (Apps Script fetch is sync; keep the harness faithful)
import { execFileSync } from 'node:child_process';
ctx.__sync = (url, headers) => {
  const args = ['-s', '-o', '/dev/stderr', '-w', '%{http_code}', url];
  for (const [k, v] of Object.entries(headers || {})) args.push('-H', `${k}: ${v}`);
  let text = '', status = 0;
  try {
    const out = execFileSync('curl', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 50e6 });
    status = Number(out);
  } catch (e) { status = Number(e.stdout) || 0; text = String(e.stderr || ''); }
  if (!text) { const r = execFileSync('curl', ['-s', ...args.slice(5)], { encoding: 'utf8', maxBuffer: 50e6, stdio: ['ignore','pipe','ignore'] }); text = r; }
  return { status, text };
};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../src/core.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('../src/Code.js', import.meta.url), 'utf8'), ctx);

const K = 'grid.gbr.electricity.location_based';
const show = (label, v) => console.log(label.padEnd(34), JSON.stringify(v));
show('GC_FACTOR(key)', ctx.GC_FACTOR(K));
show('GC_FACTOR(key,"cell")', ctx.GC_FACTOR(K, 'cell'));
show('GC_FACTOR(key,"citation")', ctx.GC_FACTOR(K, 'citation'));
show('GC_FACTOR(range,"unit")', ctx.GC_FACTOR([[K, 'grid.deu.electricity.lifecycle_intensity'], ['', 'grid.nope.x']], 'unit'));
show('GC_FACTOR(key,"value","2026.150")', ctx.GC_FACTOR(K, 'value', '2026.150'));
show('GC_FACTOR_ROW(key,TRUE)', ctx.GC_FACTOR_ROW(K, true));
show('GC_CITE(key)', ctx.GC_CITE(K));
show('GC_EMISSIONS(key,1000)', ctx.GC_EMISSIONS(K, 1000));
show('GC_EMISSIONS(range,range)', ctx.GC_EMISSIONS([[K],[K]], [[1000],[250]]));
show('GC_SEARCH("diesel litre",3)', ctx.GC_SEARCH('diesel litre', 3));
show('cache entries after run', Object.keys(cache).length);
show('GC_VERSION()', ctx.GC_VERSION());
show('sidebar state (no key)', ctx.gcSidebarState());
show('sidebar search', ctx.gcSidebarSearch('uk grid').slice(0, 2));
show('insert formula', [ctx.gcInsertFormula(K, 'cite'), wb.active.formula]);
let pinErr = ''; try { ctx.gcPinWorkbook(''); } catch (e) { pinErr = e.message; } show('pin without key → throws', pinErr);
// Simulate a pinned workbook whose owner has no key: must show a message, never a current value.
wb.named.GC_AS_OF = mkRange({}, 'B1'); wb.named.GC_AS_OF.setValue('2026.150');
show('GC_FACTOR pinned, no key', ctx.GC_FACTOR(K));
show('GC_FACTOR pinned, as_of="current"', ctx.GC_FACTOR(K, 'value', 'current'));
show('GC_FACTOR pinned, junk as_of', ctx.GC_FACTOR(K, 'value', 'yesterday'));
show('GC_VERSION() pinned', ctx.GC_VERSION());
ctx.gcUnpinWorkbook(); show('after unpin GC_VERSION()', ctx.GC_VERSION());
// With a (fake) key the keyed route is used; a bad key must surface the gateway's 401 as a cell message.
props.GC_API_KEY = 'gc_live_notarealkey000';
show('bad key, pinned → 401 message', ctx.GC_FACTOR(K, 'value', '2026.150'));
show('sidebar state (key set)', ctx.gcSidebarState().keyMasked);
if (process.env.GC_API_KEY) {
  props.GC_API_KEY = process.env.GC_API_KEY;
  console.log('\n— with a REAL key (GC_API_KEY set) —');
  show('GC_FACTOR(key) keyed', ctx.GC_FACTOR(K));
  show('GC_FACTOR(key,"version","2026.150")', ctx.GC_FACTOR(K, 'version', '2026.150'));
  show('GC_FACTOR(key,"value","2026.150")', ctx.GC_FACTOR(K, 'value', '2026.150'));
  show('GC_CITE pinned 2026.150', ctx.GC_CITE(K));
  ctx.gcPinWorkbook('2026.150'); show('pin via sidebar → GC_VERSION()', ctx.GC_VERSION());
  show('GC_FACTOR_ROW pinned', ctx.GC_FACTOR_ROW(K));
  ctx.gcUnpinWorkbook();
} else {
  console.log('\n(set GC_API_KEY=gc_live_… to also exercise the keyed, pinned as_of path)');
}
