/**
 * CO2.js bridge — sourced grid intensity for @tgwf/co2, with the citation.
 *
 * CO2.js bundles one unversioned average per country (Ember). This helper
 * fetches the same quantity from GreenCalculus — with the publisher, the
 * exact source cell, the data version and a public proof URL — and shapes it
 * as the `gridIntensity` option CO2.js already accepts, so a web-carbon
 * estimate can carry an audit trail. No dependency on @tgwf/co2; pass the
 * result into its `perVisitTrace` / `perByteTrace` options yourself.
 *
 *   import { co2 } from "@tgwf/co2";
 *   import { GreenCalculus, gridIntensity, toCo2jsOptions } from "greencalculus";
 *
 *   const gc = new GreenCalculus();                        // keyless is enough
 *   const gi = await gridIntensity(gc, "GBR");             // lifecycle, Ember, cited
 *   const est = new co2({ model: "swd", version: 4 })
 *     .perVisitTrace(2_000_000, false, toCo2jsOptions(gi));
 *   console.log(est.co2, gi.citation);
 *
 * Boundary honesty: CO2.js's bundled figures are Ember generation-based
 * gCO2/kWh; the default here is GreenCalculus's Ember LIFECYCLE row (all
 * 214 countries) and the result says so in `boundary`. Ask for
 * `basis: "location_based"` to get a national inventory set (DEFRA, NGA, …)
 * where one exists; it throws where none does rather than guessing.
 */

import type { GreenCalculus } from "./index.js";

export type GridBasis = "lifecycle" | "location_based";

export interface GridIntensityResult {
  /** ISO 3166-1 alpha-3, upper-case, as CO2.js uses. */
  country: string;
  /** The GreenCalculus factor key the figure came from. */
  key: string;
  /** Which row family answered. */
  basis: GridBasis;
  /** grams CO2e per kWh — the unit CO2.js expects. */
  gco2PerKwh: number;
  /** The row's own unit and value, untouched. */
  value: number;
  unit: string;
  /** The publisher's boundary statement, verbatim. */
  boundary: string | null;
  scope: string | null;
  source: {
    id: string | null;
    publisher: string | null;
    cellRef: string | null;
    retrieved: string | null;
    licence: string | null;
    attribution: string | null;
  };
  /** GreenCalculus data version that served the value. */
  version: string | null;
  /** Public proof page pinned to that version. */
  proofUrl: string | null;
  /** The factor's name as the corpus states it. */
  name: string | null;
  /** One ready-to-paste citation line — the API's `citation.text`, verbatim. */
  citation: string;
}

export interface GridIntensityOptions {
  /** Default "lifecycle" (Ember, every country). "location_based" = national inventory set where one exists. */
  basis?: GridBasis;
}

const VERIFY = "https://verify.greencalculus.com";

/**
 * The citation line. The API builds the canonical one on every row
 * (`citation.text`, since 2026-09-09) and `gridIntensity` prints it verbatim;
 * this assembles the SAME format only for a row that arrives without it:
 *   <name>. <source — publisher>, cell <cell>, retrieved <date>.
 *   via GreenCalculus data version <v>, factor <key>. <proof URL>
 */
export function citationFor(r: {
  key: string; name?: string | null; version: string | null; proofUrl: string | null;
  source: { id: string | null; cellRef: string | null; retrieved: string | null; attribution: string | null };
}): string {
  const parts: string[] = [];
  if (r.name) parts.push(r.name);
  const who: string[] = [r.source.attribution || r.source.id || ""];
  if (r.source.cellRef) who.push(`cell ${r.source.cellRef}`);
  if (r.source.retrieved) who.push(`retrieved ${r.source.retrieved}`);
  const whoLine = who.filter(Boolean).join(", ");
  if (whoLine) parts.push(whoLine);
  parts.push(`via GreenCalculus${r.version ? ` data version ${r.version}` : ""}, factor ${r.key}`);
  return parts.join(". ") + "." + (r.proofUrl ? ` ${r.proofUrl}` : "");
}

/** Convert a factor value to grams CO2e per kWh from the units the corpus uses. */
export function toGramsPerKwh(value: number, unit: string): number {
  const u = unit.toLowerCase().replace(/\s+/g, " ");
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  if (/^kg ?co2e? per kwh$/.test(u) || /kg ?co2e?\/kwh/.test(u)) return r6(value * 1000);
  if (/^g ?co2e? per kwh$/.test(u) || /g ?co2e?\/kwh/.test(u)) return r6(value);
  if (/t ?co2e? per mwh/.test(u) || /t ?co2e?\/mwh/.test(u)) return r6(value * 1000);
  if (/kg ?co2e? per mwh/.test(u) || /kg ?co2e?\/mwh/.test(u)) return r6(value);
  throw new Error(`Cannot convert unit "${unit}" to gCO2e/kWh`);
}

/**
 * Sourced grid intensity for a country, keyless.
 * Throws with the keys that DO exist when the requested basis is absent.
 */
export async function gridIntensity(
  gc: GreenCalculus,
  country: string,
  opts: GridIntensityOptions = {}
): Promise<GridIntensityResult> {
  const iso3 = String(country || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error(`gridIntensity: expected an ISO 3166-1 alpha-3 code like "GBR", got "${country}"`);
  }
  const basis: GridBasis = opts.basis ?? "lifecycle";
  const prefix = `grid.${iso3.toLowerCase()}.electricity.`;
  const res = await gc.browse({ key_prefix: prefix, limit: 50 });
  const rows: any[] = Array.isArray(res.factors) ? res.factors : [];
  const want = basis === "lifecycle" ? `${prefix}lifecycle_intensity` : `${prefix}location_based`;
  const row = rows.find((r) => r.key === want);
  if (!row) {
    const have = rows.map((r) => r.key);
    throw new Error(
      have.length
        ? `No ${basis} grid factor for ${iso3}. Keys available: ${have.join(", ")}`
        : `No grid factors for ${iso3} — check the code at https://greencalculus.com/factors/grid-electricity-carbon-intensity/`
    );
  }
  const f = row.factor ?? {};
  const s = row.source ?? {};
  const lic = res.meta?.licences?.[s.id] ?? {};
  const version: string | null = res.meta?.gc_version ?? null;
  const serverCitation: { text?: unknown; proof_url?: unknown } | null = row.citation && typeof row.citation === "object" ? row.citation : null;
  const proofUrl: string | null = (typeof serverCitation?.proof_url === "string" && serverCitation.proof_url)
    || (version ? `${VERIFY}/${row.key}@${version}` : null);
  if (typeof f.value !== "number" || !f.unit) throw new Error(`Row ${row.key} carries no numeric value`);
  const out: GridIntensityResult = {
    country: iso3,
    key: row.key,
    name: row.name ?? null,
    basis,
    gco2PerKwh: toGramsPerKwh(f.value, f.unit),
    value: f.value,
    unit: f.unit,
    boundary: f.basis ?? null,
    scope: row.scope?.ghg_protocol ?? null,
    source: {
      id: s.id ?? null,
      publisher: lic.publisher ?? null,
      cellRef: s.cell_ref ?? null,
      retrieved: s.retrieved ?? null,
      licence: row.licence?.name ?? lic.name ?? null,
      attribution: lic.attribution ?? null,
    },
    version,
    proofUrl,
    citation: "",
  };
  out.citation = typeof serverCitation?.text === "string" && serverCitation.text ? serverCitation.text : citationFor(out);
  return out;
}

/** CO2.js's `gridIntensity` option: each segment is a NUMBER in gCO2e/kWh (or `{ country }`). */
export interface Co2jsGridIntensity {
  gridIntensity: { device: number; dataCenter: number; network: number };
}

/**
 * The `gridIntensity` option object CO2.js accepts, one figure for all three
 * segments. Bare numbers on purpose: CO2.js's option parser takes a number or
 * `{ country }` and silently falls back to its default for any other shape
 * (verified against @tgwf/co2 0.19.0 — an `{ value }` object is echoed back
 * as null and the estimate does not change).
 */
export function toCo2jsOptions(gi: GridIntensityResult | number): Co2jsGridIntensity {
  const g = typeof gi === "number" ? gi : gi.gco2PerKwh;
  return { gridIntensity: { device: g, dataCenter: g, network: g } };
}

/** Per-segment variant: different countries for device, data centre and network. */
export async function co2jsOptionsFor(
  gc: GreenCalculus,
  segments: { device: string; dataCenter: string; network: string },
  opts: GridIntensityOptions = {}
): Promise<Co2jsGridIntensity & {
  citations: { device: GridIntensityResult; dataCenter: GridIntensityResult; network: GridIntensityResult };
}> {
  const [device, dataCenter, network] = await Promise.all([
    gridIntensity(gc, segments.device, opts),
    gridIntensity(gc, segments.dataCenter, opts),
    gridIntensity(gc, segments.network, opts),
  ]);
  return {
    gridIntensity: {
      device: device.gco2PerKwh,
      dataCenter: dataCenter.gco2PerKwh,
      network: network.gco2PerKwh,
    },
    citations: { device, dataCenter, network },
  };
}
