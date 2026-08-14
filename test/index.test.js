import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuitarEffector, GEAR_TYPES, gear } from '../src/index.js';
import { toCompanyKey, toModelKey } from '../src/normalize.js';

test('matches the exact requested usage: effector.proco.rat2()', () => {
  const effector = new GuitarEffector();
  const rat2 = effector.proco.rat2();
  assert.deepEqual(rat2, {
    company: 'proco',
    model: 'rat2',
    type: 'pedal',
    parameter: ['distortion', 'filter', 'volume'],
  });
});

test('every entry carries a type, and the shape is exactly four keys', () => {
  const effector = new GuitarEffector();
  for (const gear of effector.all()) {
    assert.deepEqual(
      Object.keys(gear).sort(),
      ['company', 'model', 'parameter', 'type'],
      `${gear.company}.${gear.model} has an unexpected shape`,
    );
    assert.ok(
      ['pedal', 'amp', 'cab', 'rack'].includes(gear.type),
      `${gear.company}.${gear.model} has invalid type "${gear.type}"`,
    );
  }
});

test('gear is the same data as all(), without re-allocating on every read', () => {
  const effector = new GuitarEffector();
  assert.deepEqual([...gear], effector.all());
  // Same array identity across reads — that is the point of it existing.
  assert.equal(gear, gear);
});

test('gear is frozen, because it is shared rather than copied', () => {
  // all() hands out fresh copies you may mutate; gear is the shared one and
  // must not be mutable, or one caller could corrupt every other caller.
  assert.ok(Object.isFrozen(gear));
  assert.ok(Object.isFrozen(gear[0]));
  assert.ok(Object.isFrozen(gear[0].parameter));
  assert.throws(() => gear.push({}), TypeError);
  assert.throws(() => {
    gear[0].company = 'hacked';
  }, TypeError);
});

test('gear carries normalized keys, not the raw display names', () => {
  // src/data/gear.json holds "Pro Co"/"RAT2"; the exported form must already
  // be normalized so it can be used to look gear back up.
  const rat2 = gear.find((g) => g.model === 'rat2');
  assert.equal(rat2.company, 'proco');
  const effector = new GuitarEffector();
  assert.deepEqual(effector[rat2.company][rat2.model](), {
    ...rat2,
    parameter: [...rat2.parameter],
  });
});

test('all(type) filters by gear type, all() returns everything', () => {
  const effector = new GuitarEffector();
  const pedals = effector.all('pedal');
  assert.ok(pedals.length > 0);
  assert.ok(pedals.every((gear) => gear.type === 'pedal'));
  const perType = GEAR_TYPES.reduce((sum, type) => sum + effector.all(type).length, 0);
  assert.equal(effector.all().length, perType);
});

test('rack gear is its own type, not filed under pedal', () => {
  const effector = new GuitarEffector();
  const racks = effector.all('rack');
  assert.ok(racks.length > 0);
  // A studio compressor is not a stompbox.
  assert.equal(effector.teletronix.la2a().type, 'rack');
  assert.ok(effector.all('pedal').every((gear) => gear.type === 'pedal'));
});

test('all() with an unknown type returns an empty array', () => {
  const effector = new GuitarEffector();
  assert.deepEqual(effector.all('synthesizer'), []);
});

test('cabs report no controls rather than inventing them', () => {
  const effector = new GuitarEffector();
  for (const cab of effector.all('cab')) {
    assert.deepEqual(cab.parameter, [], `${cab.company}.${cab.model} should have no controls`);
  }
});

test('multi-word brand collapses, multi-word model separates with _', () => {
  const effector = new GuitarEffector();
  const greenRhino = effector.wayhuge.green_rhino();
  assert.equal(greenRhino.company, 'wayhuge');
  assert.equal(greenRhino.model, 'green_rhino');
});

test('lookups ignore separators entirely — any spelling finds the same gear', () => {
  const effector = new GuitarEffector();
  const canonical = effector.electroharmonix.big_muff_pi();

  // every one of these is the same pedal
  assert.deepEqual(effector.electroharmonix.bigmuffpi(), canonical);
  assert.deepEqual(effector.electroharmonix['big-muff-pi'](), canonical);
  assert.deepEqual(effector.electroharmonix['Big Muff Pi'](), canonical);
  assert.deepEqual(effector['electro-harmonix'].big_muff_pi(), canonical);
  assert.deepEqual(effector['Electro Harmonix']['BIG_MUFF_PI'](), canonical);

  // digit-leading models are reachable with or without the underscore
  assert.deepEqual(effector.marshall['1960a_4x12_g12t75'](), effector.marshall._1960a_4x12_g12t75());
});

test('a lookup that matches nothing is undefined, not a wrong answer', () => {
  const effector = new GuitarEffector();
  assert.equal(effector.boss.nosuchpedal, undefined);
  assert.equal(effector.nosuchbrand, undefined);
});

test('the canonical spelling is what gets reported back', () => {
  const effector = new GuitarEffector();
  // Reached by an alias, but the returned keys are always canonical.
  assert.equal(effector.electroharmonix.bigmuffpi().model, 'big_muff_pi');
  assert.ok(effector.listModels('electroharmonix').includes('big_muff_pi'));
  assert.ok(!effector.listModels('electroharmonix').includes('bigmuffpi'));
});

test('a "+" in a model name becomes "plus"', () => {
  const effector = new GuitarEffector();
  const distPlus = effector.mxr.distortionplus();
  assert.equal(distPlus.model, 'distortionplus');
  assert.deepEqual(distPlus.parameter, ['output', 'distortion']);
});

test('every brand.model() is independently callable', () => {
  const effector = new GuitarEffector();
  assert.deepEqual(effector.boss.ds1().parameter, ['tone', 'distortion', 'level']);
  assert.deepEqual(effector.ibanez.ts808().parameter, ['drive', 'tone', 'level']);
  assert.deepEqual(effector.klon.centaur().parameter, ['gain', 'treble', 'output']);
  assert.deepEqual(effector.dunlop.crybaby().parameter, ['sweep']);
});

test('calling the same pedal twice returns equal but independent arrays', () => {
  const effector = new GuitarEffector();
  const first = effector.proco.rat2();
  const second = effector.proco.rat2();
  assert.deepEqual(first, second);
  first.parameter.push('mutated');
  assert.equal(second.parameter.includes('mutated'), false);
});

test('listCompanies returns every brand key', () => {
  const effector = new GuitarEffector();
  const companies = effector.listCompanies();
  assert.ok(companies.includes('proco'));
  assert.ok(companies.includes('boss'));
  assert.ok(companies.includes('electroharmonix'));
  // Derived, not hardcoded: adding gear shouldn't force an unrelated edit here.
  assert.deepEqual(
    [...companies].sort(),
    [...new Set(effector.all().map((gear) => gear.company))].sort(),
  );
});

test('a model name starting with a digit gets an underscore so dot access still works', () => {
  assert.equal(toModelKey('2203'), '_2203');
  assert.equal(toModelKey('5150'), '_5150');
  assert.equal(toCompanyKey('÷13'), '_13');
});

test('accented letters keep their base letter instead of vanishing', () => {
  // "Überschall" must not become "berschall" — stripping the whole character
  // silently eats the first letter of the model name.
  assert.equal(toModelKey('Überschall'), 'uberschall');
  assert.equal(toCompanyKey('Café'), 'cafe');
  assert.equal(toModelKey('Ecstasy 101B'), 'ecstasy_101b');
});

test('company keys collapse to one word, keeping the original effector.proco shape', () => {
  assert.equal(toCompanyKey('Pro Co'), 'proco');
  assert.equal(toCompanyKey('Way Huge'), 'wayhuge');
  assert.equal(toCompanyKey('Electro-Harmonix'), 'electroharmonix');
  assert.equal(toCompanyKey('MESA/Boogie'), 'mesaboogie');
});

test('model keys separate words with _ but leave model numbers intact', () => {
  // Word boundaries become underscores...
  assert.equal(toModelKey('Big Muff Pi'), 'big_muff_pi');
  assert.equal(toModelKey('Deluxe Blackface 1x12 C12K'), 'deluxe_blackface_1x12_c12k');
  assert.equal(toModelKey('1960A 4x12 G12T-75'), '_1960a_4x12_g12t75');
  // ...but a hyphen inside a single model number does not, so DS-1 stays ds1.
  assert.equal(toModelKey('DS-1'), 'ds1');
  assert.equal(toModelKey('RAT2'), 'rat2');
  assert.equal(toModelKey('TS808'), 'ts808');
  assert.equal(toModelKey('Distortion+'), 'distortionplus');
});

test('every generated key is a valid JS identifier, so effector.x.y() always parses', () => {
  const effector = new GuitarEffector();
  const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  for (const company of effector.listCompanies()) {
    assert.match(company, identifier, `company key "${company}" is not dot-accessible`);
    for (const model of effector.listModels(company)) {
      assert.match(model, identifier, `model key "${company}.${model}" is not dot-accessible`);
    }
  }
});

test('listModels returns the model keys for one brand', () => {
  const effector = new GuitarEffector();
  const bossModels = effector.listModels('boss');
  // Containment, not an exact list: adding a Boss pedal shouldn't fail this.
  for (const model of ['ds1', 'sd1', 'bd2', 'ce2', 'dm2', 'cs3']) {
    assert.ok(bossModels.includes(model), `boss.${model} is missing`);
  }
  // Every listed key resolves to gear that reports the same brand.
  for (const model of bossModels) {
    assert.equal(effector.boss[model]().company, 'boss');
  }
});

test('listModels returns an empty array for an unknown brand', () => {
  const effector = new GuitarEffector();
  assert.deepEqual(effector.listModels('nosuchbrand'), []);
});

test('all() flattens every entry in the dataset', () => {
  const effector = new GuitarEffector();
  const everything = effector.all();
  // Cross-checked against listCompanies/listModels rather than a hardcoded
  // count, so adding gear never forces an unrelated edit here.
  const expected = effector
    .listCompanies()
    .reduce((sum, company) => sum + effector.listModels(company).length, 0);
  assert.equal(everything.length, expected);
  assert.ok(everything.length > 0);
  assert.ok(everything.some((gear) => gear.company === 'proco' && gear.model === 'rat2'));
});

test('no two entries share a company.model key', () => {
  const effector = new GuitarEffector();
  const keys = effector.all().map((gear) => `${gear.company}.${gear.model}`);
  assert.equal(new Set(keys).size, keys.length);
});
