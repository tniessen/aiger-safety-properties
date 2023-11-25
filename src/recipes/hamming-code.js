import { CircuitBuilder, FALSE } from '../builder.js';
import { range, seq } from '../utils.js';

import assert from 'node:assert';

function buildHammingCode(m, n, k) {
  assert.strictEqual(n, 2 ** m - 1);
  assert.strictEqual(k, 2 ** m - m - 1);

  const aag = new CircuitBuilder(seq(k).map((i) => `input_${i}`));
  const inputs = seq(k).map((i) => aag.input(i));
  const register = seq(n).map(() => aag.newVar());

  const parityIndices = seq(m).map((i) => (2 ** i) - 1);
  const [encoded, nDataBits] = seq(n).reduce(([enc, dataOffset], i) => parityIndices.includes(i) ? [[...enc, null], dataOffset] : [[...enc, inputs[dataOffset]], dataOffset + 1], [[], 0]);
  assert.strictEqual(nDataBits, k);
  for (const parityIndex of parityIndices) {
    const coverage = seq(n).filter((i) => ((i + 1) & (parityIndex + 1)) !== 0);
    assert(coverage.includes(parityIndex));
    assert.strictEqual(encoded[parityIndex], null);
    encoded[parityIndex] = coverage.filter((i) => i !== parityIndex).reduce((accum, i) => aag.xor(accum, encoded[i]), FALSE);
  }

  assert.strictEqual(encoded.length, register.length);

  for (let i = 0; i < n; i++) {
    aag.addLatch(register[i], encoded[i], `register_bit_${i}`);
  }

  const encodedDiff = encoded.map((v, i) => aag.xor(v, register[i]));
  const hammingDistance = aag.popcount(encodedDiff);
  const hammingDistanceLessThanThree = aag.and(aag.allFalse(hammingDistance.slice(2)), aag.not(aag.and(...hammingDistance.slice(0, 2))));
  const dataBitsEqual = aag.allFalse(encodedDiff.filter((v, i) => !parityIndices.includes(i)));

  aag.addOutput(aag.and(aag.not(dataBitsEqual), hammingDistanceLessThanThree), 'bad_state_detector');

  return aag.build(
      `This circuit implements the Hamming(${n}, ${k}) code for ${k}-bit ` +
      `inputs. The ${n}-bit result is copied to an internal register. When ` +
      `the next input has been encoded, the circuit computes the Hamming ` +
      `distance between the previous and the next encoded value. The output ` +
      `bit is set if the next input differs from the previous input in at ` +
      `least one bit yet the Hamming distance between the encoded values is ` +
      `less than three, which is impossible.`);
}

const mMin = 2, mMax = 6;

export default Object.fromEntries(range(mMin, mMax + 1).map((m) => {
  const n = 2 ** m - 1;
  const k = 2 ** m - m - 1;
  return [
    `hamming-code-distance-${n.toString(10).padStart(2, '0')}-${k.toString(10).padStart(2, '0')}`,
    [true, () => buildHammingCode(m, n, k)]
  ];
}));
