import { FALSE, TRUE } from './builder.js';

import assert from 'node:assert';

export const seq = (n) => [...Array(n).keys()];
export const range = (min, max) => seq(max - min).map((i) => min + i);

export function cartesian(a, ...rest) {
  if (!Array.isArray(a)) throw new TypeError('Array expected');
  if (rest.length === 0) return a.map((x) => [x]);
  const r = cartesian(...rest);
  return a.flatMap((x) => r.map((y) => [x, ...y]));
}

export function intToBitsLE(value, width) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Not an unsigned safe integer: ${value}`);
  }

  let bits = [];
  while (value !== 0) {
    bits.push([FALSE, TRUE][value & 1]);
    value >>= 1;
  }

  if (width != undefined) {
    assert(Number.isSafeInteger(width) && width >= 0);
    if (bits.length > width) throw new Error(`Value exceeds ${width} bits`);
    bits = [...bits, ...seq(width - bits.length).map(() => FALSE)];
  }

  return bits;
}
