import { CircuitBuilder, FALSE, TRUE } from '../builder.js';
import { seq } from '../utils.js';

import assert from 'node:assert';

// TODO: this seems like it computes for x < 2**16, not x < 2**8 !
function rootOfQuadraticEquation() {
  const nBitsX = 16;
  const b = new CircuitBuilder(0);
  const xBits = seq(nBitsX).map(() => b.newVar());
  const [newX, ignoredOverflowX] = b.incrementLE(xBits);
  for (let i = 0; i < nBitsX; i++) {
    b.addLatch(xBits[i], newX[i], `x_${i}`);
  }
  const xSquared = b.multiplyLE(xBits, xBits);
  assert(xSquared.length === 2 * nBitsX);

  const bits50 = (50).toString(2).split('').reverse().map((c) => ({ 0: FALSE, 1: TRUE })[c]);
  const xTimes50 = b.multiplyLE(xBits, bits50);
  assert(xSquared.length >= xTimes50.length);

  const extendUnsignedLE = (n, nBits) => [...n, ...seq(nBits - n.length).map(() => FALSE)];

  const [minusXTimes50] = b.incrementLE(extendUnsignedLE(xTimes50, xSquared.length).map((bit) => b.not(bit)));

  const bits625 = (625).toString(2).split('').reverse().map((c) => ({ 0: FALSE, 1: TRUE })[c]);

  const [y, ignoredOverflow] = b.addLE(b.addLE(xSquared, minusXTimes50)[0], extendUnsignedLE(bits625, xSquared.length));

  const isRoot = b.allFalse(y);
  const xIs25 = b.bitsEqualToConst(xBits, extendUnsignedLE((25).toString(2).split('').reverse().map((c) => ({ 0: FALSE, 1: TRUE })[c]), xBits.length));
  const notOK = b.and(isRoot, b.not(xIs25));
  b.addOutput(notOK, 'root_other_than_25');

  return b.build(
      'This circuit computes f(x) = x**2 - 50x + 625 for integer values of x ' +
      'from 0 to 255. The output bit is set to 1 if f(x) = 0 and x is not ' +
      '25, which never happens.');
}

export default {
  'root-of-x2minus50xplus625-8': [true, rootOfQuadraticEquation]
};
