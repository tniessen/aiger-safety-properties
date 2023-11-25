import { CircuitBuilder, FALSE, TRUE } from '../builder.js';
import { cartesian, intToBitsLE, range, seq } from '../utils.js';

import assert from 'node:assert';

function createSingleProcessorSemaphore(n, m) {
  assert(n >= m);
  assert(m > 0);

  const b = new CircuitBuilder([
    ...seq(n).map((i) => `enable_thread_${i}`),
    ...seq(n).map((i) => `signal_thread_${i}`)
  ]);

  // When a thread is disabled, it will not be considered for execution. If
  // interrupts are enabled, the scheduler will not select the thread. If
  // interrupts are disabled and the previously selected thread is disabled,
  // no instruction will be executed.
  const threadEnabled = seq(n).map((i) => b.input(i));
  const threadSignal = seq(n).map((i) => b.input(n + i));

  const interruptsDisabled = b.newVar();

  // Marks the previously selected thread. Only relevant if interrupts are
  // disabled.
  const lastThreadSelected = seq(n).map(() => b.newVar());
  // Marks threads that are sleeping, i.e., waiting for the semaphore. Not
  // considered by the scheduler. However, as long as the thread is enabled and
  // interrupts are disabled, a waiting thread will remain active (i.e., until
  // the scheduler selects a different thread).
  const threadSleeping = seq(n).map(() => b.newVar());

  // Each thread's program counter.
  const threadPC = seq(n).map(() => seq(4).map(() => b.newVar()));

  // The semaphore counter. This starts at 0 and is incremented up to the
  // maximum number of concurrent operations. While unusual, this removes the
  // need to initialize the integer to a non-zero value.
  const count = seq(Math.ceil(Math.log2(m + 1))).map(() => b.newVar());

  // We pretend that there is an interrupt for every single cycle. That is,
  // threads can switch after every CPU cycle, i.e., after every instruction.
  const schedulerActive = b.not(interruptsDisabled);

  // This implements the (simplistic) scheduler. It simply always executes the
  // first thread that is both enabled and not sleeping.
  const threadEligibleForSelection = seq(n).map((i) => b.and(threadEnabled[i], b.not(threadSleeping[i])));
  const threadSelected = [threadEligibleForSelection[0]];
  let accum = TRUE;
  for (let i = 1; i < n; i++) {
    threadSelected.push(b.and(
      accum = b.and(b.not(threadSelected[i - 1]), accum),
      threadEligibleForSelection[i]
    ));
  }

  // If the scheduler is enabled, its selection will be used (if any). If the
  // scheduler is disabled, the previously selected thread will remain selected.
  const threadSelectedButMaybeDisabled = seq(n).map((i) => b.ifElse(schedulerActive, threadSelected[i], lastThreadSelected[i]));

  // Mark the active thread. Potentially, no thread is active. (For example, if
  // the scheduler is enabled but all threads are either sleeping or disabled,
  // or if the scheduler is disabled but the previously selected thread is
  // disabled.)
  const threadActive = seq(n).map((i) => b.and(threadEnabled[i], threadSelectedButMaybeDisabled[i]));

  const disableInterrupts = b.not(b.allFalse(seq(n).map((i) => {
    return b.and(threadActive[i], b.or(
      b.bitsEqualToConst(threadPC[i], intToBitsLE(1, 4)),
      b.bitsEqualToConst(threadPC[i], intToBitsLE(8, 4))
    ));
  })));
  const enableInterrupts = b.not(b.allFalse(seq(n).map((i) => {
    return b.and(threadActive[i], b.or(
      b.bitsEqualToConst(threadPC[i], intToBitsLE(6, 4)),
      b.bitsEqualToConst(threadPC[i], intToBitsLE(13, 4))
    ));
  })));

  let newInterruptsDisabled = b.ifElse(
      disableInterrupts,
      TRUE,
      b.ifElse(
          enableInterrupts,
          FALSE,
          interruptsDisabled));
  b.addLatch(interruptsDisabled, newInterruptsDisabled, 'interrupts_disabled');

  for (let i = 0; i < n; i++) {
    b.addLatch(lastThreadSelected[i], threadSelectedButMaybeDisabled[i],
               `thread_${i}_selected`);
  }

  const threadSelectedForBeingAwaken = [threadSleeping[0]];
  accum = TRUE;
  for (let i = 1; i < n; i++) {
    threadSelectedForBeingAwaken.push(b.and(
      accum = b.and(b.not(threadSelectedForBeingAwaken[i - 1]), accum),
      threadSleeping[i]
    ));
  }
  const activeThreadIsWaking = b.not(b.allFalse(seq(n).map((i) => {
    return b.and(threadActive[i], b.bitsEqualToConst(threadPC[i], intToBitsLE(12, 4)));
  })));
  for (let i = 0; i < n; i++) {
    const puttingItselfToSleep = b.and(
      threadActive[i],
      b.bitsEqualToConst(threadPC[i], intToBitsLE(5, 4))
    );
    const beingAwaken = b.and(activeThreadIsWaking, threadSelectedForBeingAwaken[i]);
    const newThreadSleeping = b.ifElse(
        puttingItselfToSleep,
        TRUE,
        b.ifElse(beingAwaken,
            FALSE,
            threadSleeping[i]));
    b.addLatch(threadSleeping[i], newThreadSleeping, `thread_${i}_sleeping`);
  }

  //  0 : while (!signal) goto 0
  //  1 : disable interrupts
  //  2 : if count == MAX then goto 5
  //  3 : increment count
  //  4 : goto 6
  //  5 : mark thread as waiting
  //  6 : enable interrupts (and yield)
  //  7 : while (!signal) goto 7
  //  8 : disable interrupts
  //  9 : if thread waiting goto 12
  // 10 : decrement count
  // 11 : goto 13
  // 12 : mark some waiting thread as ready
  // 13 : enable interrupts
  // 14 : goto 0

  const anyThreadSleeping = b.not(b.allFalse(threadSleeping));
  const countEqualsMax = b.bitsEqualToConst(count, intToBitsLE(m));

  for (let i = 0; i < n; i++) {
    const active = threadActive[i];
    const signal = threadSignal[i];
    const newPcByPc = [
      [signal, FALSE, FALSE, FALSE],
      [FALSE, TRUE, FALSE, FALSE],
      [1, b.not(countEqualsMax), countEqualsMax, FALSE],
      [FALSE, FALSE, TRUE, FALSE],
      [FALSE, TRUE, TRUE, FALSE],
      [FALSE, TRUE, TRUE, FALSE],
      [TRUE, TRUE, TRUE, FALSE],
      [b.not(signal), b.not(signal), b.not(signal), signal],
      [TRUE, FALSE, FALSE, TRUE],
      [FALSE, b.not(anyThreadSleeping), anyThreadSleeping, TRUE],
      [TRUE, TRUE, FALSE, TRUE],
      [TRUE, FALSE, TRUE, TRUE], // goto 13
      [TRUE, FALSE, TRUE, TRUE], // goto 13
      [FALSE, TRUE, TRUE, TRUE], // goto 14
      [FALSE, FALSE, FALSE, FALSE] // goto 0
    ];
    for (let j = 0; j < threadPC[i].length; j++) {
      const newPcBit = b.ifElse(
          active,
          b.ifElse(
              threadPC[i][3],
              b.ifElse(  // pc >= 8
                  threadPC[i][2],
                  b.ifElse(  // pc >= 12
                      threadPC[i][1],
                      newPcByPc[14][j],
                      b.ifElse(  // pc < 14
                          threadPC[i][0],
                          newPcByPc[13][j],
                          newPcByPc[12][j])),
                  b.ifElse(  // pc < 12
                      threadPC[i][1],
                      b.ifElse(  // pc >= 10
                          threadPC[i][0],
                          newPcByPc[11][j],
                          newPcByPc[10][j]),
                      b.ifElse(  // pc < 10
                          threadPC[i][0],
                          newPcByPc[9][j],
                          newPcByPc[8][j]))),
              b.ifElse(  // pc < 8
                  threadPC[i][2],
                  b.ifElse(  // pc >= 4
                      threadPC[i][1],
                      b.ifElse(  // pc >= 6
                          threadPC[i][0],
                          newPcByPc[7][j],
                          newPcByPc[6][j]),
                      b.ifElse(  // pc < 6
                          threadPC[i][0],
                          newPcByPc[5][j],
                          newPcByPc[4][j])),
                  b.ifElse(  // pc < 4
                      threadPC[i][1],
                      b.ifElse(  // pc >= 2
                          threadPC[i][0],
                          newPcByPc[3][j],
                          newPcByPc[2][j]),
                      b.ifElse(  // pc < 2
                          threadPC[i][0],
                          newPcByPc[1][j],
                          newPcByPc[0][j])))),
          threadPC[i][j]);
      b.addLatch(threadPC[i][j], newPcBit, `thread_${i}_pc_${j}`);
    }
  }

  const incrementCount = b.not(b.allFalse(seq(n).map((i) => {
    return b.and(threadActive[i],
                 b.bitsEqualToConst(threadPC[i], intToBitsLE(3, 4)));
  })));
  const decrementCount = b.not(b.allFalse(seq(n).map((i) => {
    return b.and(threadActive[i],
                 b.bitsEqualToConst(threadPC[i], intToBitsLE(10, 4)));
  })));
  const [incrementedCount, countIncrementOverflow] = b.incrementLE(count);
  const [decrementedCount, countDecrementOverflow] = b.decrementLE(count);
  for (let i = 0; i < count.length; i++) {
    const newCountBit = b.ifElse(
        incrementCount,
        incrementedCount[i],
        b.ifElse(
            decrementCount,
            decrementedCount[i],
            count[i]));
    b.addLatch(count[i], newCountBit, `semaphore_count_${i}`);
  }

  const threadIsAwakeInCriticalSection = seq(n).map((i) => b.and(b.bitsEqualToConst(threadPC[i], intToBitsLE(7, 4)), b.not(threadSleeping[i])));
  const nThreadsInCrit = b.popcount(threadIsAwakeInCriticalSection);
  assert.strictEqual(nThreadsInCrit.length, Math.ceil(Math.log2(n + 1)));
  const limitBits = intToBitsLE(m, nThreadsInCrit.length);
  let tooMany = FALSE;
  for (let i = 0; i < nThreadsInCrit.length; i++) {
    tooMany = b.or(
      b.and(nThreadsInCrit[i], b.not(limitBits[i])),
      b.and(b.not(b.xor(limitBits[i], nThreadsInCrit[i])), tooMany)
    );
  }

  const someThreadSleepingYetCountBelowMax = b.and(anyThreadSleeping, b.not(countEqualsMax));
  b.addOutput(b.not(b.allFalse([
    tooMany,
    b.and(incrementCount, countIncrementOverflow),
    b.and(decrementCount, countDecrementOverflow),
    someThreadSleepingYetCountBelowMax
  ])), 'bad_state_detector');

  return b.build(
      `This circuit simulates a single processor that switches between ${n} ` +
      `threads using a simplistic scheduler. The scheduler is triggered by ` +
      `interrupts, which can be disabled and enabled by the current thread. ` +
      `Additionally, a thread can enter a sleeping state, which will prevent ` +
      `the scheduler from switching to that thread.\n\n` +
      `On top of these features, a semaphore is implemented, which ensures ` +
      `that at most ${m} threads can be within the critical section ` +
      `simultaneously. When a thread ` +
      `wants to acquire the semaphore after receiving a signal, it disables ` +
      `interrupts and then compares the semaphore count to the limit. If ` +
      `possible, the thread changes the semaphore count and continues after ` +
      `enabling interrupts again. If that is not possible, the thread enters ` +
      `a sleeping state, enables interrupts, and yields to the scheduler. ` +
      `Once a thread has acquired the semaphore, it remains in the critical ` +
      `section until receiving another signal. Once that happens, it ` +
      `releases the semaphore by first disabling interrupts, thus disabling ` +
      `the scheduler, then checks if another thread is waiting for the ` +
      `semaphore. If that is the case, the active thread wakes one of the ` +
      `waiting threads, then enables interrupts again, allowing the ` +
      `scheduler to switch to the awakened thread at the next interrupt. If ` +
      `no thread is waiting for the semaphore, the active thread changes the ` +
      `semaphore count and enables interrupts again, resuming normal control ` +
      `flow, and returns to its initial state (i.e., waits for another ` +
      `signal).\n\n` +
      `The output variable is set if any of the following is true, none of ` +
      `which can happen:\n` +
      `* ${m + 1} or more threads are in the critical section ` +
      `simultaneously,\n` +
      `* an arithmetic overflow occurs when changing the semaphore count, ` +
      `or\n` +
      `* a thread is sleeping for no reason.`);
}

const params = cartesian(range(2, 10), range(1, 10)).filter(([n, m]) => m <= n);

export default Object.fromEntries(params.map(([n, m]) => [
  `semaphore-single-processor-${n}-threads-limit-${m}`,
  [true, () => createSingleProcessorSemaphore(n, m)]
]));
