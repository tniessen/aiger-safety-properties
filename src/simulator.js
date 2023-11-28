import { seq } from './utils.js';

import assert from 'node:assert';

export class SlowSimulator {
  #inputs;
  #latches;
  #outputs;
  #gates;
  #vars;

  #currentLatchValues;

  constructor(aag) {
    const lines = aag.split(/\n/g);
    const [M, I, L, O, A] = /^aag (\d+) (\d+) (\d+) (\d+) (\d+)$/.exec(lines[0]).slice(1).map((n) => parseInt(n, 10));
    lines.shift();
    this.#inputs = lines.splice(0, I).map((i) => parseInt(/^\d+$/.exec(i)[0], 10));
    this.#latches = lines.splice(0, L).map((l) => /^(\d+) (\d+)$/.exec(l).slice(1).map((n) => parseInt(n, 10)));
    this.#outputs = lines.splice(0, O).map((o) => parseInt(/^\d+$/.exec(o)[0], 10));
    this.#gates = lines.splice(0, A).map((a) => /^(\d+) (\d+) (\d+)$/.exec(a).slice(1).map((n) => parseInt(n, 10)));

    this.#vars = Array(M + 1);
    const assign = (i, value) => {
      assert.strictEqual(i & 1, 0);
      assert.strictEqual(this.#vars[i >> 1], undefined);
      this.#vars[i >> 1] = value;
    };
    for (let i = 0; i < I; i++) assign(this.#inputs[i], ['i', i]);
    for (let l = 0; l < L; l++) assign(this.#latches[l][0], ['l', l]);
    for (let a = 0; a < A; a++) assign(this.#gates[a][0], ['a', this.#gates[a][1], this.#gates[a][2]]);

    this.#currentLatchValues = seq(L).map(() => false);
  }

  step(...inputs) {
    assert.strictEqual(inputs.length, this.#inputs.length);
    const vars = Array(this.#vars.length);
    const v = (index) => {
      if (index === 0) return false;
      const [type, ...params] = this.#vars[index];
      if (type === 'i') {
        const ret = inputs[params[0]];
        assert(ret === true || ret === false || ret === 1 || ret === 0);
        return ret;
      } else if (type === 'l') {
        return this.#currentLatchValues[params[0]];
      } else {
        const [a, b] = params;
        return lit(a) && lit(b);
      }
    };
    const lit = (lit) => {
      const sign = lit & 1;
      const vi = lit >> 1;
      const val = vars[vi] ?? (vars[vi] = v(vi));
      return sign ? !val : !!val;
    };
    const outputs = this.#outputs.map(lit);
    this.#currentLatchValues = this.#latches.map(([, l]) => lit(l));
    return outputs;
  }

  get latches() {
    return this.#currentLatchValues;
  }
};
