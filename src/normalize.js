/**
 * Folds accented Latin letters onto their base letter so they survive the
 * alphanumeric filter: "Überschall" → "Uberschall", not "berschall". Without
 * this, stripping the character outright eats a letter of the real name.
 */
const foldAccents = (str) => String(str).normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Strips a name down to bare lowercase alphanumerics. This is the form used to
 * MATCH a lookup, not to display one: "Big Muff Pi", "big_muff_pi" and
 * "big-muff-pi" all reduce to "bigmuffpi", which is how `effector.mxr.<any of
 * those>` finds the same pedal. Never store this form — store the canonical
 * key from toCompanyKey/toModelKey.
 * @param {string} str
 * @returns {string}
 */
export function toLookup(str) {
  return foldAccents(str)
    .replace(/\+/g, 'plus')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

/** A key must be a valid JS identifier, so a digit-leading one gets `_`. */
const guardLeadingDigit = (key) => (/^[0-9]/.test(key) ? `_${key}` : key);


/**
 * Company keys collapse to a single word: "Pro Co" → "proco", "Way Huge" →
 * "wayhuge". Deliberately different from toModelKey — the original API shape
 * this library was built around is `effector.proco.rat2()`, and company names
 * are short enough that separators buy nothing.
 * @param {string} str
 * @returns {string}
 */
export function toCompanyKey(str) {
  return guardLeadingDigit(toLookup(str));
}

/**
 * Model keys separate WORDS with `_` but leave punctuation inside a single
 * word alone: "Big Muff Pi" → "big_muff_pi", but "DS-1" → "ds1" because that
 * hyphen is part of one model number, not a word boundary. Cab names carry
 * size and speaker, so without word separators they turn into unreadable runs
 * like "princetonbrownface1x10g10alnicogold".
 * @param {string} str
 * @returns {string}
 */
export function toModelKey(str) {
  const key = foldAccents(str)
    .replace(/\+/g, 'plus')
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]+/g, ''))
    .filter(Boolean)
    .join('_')
    .toLowerCase();

  return guardLeadingDigit(key);
}

/**
 * Turns a display name into a PascalCase label, used only for generated
 * TypeScript interface names (e.g. "WayHugeBrand") — this never affects
 * runtime property names. Digit-leading names get the same underscore
 * treatment, since `13Brand` is not a valid TypeScript identifier either.
 * @param {string} str
 * @returns {string}
 */
export function toPascal(str) {
  const label = foldAccents(str)
    .replace(/\+/g, ' Plus')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  return guardLeadingDigit(label);
}
