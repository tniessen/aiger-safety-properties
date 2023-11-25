import { CircuitBuilder, FALSE, TRUE } from '../builder.js';
import { seq } from '../utils.js';

function createPetersonsAlgorithm2Threads1Core() {
  // We create two "threads", each of which does the following:
  //
  //   0: while (!signal) {}
  //   1: flag[self] = true
  //   2: turn = 1 - self
  //   3: if (flag[1 - self] != true) goto 5
  //   4: if (turn == 1 - self) goto 3
  //   5: [critical] while (!signal) {}
  //   6: flag[self] = false
  //   7: goto 0
  //
  // There are two inputs: the first controls which thread is active right now,
  // the second is a signal that causes the active thread to enter/exit the
  // critical section.
  //
  // The output variable is true if more than one thread is in the critical
  // section.

  const b = new CircuitBuilder(['thread_select', 'signal']);
  const select = b.input(0);
  const signal = b.input(1);

  const flag = seq(2).map(() => b.newVar());
  const turn = b.newVar();

  const pcs = seq(2).map(() => seq(3).map(() => b.newVar()));

  // Each thread sets flag[self] = true when its pc == 1 and
  //                  flag[self] = false when its pc == 6.
  for (let self = 0; self <= 1; self++) {
    const newFlagSelfIfActive = b.ifElse(
        b.bitsEqualToConst(pcs[self], [TRUE, FALSE, FALSE]),
        TRUE,
        b.ifElse(
            b.bitsEqualToConst(pcs[self], [FALSE, TRUE, TRUE]),
            FALSE,
            flag[self]));

    const isActive = (self === 0) ? b.not(select) : select;
    const newFlagSelf = b.ifElse(isActive, newFlagSelfIfActive, flag[self]);
    b.addLatch(flag[self], newFlagSelf, `flag_${self}`);
  }

  // Each thread sets turn = 1 - self when its pc == 2.
  const newTurn = b.ifElse(
      b.not(select),
      b.ifElse(
          b.bitsEqualToConst(pcs[0], [FALSE, TRUE, FALSE]), TRUE, turn),
      b.ifElse(
          b.bitsEqualToConst(pcs[1], [FALSE, TRUE, FALSE]), FALSE, turn));
  b.addLatch(turn, newTurn, 'turn');

  // Now compute the transition relation for each thread.
  for (let self = 0; self <= 1; self++) {
    const pc = pcs[self];
    const turnEqSelf = self === 0 ? b.not(turn) : turn;

    // Design a somewhat efficient switch statement.
    const newPcByPc = [
      [signal, FALSE, FALSE], // while (!signal) {} (else goto 1)
      [FALSE, TRUE, FALSE],  // flag[self] = true (goto 2)
      [TRUE, TRUE, FALSE],   // turn = 1 - self (goto 3)
      [b.not(flag[1 - self]), FALSE, TRUE], // if (flag[1 - self] != true) goto 5 (else goto 4)
      [TRUE, b.not(turnEqSelf), turnEqSelf], // if (turn == 1 - self) goto 3 (else goto 5)
      [b.not(signal), signal, TRUE], // while(!signal) {} (else goto 6),
      [TRUE, TRUE, TRUE], // flag[self] = false (goto 7),
      [FALSE, FALSE, FALSE] // goto 0
    ];

    for (let i = 0; i < 3; i++) {
      const newPcIfActive = b.ifElse(
          pc[2],
          b.ifElse( // pc >= 4
              pc[1],
              b.ifElse(  // pc >= 6
                  pc[0],
                  newPcByPc[7][i],
                  newPcByPc[6][i]),
              b.ifElse(  // pc < 6
                  pc[0],
                  newPcByPc[5][i],
                  newPcByPc[4][i])),
          b.ifElse(  // pc < 4
              pc[1],
              b.ifElse(  // pc >= 2
                  pc[0],
                  newPcByPc[3][i],
                  newPcByPc[2][i]),
              b.ifElse(  // pc < 2
                  pc[0],
                  newPcByPc[1][i],
                  newPcByPc[0][i])));
      const isActive = (self === 0) ? b.not(select) : select;
      const newPc = b.ifElse(isActive, newPcIfActive, pc[i]);
      b.addLatch(pc[i], newPc, `thread_${self}_pc_${i}`);
    }
  }

  const isInCriticalSection = pcs.map((pc) => b.bitsEqualToConst(pc, [TRUE, FALSE, TRUE]));
  b.addOutput(b.and(isInCriticalSection[0], isInCriticalSection[1]),
              'both_threads_in_critical_section');

  return b.build(
      'This circuit implements Peterson\'s algorithm for mutual exclusion ' +
      'among two threads. Each of the two threads in this example waits for ' +
      'the "signal" input, then attempts to enter the critical section. Once ' +
      'a thread enters the critical section, it remains there until it ' +
      'receives another signal. Peterson\'s algorithm guarantees that only ' +
      'one thread can be within the critical section at any given time.\n\n' +
      'Both threads are assumed to share a single core, that is, only one ' +
      'instruction of one thread is executed at any given time. The first ' +
      'input is used to select which thread shall be active, i.e., ' +
      'scheduling is non-deterministic. The signal is only delivered to the ' +
      'active thread.\n\n' +
      'The output bit is set only if both threads are within the critical ' +
      'section at the same time, which should never happen.');
}

function createPetersonsAlgorithm2Threads2Cores() {
  // We create two "threads", each of which does the following:
  //
  //   0: while (!signal) {}
  //   1: flag[self] = true
  //   2: turn = 1 - self
  //   3: if (flag[1 - self] != true) goto 5
  //   4: if (turn == 1 - self) goto 3
  //   5: [critical] while (!signal) {}
  //   6: flag[self] = false
  //   7: goto 0
  //
  // There are four inputs: the first two control which of the threads are
  // active right now, the third is an signal that causes the active thread(s)
  // to enter/exit the critical section, and the fourth is used to model
  // non-determinism.
  //
  // The output variable is true if more than one thread is in the critical
  // section.

  const b = new CircuitBuilder(['enable_thread_0', 'enable_thread_1', 'signal_thread_0', 'signal_thread_1', 'random']);
  const enableThread = seq(2).map((i) => b.input(i));
  const signalThread = seq(2).map((i) => b.input(2 + i));
  const random = b.input(4);

  const flag = seq(2).map(() => b.newVar());
  const turn = b.newVar();

  const pcs = seq(2).map(() => seq(3).map(() => b.newVar()));

  // Each thread sets flag[self] = true when its pc == 1 and
  //                  flag[self] = false when its pc == 6.
  for (let self = 0; self <= 1; self++) {
    const newFlagSelfIfActive = b.ifElse(
        b.bitsEqualToConst(pcs[self], [TRUE, FALSE, FALSE]),
        TRUE,
        b.ifElse(
            b.bitsEqualToConst(pcs[self], [FALSE, TRUE, TRUE]),
            FALSE,
            flag[self]));

    const newFlagSelf = b.ifElse(enableThread[self], newFlagSelfIfActive, flag[self]);
    b.addLatch(flag[self], newFlagSelf, `flag_${self}`);
  }

  // Each thread sets turn = 1 - self when its pc == 2.
  // When both try to modify turn at exactly the same time, we use a random
  // value.
  const settingTurn = pcs.map((pc, i) => b.and(b.bitsEqualToConst(pc, [FALSE, TRUE, FALSE]), enableThread[i]));
  const newTurn = b.ifElse(
      b.and(settingTurn[0], settingTurn[1]),
      random,
      b.ifElse(
          b.not(b.or(settingTurn[0], settingTurn[1])),
          turn,
          b.ifElse(
              settingTurn[0],
              TRUE,
              FALSE)));
  b.addLatch(turn, newTurn, 'turn');

  // Now compute the transition relation for each thread.
  for (let self = 0; self <= 1; self++) {
    const pc = pcs[self];
    const turnEqSelf = self === 0 ? b.not(turn) : turn;

    // Design a somewhat efficient switch statement.
    const newPcByPc = [
      [signalThread[self], FALSE, FALSE], // while (!signal) {} (else goto 1)
      [FALSE, TRUE, FALSE],  // flag[self] = true (goto 2)
      [TRUE, TRUE, FALSE],   // turn = 1 - self (goto 3)
      [b.not(flag[1 - self]), FALSE, TRUE], // if (flag[1 - self] != true) goto 5 (else goto 4)
      [TRUE, b.not(turnEqSelf), turnEqSelf], // if (turn == 1 - self) goto 3 (else goto 5)
      [b.not(signalThread[self]), signalThread[self], TRUE], // while(!signal) {} (else goto 6),
      [TRUE, TRUE, TRUE], // flag[self] = false (goto 7),
      [FALSE, FALSE, FALSE] // goto 0
    ];

    for (let i = 0; i < 3; i++) {
      const newPcIfActive = b.ifElse(
          pc[2],
          b.ifElse( // pc >= 4
              pc[1],
              b.ifElse(  // pc >= 6
                  pc[0],
                  newPcByPc[7][i],
                  newPcByPc[6][i]),
              b.ifElse(  // pc < 6
                  pc[0],
                  newPcByPc[5][i],
                  newPcByPc[4][i])),
          b.ifElse(  // pc < 4
              pc[1],
              b.ifElse(  // pc >= 2
                  pc[0],
                  newPcByPc[3][i],
                  newPcByPc[2][i]),
              b.ifElse(  // pc < 2
                  pc[0],
                  newPcByPc[1][i],
                  newPcByPc[0][i])));
      const newPc = b.ifElse(enableThread[self], newPcIfActive, pc[i]);
      b.addLatch(pc[i], newPc, `thread_${self}_pc_${i}`);
    }
  }

  const isInCriticalSection = pcs.map((pc) => b.bitsEqualToConst(pc, [TRUE, FALSE, TRUE]));
  b.addOutput(b.and(isInCriticalSection[0], isInCriticalSection[1]),
              'both_threads_in_critical_section');

  return b.build(
      'This circuit implements Peterson\'s algorithm for mutual exclusion ' +
      'among two threads. Each of the two threads in this example waits for ' +
      'its respective "signal" input, then attempts to enter the critical ' +
      'section. Once a thread enters the critical section, it remains there ' +
      'until it receives another "signal" input. Peterson\'s algorithm ' +
      'guarantees that only one thread can be within the critical section at ' +
      'any given time.\n\n' +
      'Both threads are assumed to run in parallel, that is, multiple ' +
      'instructions may be executed at any given time. The first two inputs ' +
      'control which of the two threads are active, if any. Thus, scheduling ' +
      'is non-deterministic. Additionally, each thread has a separate signal ' +
      'input so that the timing of their respective signals is independent ' +
      'instruction scheduling. When both threads attempt to write to the ' +
      'same variable at the same time, the result is undefined, that is, it ' +
      'depends on the "random" input.\n\n' +
      'The output bit is set only if both threads are within the critical ' +
      'section at the same time, which should never happen.');
}

export default {
  'petersons-algorithm-2-threads-1-core': [true, createPetersonsAlgorithm2Threads1Core],
  'petersons-algorithm-2-threads-2-cores': [true, createPetersonsAlgorithm2Threads2Cores]
};
