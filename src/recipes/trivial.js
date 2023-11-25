import { CircuitBuilder, TRUE, FALSE } from '../builder.js';
import { seq } from '../utils.js';

function createConstCircuit(bool) {
  const b = new CircuitBuilder(0);
  const lit = bool ? TRUE : FALSE;
  const name = bool ? 'true' : 'false';
  b.addOutput(lit, name);
  return b.build(`This circuit represents the constant ${name} (${lit}).`);
}

function createBuffer() {
  const b = new CircuitBuilder(['input']);
  b.addOutput(b.input(0), 'output');
  return b.build(
      `This circuit simply redirects the input to the output.`);
}

function createLatch() {
  const b = new CircuitBuilder(['input']);
  const l = b.newVar();
  b.addLatch(l, b.input(0), 'latch');
  b.addOutput(l, 'previous_input');
  return b.build(
      `This circuit remembers the current input for the next iteration. That ` +
      `is, its output during iteration n + 1 is the same as the input during ` +
      `iteration n.`);
}

function createShift10101010() {
  const b = new CircuitBuilder(['register_bit_0']);
  const latches = seq(7).map(() => b.newVar());
  let prev = b.input(0);
  for (let i = 0; i < latches.length; i++) {
    b.addLatch(latches[i], prev, `register_bit_${i + 1}`);
    prev = latches[i];
  }
  b.addOutput(b.bitsEqualToConst([b.input(0), ...latches], [FALSE, TRUE, FALSE, TRUE, FALSE, TRUE, FALSE, TRUE]), 'register_value_is_10101010');
  return b.build(
      'This circuit has a single input bit, which is shifted into an 8-bit ' +
      'register at each step. The output bit is set if and only if the ' +
      `register's value is 10101010.`);
}

export default {
  'false': [true, () => createConstCircuit(false)],
  'true': [false, () => createConstCircuit(true)],
  'buffer': [false, createBuffer],
  'latch': [false, createLatch],
  'shift-10101010': [false, createShift10101010]
};
