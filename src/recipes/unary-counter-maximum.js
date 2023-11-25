import { CircuitBuilder, TRUE } from '../builder.js';
import { range, seq } from '../utils.js';

import assert from 'node:assert';

function buildUnaryCounter(max) {
  assert(max > 0);
  const b = new CircuitBuilder(0);
  const latches = seq(max).map(() => b.newVar());
  b.addLatch(latches[0], TRUE, 'true_after_0');
  for (let i = 1; i < max; i++) {
    b.addLatch(latches[i], latches[i - 1], `true_after_${i}`);
  }
  b.addOutput(b.and(
    b.not(latches[max - 1]),
    (max === 1) ? TRUE : latches[max - 2]
  ), `counter_value_is_${max}`);
  return b.build(
      `This circuit is a unary counter that counts up to ${max}. The output ` +
      `bit is set to 1 when the counter reaches its maximum value, that is, ` +
      `during iteration ${max - 1}.`);
}

export default Object.fromEntries(range(1, 8 + 1).map((max) => [
  `unary-counter-maximum-${max}`,
  [false, () => buildUnaryCounter(max)]
]));
