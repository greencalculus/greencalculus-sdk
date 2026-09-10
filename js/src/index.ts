/**
 * GreenCalculus — the carbon-accounting API.
 *
 * Sourced greenhouse-gas emission factors and audit-traced calculations, every
 * value traceable to its source cell and data version. Zero dependencies (uses
 * the platform `fetch`; Node 18+ or any browser).
 *
 *   import { GreenCalculus } from "greencalculus";
 *   const gc = new GreenCalculus({ apiKey: "gc_live_..." });
 *   const f = await gc.factor("grid.gbr.electricity.location_based");
 *   const r = await gc.ghgActivity({
 *     activity: { value: 1000, unit: "kWh" },
 *     factor_key: "grid.gbr.electricity.location_based",
 *   });
 */

export interface GreenCalculusOptions {
  /**
   * Your API key — get a free one at https://greencalculus.com/developers.
   * Optional: without one, `browse()` and `search()` still work (the corpus
   * is open to read); factor lookups, ?as_of= pinning and calculations need it.
   */
  apiKey?: string;
  /** Override the gateway base URL (default https://api.greencalculus.com). */
  baseUrl?: string;
  /** Provide a fetch implementation (needed on Node < 18). */
  fetch?: typeof fetch;
}

export class GreenCalculusError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(`[${status} ${code}] ${message}`);
    this.name = "GreenCalculusError";
    this.status = status;
    this.code = code;
  }
}

type Body = Record<string, unknown>;
type Json = Record<string, any>;

const VERSION = "0.2.2";
const SIGNUP_URL = "https://greencalculus.com/developers/welcome?plan=free&ref=sdk-js";

export class GreenCalculus {
  private apiKey: string;
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: GreenCalculusOptions = {}) {
    this.apiKey = opts.apiKey ?? "";
    this.baseUrl = (opts.baseUrl ?? "https://api.greencalculus.com").replace(/\/$/, "");
    const f = opts.fetch ?? (globalThis as any).fetch;
    if (!f) throw new Error("No fetch available — pass opts.fetch (Node < 18).");
    this.fetchImpl = f.bind(globalThis);
  }

  private async request(
    method: string,
    path: string,
    opts: { params?: Record<string, unknown>; body?: Body } = {}
  ): Promise<Json> {
    let url = this.baseUrl + path;
    if (opts.params) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.params)) if (v != null) q.set(k, String(v));
      const s = q.toString();
      if (s) url += "?" + s;
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": `greencalculus-js/${VERSION}`,
      // Surface tag for the funnel (browsers cannot set User-Agent; this is the
      // header the gateway allows through CORS). A usage signal, not a control.
      "X-GC-Client": `js/${VERSION}`,
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) {
      const e = (data && (data.error as Json)) || {};
      let msg: string = e.message ?? res.statusText;
      if (res.status === 401 && !this.apiKey) {
        msg = `This call needs an API key (factor(), browse() and search() work ` +
          `without one). Free, no card: ${SIGNUP_URL} — then new GreenCalculus({ apiKey }).`;
      }
      throw new GreenCalculusError(res.status, e.code ?? "http_error", msg);
    }
    return data;
  }

  // ── factors ──────────────────────────────────────────────────────────
  /**
   * Look up a single emission factor by key.
   *
   * Works without an API key — the corpus is open to read. `value` and `unit`
   * are lifted to the top level for convenience; the full sourced row stays
   * under `.factor`, with `.source`, `.licence` and `.citation` alongside it.
   *
   * `asOf` pins a past data version. Reading the archive needs a free key, so
   * a keyless call with `asOf` rejects rather than returning a current value
   * under a past label.
   */
  async factor(key: string, asOf?: string): Promise<Json> {
    if (asOf) this.requireKey("Pinning a past data version (asOf)");
    if (this.apiKey) {
      return this.request("GET", `/v1/factors/${encodeURIComponent(key)}`, { params: { as_of: asOf } });
    }
    // Keyless: the same row is served by the open browse route.
    const page = await this.browse({ key_prefix: key, limit: 1 });
    const rows: Json[] = page.factors ?? [];
    const row = rows.find((r) => r.key === key);
    if (!row) {
      throw new GreenCalculusError(404, "not_found", `No factor called "${key}". Try search("${key}").`);
    }
    return { ...row, value: row.factor?.value, unit: row.factor?.unit, meta: page.meta };
  }

  private requireKey(what: string): void {
    if (!this.apiKey) {
      throw new GreenCalculusError(
        401,
        "unauthorized",
        `${what} requires an API key. Free, no card: ${SIGNUP_URL} — then new GreenCalculus({ apiKey }).`
      );
    }
  }

  /**
   * Browse the corpus — keyless, edge-cached. Full rows including the value,
   * source cell and licence. Params: key_prefix, section, family, search, limit, offset, cursor.
   */
  browse(params: Record<string, unknown> = {}): Promise<Json> {
    return this.request("GET", "/v1/factors", { params });
  }

  /** Free-text search over the corpus — keyless. */
  search(text: string, limit = 10): Promise<Json> {
    return this.browse({ search: text, limit });
  }

  /** Resolve a plain-language description to the best-matched factor(s). */
  resolve(description: string, extra: Body = {}): Promise<Json> {
    return this.request("POST", "/v1/calculate/resolve", { body: { description, ...extra } });
  }

  // ── calculations ─────────────────────────────────────────────────────
  /** Run any calculation methodology. Needs a free API key. */
  calculate(methodology: string, body: Body): Promise<Json> {
    this.requireKey("Calculations");
    return this.request("POST", `/v1/calculate/${methodology}`, { body });
  }

  ghgActivity(body: Body): Promise<Json> {
    return this.calculate("ghg-activity", body);
  }
  pcaf(body: Body): Promise<Json> {
    return this.calculate("pcaf", body);
  }
  embodied(body: Body): Promise<Json> {
    return this.calculate("embodied", body);
  }
  electricity(body: Body): Promise<Json> {
    return this.calculate("electricity", body);
  }
  freight(body: Body): Promise<Json> {
    return this.calculate("freight", body);
  }
  spendBased(body: Body): Promise<Json> {
    return this.calculate("spend-based", body);
  }
  businessTravel(body: Body): Promise<Json> {
    return this.calculate("business-travel", body);
  }
  /** Run many calculations in one request; each item names a `methodology`. */
  batch(items: Body[]): Promise<Json> {
    return this.calculate("batch", { items });
  }
}

export { gridIntensity, toCo2jsOptions, co2jsOptionsFor, citationFor, toGramsPerKwh } from "./co2js.js";
export type { GridIntensityResult, GridIntensityOptions, GridBasis, Co2jsGridIntensity } from "./co2js.js";

export default GreenCalculus;
