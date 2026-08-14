import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toCompanyKey, toModelKey, toLookup } from './normalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The kinds of gear this dataset describes. `rack` covers studio and
 * non-stompbox hardware — a Teletronix LA-2A or a Leslie 122 is real gear
 * these units model, but calling either a pedal would be wrong.
 */
export const GEAR_TYPES = ['pedal', 'amp', 'cab', 'rack'];

/**
 * @typedef {'pedal' | 'amp' | 'cab' | 'rack'} GearType
 *
 * @typedef {Object} GearInfo
 * @property {string} company - normalized company key, e.g. "proco"
 * @property {string} model - normalized model key, e.g. "rat2"
 * @property {GearType} type - what kind of gear this is
 * @property {string[]} parameter - the controls/knobs; always empty for cabs, which have none
 */

/** @type {{company: string, model: string, type: GearType, parameter: string[]}[]} */
const rawGear = JSON.parse(readFileSync(join(__dirname, 'data', 'gear.json'), 'utf-8'));

/**
 * Wraps a plain object so property access ignores separators and case:
 * `.big_muff_pi`, `.bigmuffpi` and `['Big Muff Pi']` all reach the same entry.
 * Only the canonical key is ever enumerated or returned, so Object.keys and
 * listModels() stay clean — the tolerance is for callers, not for the data.
 * @template T
 * @param {Record<string, T>} target
 * @param {string} label - used only in the collision message
 * @returns {Record<string, T>}
 */
function separatorTolerant(target, label) {
  /** @type {Map<string, string>} */
  const index = new Map();

  for (const key of Object.keys(target)) {
    const lookup = toLookup(key);
    const existing = index.get(lookup);
    if (existing !== undefined) {
      throw new Error(
        `Ambiguous key in ${label}: "${key}" and "${existing}" both reduce to "${lookup}", so a separator-insensitive lookup could not tell them apart. Rename one in gear.json.`,
      );
    }
    index.set(lookup, key);
  }

  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop !== 'string' || Reflect.has(obj, prop)) {
        return Reflect.get(obj, prop, receiver);
      }
      const canonical = index.get(toLookup(prop));
      return canonical === undefined ? undefined : obj[canonical];
    },
    has(obj, prop) {
      if (typeof prop === 'string' && !Reflect.has(obj, prop)) {
        return index.has(toLookup(prop));
      }
      return Reflect.has(obj, prop);
    },
  });
}

/**
 * Pre-group the raw data by normalized company key, once, at module load —
 * every `new GuitarEffector()` just re-attaches references to this, rather
 * than re-parsing JSON and rebuilding methods on every instantiation.
 *
 * All validation below throws at import time rather than when the offending
 * entry is called, so a malformed gear.json fails loudly during development
 * instead of lying dormant until someone reaches for that one model.
 */
function buildBrands() {
  /** @type {Record<string, Record<string, () => GearInfo>>} */
  const brands = {};

  for (const gear of rawGear) {
    const companyKey = toCompanyKey(gear.company);
    const modelKey = toModelKey(gear.model);

    if (!GEAR_TYPES.includes(gear.type)) {
      throw new Error(
        `Invalid type "${gear.type}" on "${gear.company} ${gear.model}" — must be one of ${GEAR_TYPES.join(', ')}. Fix it in gear.json.`,
      );
    }

    if (gear.type === 'cab' && gear.parameter.length > 0) {
      throw new Error(
        `Cab "${gear.company} ${gear.model}" declares controls ${JSON.stringify(gear.parameter)} — cabinets have no knobs, so parameter must be []. Fix it in gear.json.`,
      );
    }

    if (!brands[companyKey]) brands[companyKey] = {};

    if (brands[companyKey][modelKey]) {
      throw new Error(
        `Duplicate gear key "${companyKey}.${modelKey}" — "${gear.company} ${gear.model}" collides with an existing entry. Rename one in gear.json.`,
      );
    }

    brands[companyKey][modelKey] = () => ({
      company: companyKey,
      model: modelKey,
      type: gear.type,
      parameter: [...gear.parameter],
    });
  }

  const tolerant = {};
  for (const [companyKey, models] of Object.entries(brands)) {
    tolerant[companyKey] = separatorTolerant(models, `${companyKey}'s models`);
  }
  return { canonical: brands, lookup: separatorTolerant(tolerant, 'company names') };
}

const { canonical, lookup } = buildBrands();

export class GuitarEffector {
  constructor() {
    Object.assign(this, lookup);
    return separatorTolerant(this, 'GuitarEffector');
  }

  /**
   * All company keys, e.g. ["proco", "boss", "ibanez", ...]
   * @returns {string[]}
   */
  listCompanies() {
    return Object.keys(canonical);
  }

  /**
   * All model keys for one company, e.g. listModels('boss') -> ["ds1","sd1",...]
   * Accepts the same loose spellings as property access.
   * @param {string} companyKey
   * @returns {string[]}
   */
  listModels(companyKey) {
    const models = lookup[companyKey];
    return models ? Object.keys(models) : [];
  }

  /**
   * Every piece of gear in the dataset, flattened. Pass a type to narrow it —
   * `all('amp')` returns only amps. An unrecognized type yields an empty array.
   * @param {GearType} [type]
   * @returns {GearInfo[]}
   */
  all(type) {
    const everything = Object.values(canonical).flatMap((models) =>
      Object.values(models).map((fn) => fn()),
    );
    return type === undefined ? everything : everything.filter((gear) => gear.type === type);
  }
}

export default GuitarEffector;
