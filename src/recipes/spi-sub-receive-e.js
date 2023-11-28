import { CircuitBuilder, TRUE } from '../builder.js';
import { seq } from '../utils.js';

import assert from 'node:assert';

const E = '1010110111111000010101000101100010100010101110110100101010011010';
const bitsE = E.split('').map((c) => c === '1');

function build(nBits) {
  const aag = new CircuitBuilder(['SCLK', 'MOSI', 'NOT_CS']);
  const [SCLK, MOSI, notCS] = seq(3).map((i) => aag.input(i));
  const init = aag.newVar();
  const prevSCLK = aag.newVar();
  const mask = seq(nBits).map(() => aag.newVar());
  const bits = seq(nBits).map(() => aag.newVar());
  const CS = aag.not(notCS);

  // Ignore the first clock cycle and only do anything if the chip is selected.
  aag.addLatch(init, TRUE, 'init');
  const active = aag.and(CS, init);

  // Remember the previous clock signal to detect the clock edge.
  aag.addLatch(prevSCLK, aag.ifElse(active, SCLK, prevSCLK), 'prev_SCLK');
  const risingEdge = aag.and(active, aag.and(SCLK, aag.not(prevSCLK)));

  // If the chip is initialized and selected, whenever there is a rising edge,
  // copy one bit from input to the buffer. Whenever receiving the first bit,
  // clear all other bits.
  for (let i = 0; i < nBits; i++) {
    const newMaskValue = aag.ifElse(risingEdge, i === 0 ? mask[nBits - 1] : mask[i - 1], mask[i]);
    aag.addLatch(mask[i], i === 0 ? aag.or(aag.not(init), newMaskValue) : newMaskValue, `mask_${i}`);
  }
  const receivingFirstBit = aag.and(risingEdge, mask[0]);
  for (let i = 0; i < nBits; i++) {
    const newValue = aag.ifElse(aag.and(risingEdge, mask[i]),
                                MOSI,
                                i === 0 ? bits[i]
                                        : aag.and(bits[i], aag.not(receivingFirstBit)));
    aag.addLatch(bits[i], newValue, `bit_${i}`);
  }

  // Compare the stored bits (received from left to right, MSB first) to the
  // first bits of the binary representation of Euler's number.
  const relevantBitsE = bitsE.slice(0, nBits);
  const fullyReceived = mask[0];
  aag.addOutput(aag.and(aag.and(active, fullyReceived), aag.bitsEqualToConst(bits, relevantBitsE)), 'MISO');

  const match = relevantBitsE.map((b) => String(+b)).join('');
  assert.strictEqual(match, E.slice(0, nBits));
  return aag.build(
      `This circuit implements a simplified Serial Peripheral Interface ` +
      `(SPI) sub that repeatedly receives ${nBits} bits of data from a SPI ` +
      `main and outputs the MISO signal. The circuit sets MISO to high after ` +
      `receiving the bit sequence ${match} (the first ${nBits} bits of ` +
      `Euler's number).\n\n` +
      `The circuit ignores any inputs during the first cycle and instead ` +
      `initializes internal latches as necessary. Afterwards, NOT_CS must ` +
      `be set to low for the circuit to become active. A single bit of data ` +
      `is received from MOSI during the rising edge of SCLK. The internal ` +
      `buffer is reset after every ${nBits} received bits.`);
}

export default Object.fromEntries([8, 16, 24, 32, 48, 64].map((nBits) => [
  `spi-bus-receive-e-${nBits.toString().padStart(2, '0')}-bits`,
  [false, () => build(nBits)]
]));
