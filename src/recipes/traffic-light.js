import { CircuitBuilder } from '../builder.js';
import { seq } from '../utils.js';

function buildTrafficLight() {
  const b = new CircuitBuilder(0);
  const red = b.newVar();
  const yellow = b.newVar();
  const green = b.newVar();
  const isInit = b.allFalse([red, yellow, green]);
  const isRedPhase = b.and(red, b.not(yellow));
  const isRedYellowPhase = b.and(red, yellow);
  const isGreenPhase = green;
  const isYellowPhase = b.and(yellow, b.not(red));
  b.addLatch(red, b.or(isInit, b.or(isYellowPhase, isRedPhase)), 'red');
  b.addLatch(yellow, b.or(isRedPhase, isGreenPhase), 'yellow');
  b.addLatch(green, isRedYellowPhase, 'green');
  b.addOutput(b.and(red, green), 'red_and_green');
  return b.build(
      'This circuit is a simple traffic light. Each of the three signals ' +
      '(red, yellow, green) is represented by one latch.\n\n' +
      'The traffic light initializes itself such that the red signal is on. ' +
      'It then follows a standard cycle: red, red and yellow, green, yellow, ' +
      'red.\n\n' +
      'The output bit is set whenever both the red and the green signal are ' +
      'on at the same time, which never happens.');
}

function buildTrafficLightWithTimer(nTimerBits) {
  const b = new CircuitBuilder(0);
  const red = b.newVar();
  const yellow = b.newVar();
  const green = b.newVar();

  const timerBits = seq(nTimerBits).map(() => b.newVar());
  const timerElapsed = b.allFalse(timerBits);

  const isInit = b.allFalse([red, yellow, green]);

  const isRedPhase = b.and(red, b.not(yellow));
  const isRedYellowPhase = b.and(red, yellow);
  const isGreenPhase = green;
  const isYellowPhase = b.and(yellow, b.not(red));
  b.addLatch(red, b.ifElse(timerElapsed, b.or(isInit, b.or(isYellowPhase, isRedPhase)), red), 'red');
  b.addLatch(yellow, b.ifElse(timerElapsed, b.or(isRedPhase, isGreenPhase), yellow), 'yellow');
  b.addLatch(green, b.ifElse(timerElapsed, isRedYellowPhase, green), 'green');

  const [incremented] = b.incrementLE(timerBits);
  for (let i = 0; i < nTimerBits; i++) {
    b.addLatch(timerBits[i], incremented[i], `counter_bit_${i}`);
  }

  b.addOutput(b.and(red, green), 'red_and_green');

  return b.build(
      'This circuit is a simple traffic light. Each of the three signals ' +
      '(red, yellow, green) is represented by one latch. The remaining ' +
      `${nTimerBits} latches form a counter that acts as a timer: the ` +
      'traffic light only changes whenever the counter wraps around, that ' +
      `is, every ${2 ** nTimerBits} iterations.\n\n` +
      'The traffic light initializes itself such that the red signal is on. ' +
      'It then follows a standard cycle: red, red and yellow, green, yellow, ' +
      'red.\n\n' +
      'The output bit is set whenever both the red and the green signal are ' +
      'on at the same time, which never happens.');
}

export default {
  'traffic-light-cycle-prescale-bits-0': [true, buildTrafficLight],
  'traffic-light-cycle-prescale-bits-4': [true, () => buildTrafficLightWithTimer(4)],
  'traffic-light-cycle-prescale-bits-8': [true, () => buildTrafficLightWithTimer(8)]
};
