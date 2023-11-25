import { CircuitBuilder, FALSE } from '../builder.js';
import { cartesian, seq } from '../utils.js';

import assert from 'node:assert';

function buildFermatsLastTheorem(exponent, nBits) {
  function pow(v) {
    assert([3, 4].includes(exponent));
    const sq = aag.multiplyLE(v, v);
    return exponent === 3 ? aag.multiplyLE(v, sq) : aag.multiplyLE(sq, sq);
  }
  const aag = new CircuitBuilder(['x', 'y', 'z'].map((v) => seq(nBits).map((i) => `${v}_${i}`)).flat());
  const [x, y, z] = [0, 1, 2].map((v => seq(nBits).map((i) => aag.input(nBits * v + i))));
  const [xCubed, yCubed, zCubed] = [x, y, z].map((v) => pow(v));
  const [sum, carry] = aag.addLE(xCubed, yCubed);
  assert.strictEqual(sum.length, exponent * nBits);
  const isEqual = aag.equal([...sum, carry], [...zCubed, FALSE]);
  const nontrivial = aag.allFalse([aag.allFalse(x), aag.allFalse(y), aag.allFalse(z)]);
  aag.addOutput(aag.and(nontrivial, isEqual), 'non_trivial_solution');
  return aag.build(
      `This (stateless) circuit checks whether the equation x^${exponent} + ` +
      `y^${exponent} = z^${exponent} holds for the given ${nBits}-bit ` +
      `integers x, y, and z. The output is set if the equation holds for ` +
      `non-zero inputs x, y, and z, which is impossible per Fermat's Last ` +
      `Theorem.`);
}

function buildFermatsLastTheoremStateful(exponent, nBits) {
  function pow(v) {
    assert([3, 4].includes(exponent));
    const sq = aag.multiplyLE(v, v);
    return exponent === 3 ? aag.multiplyLE(v, sq) : aag.multiplyLE(sq, sq);
  }

  const aag = new CircuitBuilder(seq(nBits).map((i) => `x_bit_${i}`));
  const x = seq(nBits).map((i) => aag.input(i));
  const yCubed = seq(exponent * nBits).map(() => aag.newVar());
  const zCubed = seq(exponent * nBits).map(() => aag.newVar());
  const xCubed = pow(x);
  for (let i = 0; i < exponent * nBits; i++) {
    aag.addLatch(yCubed[i], xCubed[i], `y_pow_${exponent}_bit_${i}`);
  }
  for (let i = 0; i < exponent * nBits; i++) {
    aag.addLatch(zCubed[i], yCubed[i], `z_pow_${exponent}_bit_${i}`);
  }
  const [sum, carry] = aag.addLE(xCubed, yCubed);
  assert.strictEqual(sum.length, exponent * nBits);
  const isEqual = aag.equal([...sum, carry], [...zCubed, FALSE]);
  const nontrivial = aag.allFalse([aag.allFalse(x), aag.allFalse(yCubed), aag.allFalse(zCubed)]);
  aag.addOutput(aag.and(nontrivial, isEqual), 'non_trivial_solution');
  return aag.build(
      `This circuit checks whether the equation x^${exponent} + ` +
      `y^${exponent} = z^${exponent} holds for the given ${nBits}-bit ` +
      `integers x, y, and z. The output is set if the equation holds for ` +
      `non-zero inputs x, y, and z, which is impossible per Fermat's Last ` +
      `Theorem.\n\n` +
      `The circuit only has a single ${nBits}-bit input, which must be set ` +
      `to z first, then y, and finally x.`);
}

const params = cartesian([3, 4], [2, 4, 8, 12, 16], ['stateless', 'register']);
const buildType = { stateless: buildFermatsLastTheorem, register: buildFermatsLastTheoremStateful };

function makeEntry([exponent, nBits, type]) {
  const build = () => buildType[type](exponent, nBits);
  return [`fermats-last-theorem-${type}-n${exponent}-${nBits.toString(10).padStart(2, '0')}`, [true, build]];
}

export default Object.fromEntries(params.map(makeEntry));
