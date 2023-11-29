import { CircuitBuilder, FALSE, TRUE } from '../builder.js';
import { seq } from '../utils.js';

import assert from 'node:assert';

function build(nBits) {
  const nBitsUnary = (1 << nBits) - 1;
  const aag = new CircuitBuilder(['enable']);
  const enable = aag.input(0);

  const binary = seq(nBits).map(() => aag.newVar());
  const unary = seq(nBitsUnary).map(() => aag.newVar());

  const [nextBinary, overflowBinary] = aag.incrementLE(binary);
  for (let i = 0; i < binary.length; i++) {
    aag.addLatch(binary[i], aag.ifElse(enable, nextBinary[i], binary[i]), `binary_bit_${i}`);
  }

  const unaryMSB = unary[unary.length - 1];
  for (let i = 0; i < unary.length; i++) {
    const value = aag.and(
      i === 0 ? TRUE : unary[i - 1],
      aag.not(unaryMSB)
    );
    aag.addLatch(unary[i], aag.ifElse(enable, value, unary[i]), `unary_bit_${i}`);
  }

  const unaryAsBinary = aag.popcount(unary);
  assert.strictEqual(unaryAsBinary.length, binary.length);

  const equal = aag.equal(binary, unaryAsBinary);
  const badOverflow = aag.xor(overflowBinary, unaryMSB);
  aag.addOutput(aag.or(aag.not(equal), badOverflow), 'bad_state_detector');

  return aag.build(
      `This circuit implements two counters, one of which is a ${nBits}-bit ` +
      `binary counter and one of which is a ${nBitsUnary}-bit unary counter. ` +
      `Whenever the input bit is set, both counters are incremented. The ` +
      `output bit is set if the Hamming weight (popcount) of the unary ` +
      `counter is not equal to the value of the binary counter, or if either ` +
      `counter overflows and the other does not.\n\n` +
      `This is challenging to verify in multiple ways. First, the unary ` +
      `counter consists of ${nBitsUnary} latches, which blow up the state ` +
      `space. Second, the circuit that computes the popcount of the unary ` +
      `counter is non-trivial and it is has not explicitly been optimized ` +
      `for the fact that the underlying counter is unary (as opposed to an ` +
      `arbitrary bit sequence, such as a binary counter).\n\n` +
      `Nevertheless, despite the large state space of ` +
      `${2n ** BigInt(nBits + nBitsUnary)} states, only ${2 ** nBits} states ` +
      `are actually reachable, and can be enumerated easily.`);
}

export default Object.fromEntries([4, 5, 6, 7, 8].map((nBits) => [
  `unary-binary-counter-${nBits}-bits`,
  [true, () => build(nBits)]
]));
