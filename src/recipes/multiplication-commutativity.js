import { CircuitBuilder } from '../builder.js';
import { seq } from '../utils.js';

import assert from 'node:assert';

function build(nBits) {
  const inputLabels = seq(nBits).map((i) => `x_${i}`);
  const b = new CircuitBuilder(inputLabels);
  const inputs = seq(nBits).map((i) => b.input(i));

  const register = seq(nBits).map(() => b.newVar());
  for (let i = 0; i < nBits; i++) {
    b.addLatch(register[i], inputs[i], `y_${i}`);
  }

  const xy = b.multiplyLE(inputs, register);
  const yx = b.multiplyLE(register, inputs);
  assert.strictEqual(xy.length, xy.length);

  const equal = xy.map((xyi, i) => b.not(b.xor(xyi, yx[i])));
  b.addOutput(b.not(b.allTrue(equal)), `xy_NOT_EQ_yx`);

  return b.build(
      `This circuit has a ${nBits}-bit input X and a ${nBits}-bit register ` +
      `Y. It computes the two products X * Y and Y * X using separate ` +
      `multiplication circuits and sets the output bit to 1 if and only if ` +
      `the results differ. Finally, the value of X is copied to Y before the ` +
      `next iteration.`);
}

export default Object.fromEntries([4, 8].map((nBits) => [
  `multiplication-commutativity-${nBits}`,
  [true, () => build(nBits)]
]));
