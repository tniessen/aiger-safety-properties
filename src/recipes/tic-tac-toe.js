import { CircuitBuilder, FALSE } from '../builder.js';
import { seq } from '../utils.js';

function buildTicTacToe() {
  const at = (row, col) => (row - 1) * 3 + (col - 1);
  const pos = (index) => [1 + Math.floor(index / 3), 1 + (index % 3)];

  const inputLabels = seq(9).map((i) => `put_${pos(i)[0]}_${pos(i)[1]}`);
  const b = new CircuitBuilder(inputLabels);
  const inputs = seq(9).map((i) => b.input(i));

  const oddTurn = b.newVar();
  const x = seq(9).map(() => b.newVar());
  const o = seq(9).map(() => b.newVar());

  const xHasWon = b.newVar();
  const oHasWon = b.newVar();
  const nobodyHasWon = b.and(b.not(xHasWon), b.not(oHasWon));

  const [oddNumberOfInputBitsSet, moreThanOneInputBitSet] = inputs.reduce(([s, c], input) => {
    const [newSum, carry] = b.halfAdder(s, input);
    return [newSum, b.or(c, carry)];
  }, [FALSE, FALSE]);
  const exactlyOneInputBit = b.and(oddNumberOfInputBitsSet, b.not(moreThanOneInputBitSet));

  const inputBitIsValid = inputs.map((input, i) => b.not(b.and(input, b.or(x[i], o[i]))));
  const isValidMove = b.allTrue([nobodyHasWon, exactlyOneInputBit, ...inputBitIsValid]);

  const isWinningState = (s) => {
    return b.not(b.allFalse([
      // Diagonals.
      b.allTrue([s[at(1, 1)], s[at(2, 2)], s[at(3, 3)]]),
      b.allTrue([s[at(1, 3)], s[at(2, 2)], s[at(3, 1)]]),
      // Rows.
      ...seq(3).map((r) => b.allTrue(seq(3).map((c) => s[at(1 + r, 1 + c)]))),
      // Columns.
      ...seq(3).map((c) => b.allTrue(seq(3).map((r) => s[at(1 + r, 1 + c)])))
    ]));
  };

  const newX = x.map((xi, i) => b.or(xi, b.and(b.and(isValidMove, b.not(oddTurn)), inputs[i])));
  const newO = o.map((oi, i) => b.or(oi, b.and(b.and(isValidMove, oddTurn), inputs[i])));

  const xHasNowWon = isWinningState(newX);
  const oHasNowWon = isWinningState(newO);

  b.addLatch(oddTurn, b.ifElse(isValidMove, b.not(oddTurn), oddTurn), 'turn_o');
  for (let i = 0; i < 9; i++) {
    b.addLatch(x[i], newX[i], `x_${pos(i)[0]}_${pos(i)[1]}`);
  }
  for (let i = 0; i < 9; i++) {
    b.addLatch(o[i], newO[i], `o_${pos(i)[0]}_${pos(i)[1]}`);
  }
  b.addLatch(xHasWon, b.or(xHasWon, xHasNowWon), 'x_has_won');
  b.addLatch(oHasWon, b.or(oHasWon, oHasNowWon), 'o_has_won');

  b.addOutput(b.and(xHasWon, oHasWon), 'both_have_won');

  return b.build(
      'This circuit implements tic-tac-toe on a standard 3x3 field. Each of ' +
      'the nine inputs corresponds to one of the nine squares. X begins and ' +
      'marks a square, then alternates with O until the game is over.\n\n' +
      'Eighteen latches are used to represent the current state of the ' +
      'field. One latch is used to distinguish whose turn it is. The ' +
      'remaining two latches indicate which (if any) player has won.\n\n' +
      'The output bit is set if more than one player has won, which never ' +
      'happens.');
}

export default {
  'tic-tac-toe-3x3-at-most-one-winner': [true, buildTicTacToe]
};
