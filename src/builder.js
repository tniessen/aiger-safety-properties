import { seq } from './utils.js';

import assert from 'node:assert';

export const FALSE = 0;
export const TRUE = 1;

export class CircuitBuilder {
  static get FALSE() { return FALSE; }
  static get TRUE() { return TRUE; }

  #nVars = 0;
  #inputs = [];
  #latches = [];
  #gates = [];
  #outputs = [];

  #getSymbol = (t, i) => { throw new Error(`No such element: ${t} #${i}`); };
  #comment;

  constructor(inputs) {
    if (Array.isArray(inputs)) {
      for (let i = 0; i < inputs.length; i++) {
        this.#setSymbol('i', i, inputs[i]);
        this.#inputs.push(this.newVar());
      }
    } else if (!Number.isSafeInteger(inputs) || inputs < 0) {
      throw new Error('Invalid number of inputs');
    } else {
      for (let i = 0; i < inputs; i++) {
        this.#setSymbol('i', i, null);
        this.#inputs.push(this.newVar());
      }
    }
  }

  input(i) {
    return this.#inputs[i];
  }

  newVar() { return 2 * (++this.#nVars); }

  isConstOrLiteral(x) {
    return this.isLiteral(x) || x === FALSE || x === TRUE;
  }

  isLiteral(x) {
    return Number.isSafeInteger(x) && x >= 0 && x <= 2 * this.#nVars + 1;
  }

  and(a, b) {
    if (arguments.length !== 2) throw new Error('Two arguments required');

    if (!this.isConstOrLiteral(a)) throw new Error('Invalid left operand');
    if (!this.isConstOrLiteral(b)) throw new Error('Invalid right operand');

    if (a === FALSE || b === FALSE) return FALSE;
    if (a === TRUE) return b;
    if (b === TRUE) return a;
    if (a === this.not(b)) return FALSE;
    if (a === b) return a;

    [a, b] = [a, b].sort((x, y) => x - y);
    const existing = this.#gates.find(([_, l, r]) => l == a && r == b);
    if (existing) return existing[0];
    const v = this.newVar();
    this.#gates.push([v, a, b]);
    return v;
  }

  not(value) {
    if (arguments.length !== 1) throw new Error('Two arguments required');
    if (!this.isConstOrLiteral(value)) throw new Error('Invalid value');
    return value ^ 1;
  }

  nand(left, right) {
    if (arguments.length !== 2) throw new Error('Two arguments required');
    return this.not(this.and(left, right));
  }

  or(left, right) {
    if (arguments.length !== 2) throw new Error('Two arguments required');
    return this.nand(this.not(left), this.not(right));
  }

  xor(left, right) {
    if (arguments.length !== 2) throw new Error('Two arguments required');
    return this.or(
      this.and(left, this.not(right)),
      this.and(this.not(left), right)
    );
  }

  xnor(left, right) {
    if (arguments.length !== 2) throw new Error('Two arguments required');
    return this.or(
      this.and(left, right),
      this.and(this.not(left), this.not(right))
    );
  }

  equal(a, b) {
    if (arguments.length !== 2) throw new Error('Two arguments required');
    if (a.length !== b.length) throw new Error('Inputs do not match');
    return this.allTrue(a.map((bit, i) => this.xnor(bit, b[i])));
  }

  halfAdder(a, b) {
    if (arguments.length !== 2) throw new Error('Two arguments required');
    return [
      this.nand(this.nand(a, this.not(b)), this.nand(this.not(a), b)),
      this.and(a, b)
    ];
  }

  fullAdder(a, b, cIn) {
    if (arguments.length !== 3) throw new Error('Three arguments required');
    const [s1, c1] = this.halfAdder(a, b);
    const [s, c2] = this.halfAdder(s1, cIn);
    const cOut = this.or(c1, c2);
    return [s, cOut];
  }

  addLatch(v, lit, symbol) {
    const index = this.#latches.push([v, lit]) - 1;
    this.#setSymbol('l', index, symbol);
  }

  addOutput(lit, symbol) {
    const index = this.#outputs.push(lit) - 1;
    this.#setSymbol('o', index, symbol);
  }

  #setSymbol(type, index, symbol) {
    this.#getSymbol = ((next) => (t, i) => {
      if (t === type && i === index) return symbol;
      return next(t, i);
    })(this.#getSymbol);
  }

  halfSubtractor(a, b) {
    if (arguments.length !== 2) throw new Error('Two arguments required');
    return [
      this.nand(this.nand(a, this.not(b)), this.nand(this.not(a), b)),
      this.and(this.not(a), b)
    ];
  }

  decrementLE(bits) {
    if (arguments.length !== 1) throw new Error('One argument required');
    const out = [];
    let sum, carry = TRUE;
    for (const bit of bits) {
      [sum, carry] = this.halfSubtractor(bit, carry);
      out.push(sum);
    }
    return [out, carry];
  }

  incrementLE(bits) {
    if (arguments.length !== 1) throw new Error('One argument required');
    const out = [];
    let sum, carry = TRUE;
    for (const bit of bits) {
      [sum, carry] = this.halfAdder(bit, carry);
      out.push(sum);
    }
    return [out, carry];
  }

  incrementBE(bits) {
    if (arguments.length !== 1) throw new Error('One argument required');
    const [out, carry] = this.incrementLE([...bits].reverse());
    return [out.reverse(), carry];
  }

  addLEWithExplicitCarryIn(a, b, carryIn) {
    if (arguments.length !== 3) throw new Error('Three argument required');
    if (a.length !== b.length) throw new Error('Inputs do not match');
    const out = [];
    let sum, carry = carryIn;
    for (let i = 0; i < a.length; i++) {
      [sum, carry] = this.fullAdder(a[i], b[i], carry);
      out.push(sum);
    }
    return [out, carry];
  }

  addLE(a, b) {
    if (arguments.length !== 2) throw new Error('Two arguments required');
    return this.addLEWithExplicitCarryIn(a, b, FALSE);
  }

  addLEPlus1(a, b) {
    if (arguments.length !== 2) throw new Error('Two arguments required');
    return this.addLEWithExplicitCarryIn(a, b, TRUE);
  }

  multiplyLE(a, b) {
    if (arguments.length !== 2) throw new Error('Two arguments required');

    const nColumns = a.length;
    const nRows = b.length;

    if (nRows < nColumns) console.warn('Warning: fewer rows than columns');

    let sum, carry = FALSE;

    for (let row = 0; row < nRows; row++) {
      const rowBits = a.map((aBit) => this.and(aBit, b[row]));
      if (row === 0) {
        sum = rowBits;
      } else {
        const leftPaddedAccum = [...sum, carry];
        const leftShiftedSummand = [...seq(row).map(() => FALSE), ...rowBits];
        [sum, carry] = this.addLE(leftPaddedAccum, leftShiftedSummand);
      }
    }

    if (sum.length !== nColumns + nRows - 1) throw new Error('bug');

    return [...sum, carry];
  }

  popcount(bits) {
    if (arguments.length !== 1) throw new Error('One argument required');
    if (!Array.isArray(bits)) throw new Error();
    if (bits.length <= 1) return bits;
    let [s, c] = this.halfAdder(bits[0], bits[1]);
    s = [s];
    for (let i = 2; i < bits.length; i++) {
      const nBitsNeededForCount = Math.ceil(Math.log2(i + 1));
      if (nBitsNeededForCount === s.length + 1) { s.push(c); c = FALSE; }
      [s, c] = this.addLEWithExplicitCarryIn(s, [bits[i], ...seq(nBitsNeededForCount - 1).fill(FALSE)], c);
    }
    const result = Math.ceil(Math.log2(bits.length + 1)) === s.length ? s : [...s, c];
    assert.strictEqual(result.length, Math.ceil(Math.log2(bits.length + 1)));
    return result;
  }

  bitsEqualToConst(bits, constant) {
    if (arguments.length !== 2) throw new Error('Two arguments required');

    if (bits.length !== constant.length) {
      throw new Error(`Inputs do not match: ${bits.length} vs ${constant.length} bits`);
    }
    if (bits.length === 0) return TRUE;
    return this.allTrue(bits.map((bit, i) => constant[i] ? bit : this.not(bit)));
  }

  allFalse(bits) {
    if (arguments.length !== 1) throw new Error('One argument required');
    if (!Array.isArray(bits)) throw new Error('Not an array');
    return this.bitsEqualToConst(bits, bits.map(() => false));
  }

  allTrue(bits) {
    if (arguments.length !== 1) throw new Error('One argument required');
    if (!Array.isArray(bits)) throw new Error('Not an array');
    if (bits.length === 1) return bits[0];
    const pairs = [];
    for (let i = 0; i < bits.length - 1; i += 2) {
      pairs.push(this.and(bits[i], bits[i + 1]));
    }
    if (bits.length % 2 !== 0) pairs.push(bits[bits.length - 1]);
    return this.allTrue(pairs);
  }

  ifElse(cond, ifValue, elseValue) {
    if (arguments.length !== 3) throw new Error('Three arguments required');
    return this.or(
      this.and(cond, ifValue),
      this.and(this.not(cond), elseValue)
    );
  }

  set comment(comment) {
    this.#comment = comment;
  }

  build(comment = this.#comment) {
    return `aag ${this.#nVars} ${this.#inputs.length} ${this.#latches.length} ${this.#outputs.length} ${this.#gates.length}\n` +
           `${this.#inputs.map((i) => `${i}\n`).join('')}` +
           `${this.#latches.map(([v, l]) => `${v} ${l}\n`).join('')}` +
           `${this.#outputs.map((o) => `${o}\n`).join('')}` +
           `${this.#gates.map(([v, a, b]) => `${v} ${a} ${b}\n`).join('')}` +
           `${this.#formatSymbols('i', this.#inputs)}` +
           `${this.#formatSymbols('l', this.#latches)}` +
           `${this.#formatSymbols('o', this.#outputs)}` +
           `${comment != null ? `c\n${'-'.repeat(80)}\n${this.#formatComment(comment)}\n` : ''}`;
  }

  #formatSymbols(type, list) {
    return list.map((_, i) => [i, this.#getSymbol(type, i)])
               .filter(([_, sym]) => sym != null)
               .map(([i, sym]) => `${type}${i} ${sym}\n`)
               .join('');
  }

  #formatComment(comment) {
    return comment.replace(/(?![^\n]{1,80}$)([^\n]{1,80})\s/g, '$1\n')
                  .trim()
                  .replace(/^[ \t]+|[ \t]+$/gm, '')
                  .replace(/\n\n+/g, '\n---\n');
  }
};
