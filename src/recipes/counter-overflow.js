import { CircuitBuilder } from '../builder.js';
import { seq } from '../utils.js';

function build(nBits) {
  const counter = new CircuitBuilder(0);
  const bits = seq(nBits).map(() => counter.newVar());
  const [incremented, overflow] = counter.incrementLE(bits);
  for (let i = 0; i < bits.length; i++) {
    counter.addLatch(bits[i], incremented[i], `counter_bit_${i}`);
  }
  counter.addOutput(overflow, 'overflow_indicator');
  return counter.build(
      `This circuit is a simple ${nBits}-bit counter that increments the ` +
      'stored value by one during each transition. The single output bit is ' +
      `set to indicate an overflow (i.e., every ${2 ** nBits} iterations).`);
}

export default {
  'counter-overflow-4': [false, () => build(4)],
  'counter-overflow-8': [false, () => build(8)]
};
