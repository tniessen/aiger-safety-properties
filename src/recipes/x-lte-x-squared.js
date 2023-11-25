import { CircuitBuilder, FALSE } from '../builder.js';
import { seq } from '../utils.js';

import assert from 'node:assert';

function xLessThanOrEqualToXsq(nBitsX) {
  const b = new CircuitBuilder(0);
  const xBits = seq(nBitsX).map(() => b.newVar());
  const [newX, ignoredOverflowX] = b.incrementLE(xBits);
  for (let i = 0; i < nBitsX; i++) {
    b.addLatch(xBits[i], newX[i], `x_${i}`);
  }
  const xSquared = b.multiplyLE(xBits, xBits);
  assert(xSquared.length === 2 * nBitsX);
  const extraBitsZero = b.allFalse(xSquared.slice(nBitsX));
  let accum = FALSE;
  for (let i = 0; i < nBitsX; i++) {
    accum = b.or(
      b.and(xBits[i], b.not(xSquared[i])),
      b.and(b.not(b.and(b.not(xBits[i]), xSquared[i])), accum)
    );
  }
  const xSquaredLessThanX = b.and(extraBitsZero, accum);
  b.addOutput(xSquaredLessThanX, `x_squared_lt_x`);
  return b.build(
      `This circuit simply increments a ${nBitsX}-bit counter X and computes ` +
      `X * X, where X is interpreted as an unsigned integer. The single ` +
      `output bit is set if and only if X * X < X, which never happens.\n\n` +
      `The result of the multiplication is represented by the following ` +
      `literals (from LSB to MSB): ${xSquared.join(', ')}.`);
}

export default Object.fromEntries([8, 16, 32].map((bits) => [
  `x-lte-x-squared-${bits}`, [true, () => xLessThanOrEqualToXsq(bits)]
]));
