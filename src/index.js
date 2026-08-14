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
 * What the gear does to the signal — a different axis than `type`, which says
 * what kind of box it is. A Pro Co RAT is `type: 'pedal'`, `category: 'drive'`.
 * Amps and cabs mirror their type so callers never have to handle a null.
 */
export const GEAR_CATEGORIES = [
  'drive',
  'comp',
  'delay',
  'reverb',
  'modulation',
  'eq',
  'filter',
  'wah',
  'pitch',
  'volume',
  'amp',
  'cab',
];

/** Knob names that read wrong when title-cased letter by letter. */
const PARAMETER_ACRONYMS = new Set(['hf', 'od', 'eq', 'fac', 'vle', 'vpf', 'di', 'ir', 'ags']);

/**
 * Turns a stored knob key into the label a front panel would print:
 * `repeatRate` → "Repeat Rate", `hfDrive` → "HF Drive".
 *
 * Word boundaries survive in the stored camelCase, so they can be recovered
 * exactly; letter casing was normalized away on entry and is reconstructed.
 * Acronyms come from a list because no rule distinguishes "od" from "on".
 *
 * @param {string} name
 * @returns {string}
 */
export function formatParameter(name) {
  return String(name)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      PARAMETER_ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

/**
 * @typedef {'drive'|'comp'|'delay'|'reverb'|'modulation'|'eq'|'filter'|'wah'|'pitch'|'volume'|'amp'|'cab'} GearCategory
 *
 * @typedef {'pedal' | 'amp' | 'cab' | 'rack'} GearType
 *
 * @typedef {Object} GearInfo
 * @property {string} company - normalized company key, e.g. "proco"
 * @property {string} model - normalized model key, e.g. "rat2"
 * @property {GearType} type - what kind of gear this is
 * @property {GearCategory} category - what it does to the signal
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

    if (!GEAR_CATEGORIES.includes(gear.category)) {
      throw new Error(
        `Invalid category "${gear.category}" on "${gear.company} ${gear.model}" — must be one of ${GEAR_CATEGORIES.join(', ')}. Fix it in gear.json.`,
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
      category: gear.category,
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

/**
 * Every entry, already normalized, as one shared frozen array.
 *
 * `all()` builds fresh, mutable copies on every call — right when you intend
 * to modify the result, wasteful when you just want to read or index. This is
 * the read-only counterpart: allocated once, safe to hand to any number of
 * callers because nothing can write to it.
 *
 * Frozen deliberately. It is shared rather than copied, so a caller mutating
 * it would corrupt the data for everyone else in the process.
 *
 * @type {readonly Readonly<GearInfo>[]}
 */
export const gear = Object.freeze(
  Object.values(canonical).flatMap((models) =>
    Object.values(models).map((fn) => {
      const entry = fn();
      return Object.freeze({ ...entry, parameter: Object.freeze(entry.parameter) });
    }),
  ),
);

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
