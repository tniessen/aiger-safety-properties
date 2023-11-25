import { buildAccumulatingMultiplierCircuit } from './prime.js';

import assert from 'node:assert';
import { checkPrimeSync } from 'node:crypto';

function factorization(factors, inputSize) {
  const product = factors.reduce((p, [f, e]) => p * (f ** e), 1);
  assert(Number.isSafeInteger(product));
  for (const [f, e] of factors) {
    assert(f < 2 ** inputSize);
    assert(e >= 1);
    assert(checkPrimeSync(BigInt(f)));
    for (const [other] of factors) {
      if (other !== f || e !== 1) assert(f * other >= 2 ** inputSize);
    }
  }
  const nFactors = factors.reduce((s, [_, e]) => s + e, 0);
  const factorization = (nFactors <= 10) ? factors.map(([f, e]) => `${f}${` * ${f}`.repeat(e - 1)}`).join(' * ')
                                         : factors.map(([f, e]) => `${f}${e === 1 ? '' : `**${e}`}`).join(' * ');
  return [`prime-factorization-${product}`, [false, () => buildAccumulatingMultiplierCircuit(product, inputSize,
      `The shortest counterexample is the prime factorization of ${product}, ` +
      `which is ${factorization}. No shorter sequence of inputs can lead to ` +
      `this product because any combination of these prime factors exceeds ` +
      `${2 ** inputSize - 1}.`)]];
}

const params = [
  [[[227, 2], [179, 2], [167, 2], [2, 1]], 8],       // 8-bit safe primes, times 2.
  ...[10, 15, 20].map((i) => [[[3, i], [2, i]], 2])  // Two-bit primes only.
];

export default Object.fromEntries(
    params.map((args) => factorization(...args)));
