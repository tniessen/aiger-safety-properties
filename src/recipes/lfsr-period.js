import { CircuitBuilder } from '../builder.js';
import { seq } from '../utils.js';

import assert from 'node:assert';

function buildLFSR({ n, exponents, taps, period }) {
  assert.strictEqual(exponents[0], n);
  assert.strictEqual(exponents[exponents.length - 1], 0);
  assert.strictEqual(exponents.length % 2, 1);
  assert.deepStrictEqual(exponents, [...exponents].sort((a, b) => b - a));
  assert.strictEqual(period, 2 ** n - 1);

  assert.deepStrictEqual(taps.toString(2).padStart(n, '0').split('').map((d, i) => [d, n - i]).filter(([d]) => d === '1').map(([, e]) => e), exponents.slice(0, -1));

  const ti = exponents.slice(1, -1).map((e) => e - 1);

  const aag = new CircuitBuilder(seq(n).map((i) => `input_${i}`));
  const inputs = seq(n).map((i) => aag.input(i));

  // Reserve variables for latches.
  const register = seq(n).map(() => aag.newVar());
  const copy = seq(n).map(() => aag.newVar());
  const counter = aag.newVar();

  // The actual feedback value: ((bit_{n - 1} xor bit_{tap_k}) xor ...) xor bit_{tap_0}.
  const feedback = [...ti].reverse().reduce((accum, tap) => aag.xor(accum, register[tap]), register[n - 1]);
  // The lowest bit receives the feedback, everything else is shifted into.
  const nextRegisterValue = [feedback, ...register.slice(0, -1)];

  const restart = aag.not(aag.allFalse(inputs));
  const nextCounter = aag.not(counter);
  const hasValue = aag.not(aag.allFalse(copy));
  const hasReachedInitialValue = aag.and(aag.equal(nextRegisterValue, copy), hasValue);
  const badPeriod = aag.and(aag.not(restart), aag.and(hasReachedInitialValue, aag.not(nextCounter)));
  const newValueIsZero = aag.allFalse(nextRegisterValue);
  const newValueIsZeroAndCopyNonzero = aag.and(newValueIsZero, hasValue);
  const resetCounter = aag.or(restart, hasReachedInitialValue);

  for (let i = 0; i < n; i++) {
    const newValue = aag.ifElse(restart, inputs[i], nextRegisterValue[i]);
    aag.addLatch(register[i], newValue, `register_bit_${i}`);
  }

  for (let i = 0; i < n; i++) {
    aag.addLatch(copy[i], aag.ifElse(restart, inputs[i], copy[i]), `copy_bit_${i}`);
  }

  aag.addLatch(counter, aag.and(aag.not(resetCounter), aag.not(counter)), 'counter_bit_0');

  aag.addOutput(aag.or(newValueIsZeroAndCopyNonzero, badPeriod), 'bad_state_detector');

  const poly = exponents.map((e) => e !== 0 ? e !== 1 ? `x^${e}` : 'x' : '1').join(' + ');
  return aag.build(
      `This circuit computes the period (modulo 2) of a Fibonacci linear ` +
      `feedback shift register with ${n} bits and taps ` +
      `0x${taps.toString(16).toUpperCase()}, corresponding to the feedback ` +
      `polynomial${n > 20 ? ' ' : '\n'}${poly} with period ${period.toLocaleString('en-US')}.\n\n` +
      `The circuit has ${n} input bits. If any of them are set, the ` +
      `computation is (re)started: the value of the input bits is copied ` +
      `into the ${n}-bit LFSR and into a second ${n}-bit register that acts as an immutable ` +
      `copy of the initial value. Otherwise, the register performs its ` +
      `regular operation and increments the period (modulo 2) in each step. ` +
      `Once the register value reaches the initial value, which is stored in ` +
      `the second register, the period is reset to zero. Setting any input ` +
      `to one starts a new computation.\n\n` +
      `The output bit is set if one of the following conditions is true, ` +
      `neither of which is possible:\n` +
      `* the register value becomes zero during its regular operation, or\n` +
      `* the register value reaches the initial value again, but the period is even.`);
}

const lfsrs = [
  {
    n: 2,
    exponents: [2, 1, 0],
    taps: 0x3,
    period: 3
  },
  {
    n: 3,
    exponents: [3, 2, 0],
    taps: 0x6,
    period: 7
  },
  {
    n: 4,
    exponents: [4, 3, 0],
    taps: 0xc,
    period: 15
  },
  {
    n: 5,
    exponents: [5, 3, 0],
    taps: 0x14,
    period: 31,
    testSequence: [0b00001, 0b10000, 0b01000, 0b00100, 0b10010, 0b01001]
  },
  {
    n: 6,
    exponents: [6, 5, 0],
    taps: 0x30,
    period: 63
  },
  {
    n: 7,
    exponents: [7, 6, 0],
    taps: 0x60,
    period: 127
  },
  {
    n: 8,
    exponents: [8, 6, 5, 4, 0],
    taps: 0xb8,
    period: 255
  },
  {
    n: 9,
    exponents: [9, 5, 0],
    taps: 0x110,
    period: 511
  },
  {
    n: 10,
    exponents: [10, 7, 0],
    taps: 0x240,
    period: 1_023
  },
  {
    n: 11,
    exponents: [11, 9, 0],
    taps: 0x500,
    period: 2_047
  },
  {
    n: 12,
    exponents: [12, 11, 10, 4, 0],
    taps: 0xe08,
    period: 4_095
  },
  {
    n: 13,
    exponents: [13, 12, 11, 8, 0],
    taps: 0x1c80,
    period: 8_191
  },
  {
    n: 14,
    exponents: [14, 13, 12, 2, 0],
    taps: 0x3802,
    period: 16_383
  },
  {
    n: 15,
    exponents: [15, 14, 0],
    taps: 0x6000,
    period: 32_767
  },
  {
    n: 16,
    exponents: [16, 15, 13, 4, 0],
    taps: 0xd008,
    period: 65_535
  },
  {
    n: 17,
    exponents: [17, 14, 0],
    taps: 0x12000,
    period: 131_071
  },
  {
    n: 18,
    exponents: [18, 11, 0],
    taps: 0x20400,
    period: 262_143
  },
  {
    n: 19,
    exponents: [19, 18, 17, 14, 0],
    taps: 0x72000,
    period: 524_287
  },
  {
    n: 20,
    exponents: [20, 17, 0],
    taps: 0x90000,
    period: 1_048_575
  },
  {
    n: 21,
    exponents: [21, 19, 0],
    taps: 0x140000,
    period: 2_097_151
  },
  {
    n: 22,
    exponents: [22, 21, 0],
    taps: 0x300000,
    period: 4_194_303
  },
  {
    n: 23,
    exponents: [23, 18, 0],
    taps: 0x420000,
    period: 8_388_607
  },
  {
    n: 24,
    exponents: [24, 23, 22, 17, 0],
    taps: 0xe10000,
    period: 16_777_215
  }
];

export default Object.fromEntries(lfsrs.map((params) => [
  `fibonacci-${params.n.toString().padStart(2, '0')}-0x${params.taps.toString(16)}`,
  [true, () => buildLFSR(params)]
]));
