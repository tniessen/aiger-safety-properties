import { CircuitBuilder, FALSE, TRUE } from '../builder.js';
import { seq } from '../utils.js';

import assert from 'node:assert';

function buildStatelessMultiplierCircuit(product, inputSizes, extraComment) {
  const inputLabels = inputSizes.map((size, i) => seq(size).map((j) => `input_${i}_bit_${j}`)).flat();
  const b = new CircuitBuilder(inputLabels);
  const inputs = [];
  for (let i = 0, off = 0; i < inputSizes.length; off += inputSizes[i++]) {
    inputs.push(seq(inputSizes[i]).map((j) => b.input(off + j)));
  }
  const actualProduct = inputs.slice(1).reduce((p, o) => b.multiplyLE(p, o), inputs[0]);
  const expectedProduct = product.toString(2).padStart(actualProduct.length, '0').split('').reverse().map((c) => ({ 0: FALSE, 1: TRUE })[c]);
  const output = b.bitsEqualToConst(actualProduct, expectedProduct);
  b.addOutput(output, `product_is_${product}`);
  return b.build(
      `This (stateless) circuit takes ${inputSizes.length} integers and ` +
      `computes their product. The output bit is set if and only if the ` +
      `product is ${product}.\n\n` + extraComment);
}

export function buildAccumulatingMultiplierCircuit(product, inputSize, extraComment) {
  const inputLabels = seq(inputSize).map((i) => `input_${i}`);
  const b = new CircuitBuilder(inputLabels);
  const inputs = seq(inputSize).map((i) => b.input(i));

  const nAccumBits = Math.ceil(Math.log2(product));
  if (inputSize >= nAccumBits) throw new Error();
  const accum = seq(nAccumBits).map(() => b.newVar());
  const accumIsZero = b.allFalse(accum);

  const newProduct = b.multiplyLE(inputs, accum);
  const multOverflow = b.not(b.allFalse(newProduct.slice(nAccumBits)));

  const reset = b.or(accumIsZero, multOverflow);

  for (let i = 0; i < nAccumBits; i++) {
    b.addLatch(accum[i], b.ifElse(reset, (i === 0) ? TRUE : FALSE,
                                         newProduct[i]), `accum_${i}`);
  }

  const expectedProduct = product.toString(2).split('').reverse().map((c) => ({ 0: FALSE, 1: TRUE })[c]);
  const output = b.and(
    b.not(multOverflow),
    b.bitsEqualToConst(newProduct.slice(0, nAccumBits), expectedProduct)
  );
  b.addOutput(output, `product_is_${product}`);

  return b.build(
      `This circuit takes a ${inputSize}-bit integer as its input, which is ` +
      `multiplied with an internal ${nAccumBits}-bit accumulator during each ` +
      `iteration. Whenever the accumulator's value is 0 or exceeds ` +
      `${2 ** nAccumBits - 1}, it is set to 1 before the next iteration.\n\n` +
      `The output bit is set if and only if the product is ` +
      `${product}.\n\n` + extraComment);
}

function prime(p) {
  assert(p);
  const inputSize = Math.ceil(Math.log2(p) - 1);

  const stateless = () => buildStatelessMultiplierCircuit(p, [inputSize, inputSize],
      `Because ${p} is prime and greater than ${2 ** inputSize - 1}, it ` +
      `cannot be represented as the product of two ${inputSize}-bit ` +
      'integers. Thus, the output bit is never set.');

  const accumulating = () => buildAccumulatingMultiplierCircuit(p, inputSize,
      `Because ${p} is prime and greater than ${2 ** inputSize - 1}, it ` +
      `cannot be represented as the product of ${inputSize}-bit integers. ` +
      'Thus, the output bit is never set.');

  return [
    [`prime-${p}-stateless`, [true, stateless]],
    [`prime-${p}-accumulator`, [true, accumulating]]
  ];
}

const primes = [
  65537,     // 16-bit input
  20996011,  // 24-bit input
  2147483647 // 32-bit input
];

export default Object.fromEntries(primes.flatMap(prime));
