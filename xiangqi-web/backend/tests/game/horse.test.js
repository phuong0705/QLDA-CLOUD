/**
 * ============================================================================
 * Unit Test cho Horse.js (Quân Mã Cờ Tướng)
 * File: backend/tests/game/horse.test.js
 * ============================================================================
 * 
 * Tiêu chí nghiệm thu (Definition of Done của task):
 * 1. Open path: Mã ở vị trí mở kiểm tra đúng 8 khả năng nhảy chữ L.
 * 2. Mã bị cản chân đúng hướng (DoD):
 *    - Cản chân trên (drow = -1) làm mất đúng 2 nước đi lên.
 *    - Cản chân dưới (drow = +1) làm mất đúng 2 nước đi xuống.
 *    - Cản chân trái (dcol = -1) làm mất đúng 2 nước đi trái.
 *    - Cản chân phải (dcol = +1) làm mất đúng 2 nước đi phải.
 *    - Cản cả 4 chân thì có 0 nước đi.
 *    - Bị cản bất kể quân cản là quân mình hay quân địch.
 * 3. Capture enemy piece: Đích đến là quân địch thì canCapture = true.
 * 4. Own piece: Đích đến là quân mình thì bị loại bỏ.
 * 5. Edge board (DoD): Ở góc/biên bàn cờ không bao giờ sinh nước đi ngoài bàn cờ.
 * 6. Immutability: Không tự làm thay đổi Board.
 */

const assert = require('assert');
const Board = require('../../src/game/Board');
const { getPseudoLegalMoves, isWithinBoard } = require('../../src/game/pieces/Horse');
const { COLORS, PIECE_TYPES } = require('../../src/game/constants');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (error) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    -> Lỗi: ${error.message}`);
    throw error;
  }
}

console.log('\n======================================================');
console.log('KIỂM THỬ: HORSE (QUÂN MÃ) - PSEUDO-LEGAL MOVES');
console.log('======================================================\n');

// ----------------------------------------------------------------------------
// 1. OPEN PATH (Đường đi thông thoáng - đủ 8 hướng)
// ----------------------------------------------------------------------------
console.log('--- 1. Kiểm thử Open Path (8 hướng chữ L) ---');

runTest('1.1. Mã ở giữa bàn cờ trống (4, 4) có đúng 8 nước đi', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_horse_4_4', type: PIECE_TYPES.HORSE, color: COLORS.RED });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });

  assert.strictEqual(moves.length, 8, `Mã tại (4,4) trên bàn cờ trống phải có đúng 8 nước đi, thực tế: ${moves.length}`);

  // 8 tọa độ đích kỳ vọng
  const expectedDestinations = [
    { row: 2, col: 3 }, // Lên 2, trái 1
    { row: 2, col: 5 }, // Lên 2, phải 1
    { row: 6, col: 3 }, // Xuống 2, trái 1
    { row: 6, col: 5 }, // Xuống 2, phải 1
    { row: 3, col: 2 }, // Trái 2, lên 1
    { row: 5, col: 2 }, // Trái 2, xuống 1
    { row: 3, col: 6 }, // Phải 2, lên 1
    { row: 5, col: 6 }  // Phải 2, xuống 1
  ];

  for (const exp of expectedDestinations) {
    const found = moves.find(m => m.row === exp.row && m.col === exp.col);
    assert.ok(found, `Phải tìm thấy nước đi đến (${exp.row}, ${exp.col})`);
    assert.strictEqual(found.canCapture, false);
    assert.strictEqual(found.capturedPieceId, null);
    assert.ok(isWithinBoard(found.row, found.col));
  }
});

// ----------------------------------------------------------------------------
// 2. MÃ BỊ CẢN CHÂN ĐÚNG HƯỚNG (DoD)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Tiêu chí DoD: Mã bị cản chân đúng hướng ---');

runTest('2.1. Cản chân trên (row - 1): mất đúng 2 nước đi lên (2, 3) và (2, 5)', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_horse', type: PIECE_TYPES.HORSE, color: COLORS.RED });
  // Đặt vật cản tại ô chân trên: (3, 4)
  board.setPiece(3, 4, { id: 'blocker_up', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });

  assert.strictEqual(moves.length, 6, 'Bị cản chân trên phải còn đúng 6 nước đi');
  assert.ok(!moves.some(m => m.row === 2 && m.col === 3), 'Bị cản không thể đến (2, 3)');
  assert.ok(!moves.some(m => m.row === 2 && m.col === 5), 'Bị cản không thể đến (2, 5)');

  // 6 hướng còn lại vẫn đi được
  assert.ok(moves.some(m => m.row === 6 && m.col === 3));
  assert.ok(moves.some(m => m.row === 6 && m.col === 5));
  assert.ok(moves.some(m => m.row === 3 && m.col === 2));
  assert.ok(moves.some(m => m.row === 5 && m.col === 2));
  assert.ok(moves.some(m => m.row === 3 && m.col === 6));
  assert.ok(moves.some(m => m.row === 5 && m.col === 6));
});

runTest('2.2. Cản chân dưới (row + 1): mất đúng 2 nước đi xuống (6, 3) và (6, 5)', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_horse', type: PIECE_TYPES.HORSE, color: COLORS.RED });
  // Đặt vật cản tại ô chân dưới: (5, 4) bằng quân ĐEN (quân địch)
  board.setPiece(5, 4, { id: 'blocker_enemy_down', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });

  assert.strictEqual(moves.length, 6, 'Quân địch ở ô chân vẫn cản được mã, còn 6 nước');
  assert.ok(!moves.some(m => m.row === 6 && m.col === 3), 'Bị cản không thể đến (6, 3)');
  assert.ok(!moves.some(m => m.row === 6 && m.col === 5), 'Bị cản không thể đến (6, 5)');
});

runTest('2.3. Cản chân trái (col - 1): mất đúng 2 nước sang trái (3, 2) và (5, 2)', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_horse', type: PIECE_TYPES.HORSE, color: COLORS.RED });
  board.setPiece(4, 3, { id: 'blocker_left', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });

  assert.strictEqual(moves.length, 6);
  assert.ok(!moves.some(m => m.row === 3 && m.col === 2), 'Bị cản không thể đến (3, 2)');
  assert.ok(!moves.some(m => m.row === 5 && m.col === 2), 'Bị cản không thể đến (5, 2)');
});

runTest('2.4. Cản chân phải (col + 1): mất đúng 2 nước sang phải (3, 6) và (5, 6)', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_horse', type: PIECE_TYPES.HORSE, color: COLORS.RED });
  board.setPiece(4, 5, { id: 'blocker_right', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });

  assert.strictEqual(moves.length, 6);
  assert.ok(!moves.some(m => m.row === 3 && m.col === 6), 'Bị cản không thể đến (3, 6)');
  assert.ok(!moves.some(m => m.row === 5 && m.col === 6), 'Bị cản không thể đến (5, 6)');
});

runTest('2.5. Bị cản cả 4 chân: có đúng 0 nước đi', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_horse', type: PIECE_TYPES.HORSE, color: COLORS.RED });
  board.setPiece(3, 4, { id: 'b_up', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  board.setPiece(5, 4, { id: 'b_down', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK });
  board.setPiece(4, 3, { id: 'b_left', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  board.setPiece(4, 5, { id: 'b_right', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });
  assert.strictEqual(moves.length, 0, 'Mã bị cản cả 4 hướng chân phải có 0 nước đi');
});

// ----------------------------------------------------------------------------
// 3. CAPTURE ENEMY PIECE & 4. OWN PIECE
// ----------------------------------------------------------------------------
console.log('\n--- 3. Kiểm thử Capture & 4. Own Piece ---');

runTest('3.1. Ô đích là quân địch thì ăn được (canCapture=true); ô đích là quân mình thì bị loại', () => {
  const board = new Board(false);
  // Mã Đỏ tại (4, 4)
  board.setPiece(4, 4, { id: 'r_horse', type: PIECE_TYPES.HORSE, color: COLORS.RED });

  // Quân ĐEN (quân địch) tại ô đích (2, 3) (chân trên 3, 4 đang trống)
  board.setPiece(2, 3, { id: 'b_cannon_target', type: PIECE_TYPES.CANNON, color: COLORS.BLACK });

  // Quân ĐỎ (quân mình) tại ô đích (2, 5) (chân trên 3, 4 đang trống)
  board.setPiece(2, 5, { id: 'r_soldier_friend', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });

  // Nước đi đến ô quân địch (2, 3) phải có canCapture = true
  const captureMove = moves.find(m => m.row === 2 && m.col === 3);
  assert.ok(captureMove, 'Phải có nước đi đến ô quân địch (2, 3)');
  assert.strictEqual(captureMove.canCapture, true);
  assert.strictEqual(captureMove.capturedPieceId, 'b_cannon_target');

  // Nước đi đến ô quân mình (2, 5) phải BỊ LOẠI BỎ
  const friendlyMove = moves.find(m => m.row === 2 && m.col === 5);
  assert.strictEqual(friendlyMove, undefined, 'Không được đi vào ô chứa quân cùng màu (2, 5)');
});

// ----------------------------------------------------------------------------
// 5. EDGE BOARD (Tọa độ biên và góc bàn cờ - DoD)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Tiêu chí DoD: Edge Board & Không ra ngoài biên ---');

runTest('5.1. Mã ở góc (0, 0): chỉ có tối đa 2 nước đi trong bàn cờ', () => {
  const board = new Board(false);
  board.setPiece(0, 0, { id: 'r_corner_horse', type: PIECE_TYPES.HORSE, color: COLORS.RED });

  const moves = getPseudoLegalMoves(board, { row: 0, col: 0 });

  // Tại (0, 0):
  // - Xuống 2, phải 1: đích (2, 1), chân (1, 0) -> Hợp lệ
  // - Phải 2, xuống 1: đích (1, 2), chân (0, 1) -> Hợp lệ
  // Tất cả 6 khả năng còn lại đều có ô đích hoặc chân nằm ngoài biên (< 0)
  assert.strictEqual(moves.length, 2, 'Mã ở góc (0,0) chỉ có 2 nước đi');
  assert.ok(moves.some(m => m.row === 2 && m.col === 1));
  assert.ok(moves.some(m => m.row === 1 && m.col === 2));

  for (const m of moves) {
    assert.ok(m.row >= 0 && m.row <= 9 && m.col >= 0 && m.col <= 8, 'Tọa độ phải trong bàn cờ');
  }

  // Nếu cản chân (1, 0) thì chỉ còn đúng 1 nước (1, 2)
  board.setPiece(1, 0, { id: 'corner_blocker', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  const movesAfterBlock = getPseudoLegalMoves(board, { row: 0, col: 0 });
  assert.strictEqual(movesAfterBlock.length, 1);
  assert.strictEqual(movesAfterBlock[0].row, 1);
  assert.strictEqual(movesAfterBlock[0].col, 2);
});

runTest('5.2. Mã ở góc (9, 8): chỉ có tối đa 2 nước đi trong bàn cờ', () => {
  const board = new Board(false);
  board.setPiece(9, 8, { id: 'b_corner_horse', type: PIECE_TYPES.HORSE, color: COLORS.BLACK });

  const moves = getPseudoLegalMoves(board, { row: 9, col: 8 });

  // Tại (9, 8):
  // - Lên 2, trái 1: đích (7, 7), chân (8, 8)
  // - Trái 2, lên 1: đích (8, 6), chân (9, 7)
  assert.strictEqual(moves.length, 2);
  assert.ok(moves.some(m => m.row === 7 && m.col === 7));
  assert.ok(moves.some(m => m.row === 8 && m.col === 6));
  for (const m of moves) {
    assert.ok(m.row >= 0 && m.row <= 9 && m.col >= 0 && m.col <= 8);
  }
});

// ----------------------------------------------------------------------------
// 6. IMMUTABILITY (Không làm thay đổi Board)
// ----------------------------------------------------------------------------
console.log('\n--- 6. Kiểm thử Tính Bất Biến (Immutability) ---');

runTest('6.1. getPseudoLegalMoves không tự ý thay đổi Board hay di chuyển quân Mã', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_horse', type: PIECE_TYPES.HORSE, color: COLORS.RED });
  board.setPiece(2, 3, { id: 'b_target', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK });

  const initialCount = board.getPieces().length;
  getPseudoLegalMoves(board, { row: 4, col: 4 });

  assert.strictEqual(board.getPieces().length, initialCount);
  assert.ok(board.getPiece(4, 4), 'Mã vẫn ở (4, 4)');
  assert.ok(board.getPiece(2, 3), 'Quân địch vẫn ở (2, 3)');
});

// ============================================================================
// TỔNG KẾT
// ============================================================================
console.log('\n======================================================');
console.log(`KẾT QUẢ HORSE TESTS: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} TESTS!`);
console.log('======================================================\n');

