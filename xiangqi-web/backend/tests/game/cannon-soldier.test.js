/**
 * ============================================================================
 * Unit Test cho Cannon.js & Soldier.js (Pháo và Tốt Cờ Tướng)
 * File: backend/tests/game/cannon-soldier.test.js
 * ============================================================================
 * 
 * Tiêu chí nghiệm thu (Definition of Done của task):
 * 1. Pháo không ăn khi không có ngòi (0 screen).
 * 2. Pháo ăn quân khi có đúng 1 ngòi (1 screen) và sau ngòi ô trống không được đi.
 * 3. Pháo không ăn khi có hơn một quân chắn (>= 2 screens).
 * 4. Tốt RED tiến giảm row, BLACK tiến tăng row.
 * 5. Tốt trước khi qua sông chỉ đi 1 bước tiến.
 * 6. Tốt sau khi qua sông được đi tiến / trái / phải.
 * 7. Tốt không bao giờ đi lùi (DoD).
 */

const assert = require('assert');
const Board = require('../../src/game/Board');
const getCannonMoves = require('../../src/game/pieces/Cannon');
const getSoldierMoves = require('../../src/game/pieces/Soldier');
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
console.log('KIỂM THỬ: CANNON & SOLDIER (QUÂN PHÁO & QUÂN TỐT)');
console.log('======================================================\n');

// ============================================================================
// 1. KIỂM THỬ QUÂN PHÁO (CANNON)
// ============================================================================
console.log('--- 1. Kiểm thử Quân Pháo (Cannon) ---');

runTest('1.1. Tiêu chí DoD: Pháo không ăn khi không có ngòi (0 screen) và đi như Xe trên ô trống', () => {
  const board = new Board(false);
  // Pháo Đỏ tại (4, 4)
  board.setPiece(4, 4, { id: 'r_cannon', type: PIECE_TYPES.CANNON, color: COLORS.RED });
  // Quân Đen đối phương tại (4, 2) (không có quân nào ở giữa làm ngòi)
  board.setPiece(4, 2, { id: 'b_target_direct', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });

  const moves = getCannonMoves(board, { row: 4, col: 4 });

  // Hướng TRÁI: Ô (4, 3) trống -> Pháo đi được bình thường
  const emptyMove = moves.find(m => m.row === 4 && m.col === 3);
  assert.ok(emptyMove, 'Pháo đi được vào ô trống (4, 3)');
  assert.strictEqual(emptyMove.canCapture, false);

  // Không có ngòi nên Pháo TUYỆT ĐỐI KHÔNG ĐƯỢC ăn quân tại (4, 2)
  const captureAttempt = moves.find(m => m.row === 4 && m.col === 2);
  assert.strictEqual(captureAttempt, undefined, 'Pháo KHÔNG được ăn quân trực tiếp khi không có ngòi');

  // Pháo dừng lại trước quân cản, không đi tiếp đến (4, 1) hay (4, 0)
  assert.ok(!moves.some(m => m.row === 4 && m.col === 1));
  assert.ok(!moves.some(m => m.row === 4 && m.col === 0));
});

runTest('1.2. Pháo có đúng 1 ngòi (1 screen): Ăn được quân đối phương đầu tiên sau ngòi', () => {
  const board = new Board(false);
  // Pháo Đỏ tại (4, 4)
  board.setPiece(4, 4, { id: 'r_cannon', type: PIECE_TYPES.CANNON, color: COLORS.RED });
  // Quân làm ngòi tại (4, 2) (bất kể màu gì, ở đây dùng quân Đỏ đồng minh)
  board.setPiece(4, 2, { id: 'screen_piece', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  // Quân mục tiêu đối phương tại (4, 0) (có 1 ô trống (4, 1) ở giữa ngòi và mục tiêu)
  board.setPiece(4, 0, { id: 'b_chariot_target', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });

  const moves = getCannonMoves(board, { row: 4, col: 4 });

  // 1. Ô trống trước ngòi (4, 3): Đi được (non-capture)
  assert.ok(moves.some(m => m.row === 4 && m.col === 3 && m.canCapture === false));

  // 2. Ô ngòi (4, 2): Không đi được
  assert.ok(!moves.some(m => m.row === 4 && m.col === 2));

  // 3. Ô trống sau ngòi (4, 1): KHÔNG ĐƯỢC ĐÁP XUỐNG
  assert.ok(!moves.some(m => m.row === 4 && m.col === 1), 'Pháo không được nhảy qua ngòi vào ô trống');

  // 4. Quân địch đầu tiên sau ngòi (4, 0): ĂN ĐƯỢC (canCapture = true)
  const cap = moves.find(m => m.row === 4 && m.col === 0);
  assert.ok(cap, 'Pháo phải ăn được quân địch sau đúng 1 ngòi');
  assert.strictEqual(cap.canCapture, true);
  assert.strictEqual(cap.capturedPieceId, 'b_chariot_target');
});

runTest('1.3. Quân làm ngòi là quân địch thì Pháo vẫn nhảy qua để ăn quân phía sau được', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_cannon', type: PIECE_TYPES.CANNON, color: COLORS.RED });
  // Ngòi là quân ĐEN (đối phương) tại (2, 4)
  board.setPiece(2, 4, { id: 'b_enemy_screen', type: PIECE_TYPES.HORSE, color: COLORS.BLACK });
  // Mục tiêu phía sau ngòi tại (0, 4)
  board.setPiece(0, 4, { id: 'b_general_target', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });

  const moves = getCannonMoves(board, { row: 4, col: 4 });

  const cap = moves.find(m => m.row === 0 && m.col === 4);
  assert.ok(cap, 'Ngòi là quân địch vẫn có thể dùng để ăn quân phía sau');
  assert.strictEqual(cap.canCapture, true);
  assert.strictEqual(cap.capturedPieceId, 'b_general_target');
});

runTest('1.4. Sau ngòi là quân cùng màu thì Pháo không được ăn quân mình', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_cannon', type: PIECE_TYPES.CANNON, color: COLORS.RED });
  board.setPiece(4, 2, { id: 'screen', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK });
  // Sau ngòi là quân ĐỎ (quân mình)
  board.setPiece(4, 0, { id: 'r_friend', type: PIECE_TYPES.HORSE, color: COLORS.RED });

  const moves = getCannonMoves(board, { row: 4, col: 4 });
  assert.ok(!moves.some(m => m.row === 4 && m.col === 0), 'Pháo không được ăn quân cùng màu sau ngòi');
});

runTest('1.5. Tiêu chí DoD: Pháo không ăn khi có hơn một quân chắn (>= 2 screens)', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_cannon', type: PIECE_TYPES.CANNON, color: COLORS.RED });
  // Quân chắn thứ 1 tại (4, 3) (quân cùng màu)
  board.setPiece(4, 3, { id: 'screen_1', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  // Quân chắn thứ 2 tại (4, 2) (quân cùng màu)
  board.setPiece(4, 2, { id: 'screen_2', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  // Quân địch thứ 3 tại (4, 1) (sau 2 quân chắn)
  board.setPiece(4, 1, { id: 'target_behind_two_screens', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });

  const moves = getCannonMoves(board, { row: 4, col: 4 });

  // Hướng TRÁI: Pháo có đúng 0 nước đi
  // - Không đi vào ô quân chắn 1 (4, 3)
  // - Không đi vào ô quân chắn 2 (4, 2)
  // - KHÔNG ĐƯỢC ăn quân địch (4, 1) vì có 2 quân chắn ở giữa
  assert.ok(!moves.some(m => m.row === 4 && m.col === 3));
  assert.ok(!moves.some(m => m.row === 4 && m.col === 2));
  assert.ok(!moves.some(m => m.row === 4 && m.col === 1), 'Pháo KHÔNG được ăn quân khi có 2 quân chắn');
  assert.ok(!moves.some(m => m.row === 4 && m.col === 0));
});

// ============================================================================
// 2. KIỂM THỬ QUÂN TỐT (SOLDIER)
// ============================================================================
console.log('\n--- 2. Kiểm thử Quân Tốt (Soldier) ---');

runTest('2.1. Tốt RED trước khi qua sông (row 6..5) chỉ tiến 1 bước giảm row, KHÔNG đi ngang', () => {
  const board = new Board(false);
  // Tốt Đỏ tại vị trí xuất phát (6, 4)
  board.setPiece(6, 4, { id: 'r_soldier_base', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });

  const moves = getSoldierMoves(board, { row: 6, col: 4 });

  // Chưa qua sông: Chỉ có đúng 1 nước TIẾN lên (5, 4) (giảm row)
  assert.strictEqual(moves.length, 1, 'Tốt trước khi qua sông chỉ có đúng 1 nước tiến');
  assert.strictEqual(moves[0].row, 5);
  assert.strictEqual(moves[0].col, 4);
  assert.strictEqual(moves[0].canCapture, false);

  // Không có nước đi ngang sang (6, 3) hay (6, 5)
  assert.ok(!moves.some(m => m.row === 6 && m.col === 3));
  assert.ok(!moves.some(m => m.row === 6 && m.col === 5));
});

runTest('2.2. Tốt BLACK trước khi qua sông (row 3..4) chỉ tiến 1 bước tăng row, KHÔNG đi ngang', () => {
  const board = new Board(false);
  // Tốt Đen tại vị trí xuất phát (3, 4)
  board.setPiece(3, 4, { id: 'b_soldier_base', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK });

  const moves = getSoldierMoves(board, { row: 3, col: 4 });

  // Chưa qua sông: Chỉ có đúng 1 nước TIẾN xuống (4, 4) (tăng row)
  assert.strictEqual(moves.length, 1);
  assert.strictEqual(moves[0].row, 4);
  assert.strictEqual(moves[0].col, 4);
});

runTest('2.3. Tiêu chí DoD: Tốt KHÔNG BAO GIỜ ĐI LÙI', () => {
  const board = new Board(false);

  // 1. Tốt Đỏ chưa qua sông tại (6, 4): Không được lùi xuống (7, 4)
  board.setPiece(6, 4, { id: 'r_s1', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  const redMovesBefore = getSoldierMoves(board, { row: 6, col: 4 });
  assert.ok(!redMovesBefore.some(m => m.row === 7 && m.col === 4), 'Tốt Đỏ không được đi lùi (7, 4)');

  // 2. Tốt Đỏ đã qua sông tại (4, 4): Không được lùi xuống (5, 4)
  board.clear();
  board.setPiece(4, 4, { id: 'r_s2', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  const redMovesAfter = getSoldierMoves(board, { row: 4, col: 4 });
  assert.ok(!redMovesAfter.some(m => m.row === 5 && m.col === 4), 'Tốt Đỏ sau sông không được đi lùi (5, 4)');

  // 3. Tốt Đen đã qua sông tại (5, 4): Không được lùi lên (4, 4)
  board.clear();
  board.setPiece(5, 4, { id: 'b_s2', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK });
  const blackMovesAfter = getSoldierMoves(board, { row: 5, col: 4 });
  assert.ok(!blackMovesAfter.some(m => m.row === 4 && m.col === 4), 'Tốt Đen sau sông không được đi lùi (4, 4)');
});

runTest('2.4. Tốt sau khi qua sông được đi 3 hướng: Tiến, Trái, Phải', () => {
  const board = new Board(false);
  // Tốt Đỏ đã qua sông tại (4, 4) (hàng 4 là đất Đen)
  board.setPiece(4, 4, { id: 'r_soldier_crossed', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });

  const moves = getSoldierMoves(board, { row: 4, col: 4 });

  // 3 nước: Tiến (3, 4), Trái (4, 3), Phải (4, 5)
  assert.strictEqual(moves.length, 3, 'Tốt sau sông ở giữa bàn có đúng 3 nước đi');
  assert.ok(moves.some(m => m.row === 3 && m.col === 4));
  assert.ok(moves.some(m => m.row === 4 && m.col === 3));
  assert.ok(moves.some(m => m.row === 4 && m.col === 5));
});

runTest('2.5. Tốt ở biên và hàng đáy đối phương: Không sinh nước ra ngoài bàn cờ', () => {
  const board = new Board(false);

  // Tốt Đỏ ở biên trái sau sông: (3, 0)
  board.setPiece(3, 0, { id: 'r_edge', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  const movesEdge = getSoldierMoves(board, { row: 3, col: 0 });
  // Chỉ đi tiến (2, 0) và sang phải (3, 1), không sang trái (-1)
  assert.strictEqual(movesEdge.length, 2);
  assert.ok(movesEdge.some(m => m.row === 2 && m.col === 0));
  assert.ok(movesEdge.some(m => m.row === 3 && m.col === 1));

  // Tốt Đỏ ở hàng đáy đối phương: (0, 4)
  board.clear();
  board.setPiece(0, 4, { id: 'r_bottom', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  const movesBottom = getSoldierMoves(board, { row: 0, col: 4 });
  // Không tiến được nữa (-1 ngoài bàn cờ), chỉ đi ngang (0, 3) và (0, 5)
  assert.strictEqual(movesBottom.length, 2);
  assert.ok(movesBottom.some(m => m.row === 0 && m.col === 3));
  assert.ok(movesBottom.some(m => m.row === 0 && m.col === 5));
});

runTest('2.6. Tốt ăn quân địch và không đi vào ô quân mình', () => {
  const board = new Board(false);
  // Tốt Đỏ sau sông tại (3, 4)
  board.setPiece(3, 4, { id: 'r_soldier', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  // Quân Đen đối phương ở phía trước (2, 4)
  board.setPiece(2, 4, { id: 'b_horse_front', type: PIECE_TYPES.HORSE, color: COLORS.BLACK });
  // Quân Đỏ cùng màu ở bên phải (3, 5)
  board.setPiece(3, 5, { id: 'r_chariot_side', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });

  const moves = getSoldierMoves(board, { row: 3, col: 4 });

  // Ăn được quân địch phía trước (2, 4)
  const cap = moves.find(m => m.row === 2 && m.col === 4);
  assert.ok(cap, 'Tốt ăn được quân địch ở ô đích');
  assert.strictEqual(cap.canCapture, true);
  assert.strictEqual(cap.capturedPieceId, 'b_horse_front');

  // Không được đi vào ô quân mình (3, 5)
  assert.ok(!moves.some(m => m.row === 3 && m.col === 5));

  // Ô trái (3, 3) trống -> đi được
  assert.ok(moves.some(m => m.row === 3 && m.col === 3 && m.canCapture === false));
});

// ============================================================================
// TỔNG KẾT
// ============================================================================
console.log('\n======================================================');
console.log(`KẾT QUẢ TESTS: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} TESTS THÀNH CÔNG!`);
console.log('======================================================\n');
