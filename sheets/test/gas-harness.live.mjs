// Runs Code.js under stubbed Apps Script globals, LIVE against the API.
// Not a unit test — a pre-push smoke check: `node test/gas-harness.live.mjs`.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const props = {}; const cache = {};
const res = (r) => ({ getResponseCode: () => r.status, getContentText: () => r.text });
const ctx = {
  console,
  PropertiesService: { getUserProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k,v) => { props[k]=v; }, deleteProperty: k => { delete props[k]; } }) },
  CacheService: { getScriptCache: () => ({ getAll: ks => Object.fromEntries(ks.filter(k => k in cache).map(k => [k, cache[k]])), putAll: (o) => Object.assign(cache, o) }) },
  UrlFetchApp: {
    fetchAll: (reqs) => reqs.map(r => { const x = ctx.__sync(r.url, r.headers); return res(x); }),
    fetch: (url, o) => res(ctx.__sync(url, o.headers)),
  },
  SpreadsheetApp: { getUi: () => ({}) }, HtmlService: {},
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
