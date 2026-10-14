/**
 * ============================================================================
 * Unit Test cho General, Advisor, Elephant (Tướng, Sĩ, Tượng)
 * File: backend/tests/game/general-advisor-elephant.test.js
 * ============================================================================
 * 
 * Tiêu chí nghiệm thu (Definition of Done của task):
 * 1. Tướng/Sĩ không ra khỏi cung (Palace boundary).
 * 2. Tượng không qua sông (River boundary) và không đi khi bị cản mắt (Eye square block).
 * 3. Kiểm tra ô đích chứa quân cùng màu (Own piece filter) và ăn quân địch (Capture enemy).
 * 4. Helper isInsidePalace và isOwnSideOfRiver tái sử dụng độc lập.
 */

const assert = require('assert');
const Board = require('../../src/game/Board');
const getGeneralMoves = require('../../src/game/pieces/General');
const { isInsidePalace, isOwnSideOfRiver } = require('../../src/game/pieces/General');
const getAdvisorMoves = require('../../src/game/pieces/Advisor');
const getElephantMoves = require('../../src/game/pieces/Elephant');
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

console.log('\n==================================================================');
console.log('KIỂM THỬ: GENERAL, ADVISOR, ELEPHANT (TƯỚNG, SĨ, TƯỢNG)');
console.log('==================================================================\n');

// ----------------------------------------------------------------------------
// 1. KIỂM THỬ CÁC HELPERS TÁI SỬ DỤNG: isInsidePalace & isOwnSideOfRiver
// ----------------------------------------------------------------------------
console.log('--- 1. Kiểm thử Helpers Tái Sử Dụng ---');

runTest('1.1. isInsidePalace kiểm tra chính xác cửu cung Đen (0..2, 3..5) và Đỏ (7..9, 3..5)', () => {
  // Cửu cung ĐEN: hàng 0..2, cột 3..5
  assert.strictEqual(isInsidePalace(COLORS.BLACK, 0, 3), true);
  assert.strictEqual(isInsidePalace(COLORS.BLACK, 1, 4), true);
  assert.strictEqual(isInsidePalace(COLORS.BLACK, 2, 5), true);
  // Ngoài cung ĐEN
  assert.strictEqual(isInsidePalace(COLORS.BLACK, 3, 4), false, 'Hàng 3 ngoài cung Đen');
  assert.strictEqual(isInsidePalace(COLORS.BLACK, 1, 2), false, 'Cột 2 ngoài cung Đen');
  assert.strictEqual(isInsidePalace(COLORS.BLACK, 1, 6), false, 'Cột 6 ngoài cung Đen');
  assert.strictEqual(isInsidePalace(COLORS.BLACK, 7, 4), false, 'Cung Đỏ không phải cung Đen');

  // Cửu cung ĐỎ: hàng 7..9, cột 3..5
  assert.strictEqual(isInsidePalace(COLORS.RED, 7, 3), true);
  assert.strictEqual(isInsidePalace(COLORS.RED, 8, 4), true);
  assert.strictEqual(isInsidePalace(COLORS.RED, 9, 5), true);
  // Ngoài cung ĐỎ
  assert.strictEqual(isInsidePalace(COLORS.RED, 6, 4), false, 'Hàng 6 ngoài cung Đỏ');
  assert.strictEqual(isInsidePalace(COLORS.RED, 8, 2), false, 'Cột 2 ngoài cung Đỏ');
  assert.strictEqual(isInsidePalace(COLORS.RED, 8, 6), false, 'Cột 6 ngoài cung Đỏ');
  assert.strictEqual(isInsidePalace(COLORS.RED, 1, 4), false, 'Cung Đen không phải cung Đỏ');

  // Biên âm hoặc không hợp lệ
  assert.strictEqual(isInsidePalace(COLORS.RED, -1, 4), false);
  assert.strictEqual(isInsidePalace(COLORS.RED, 8, 10), false);
});

runTest('1.2. isOwnSideOfRiver kiểm tra chính xác nửa bàn cề sân nhà Đen (0..4) và Đỏ (5..9)', () => {
  // ĐEN: hàng 0..4
  assert.strictEqual(isOwnSideOfRiver(COLORS.BLACK, 0), true);
  assert.strictEqual(isOwnSideOfRiver(COLORS.BLACK, 4), true);
  assert.strictEqual(isOwnSideOfRiver(COLORS.BLACK, 5), false, 'Hàng 5 đã qua sông');
  assert.strictEqual(isOwnSideOfRiver(COLORS.BLACK, 9), false);

  // ĐỎ: hàng 5..9
  assert.strictEqual(isOwnSideOfRiver(COLORS.RED, 9), true);
  assert.strictEqual(isOwnSideOfRiver(COLORS.RED, 5), true);
  assert.strictEqual(isOwnSideOfRiver(COLORS.RED, 4), false, 'Hàng 4 đã qua sông');
  assert.strictEqual(isOwnSideOfRiver(COLORS.RED, 0), false);
});

// ----------------------------------------------------------------------------
// 2. KIỂM THỬ QUÂN TƯỚNG (GENERAL)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Kiểm thử Quân Tướng (General) ---');

runTest('2.1. Tướng ở giữa cung (1, 4) đi được 4 hướng ngang/dọc trong cung', () => {
  const board = new Board(false);
  board.setPiece(1, 4, { id: 'b_general', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });

  const moves = getGeneralMoves(board, { row: 1, col: 4 });

  // 4 ô: (0, 4), (2, 4), (1, 3), (1, 5)
  assert.strictEqual(moves.length, 4);
  assert.ok(moves.some(m => m.row === 0 && m.col === 4));
  assert.ok(moves.some(m => m.row === 2 && m.col === 4));
  assert.ok(moves.some(m => m.row === 1 && m.col === 3));
  assert.ok(moves.some(m => m.row === 1 && m.col === 5));
});

runTest('2.2. Tiêu chí DoD: Tướng ở biên cung KHÔNG được ra khỏi cung', () => {
  const board = new Board(false);
  // Tướng Đen ở góc cung (0, 3)
  board.setPiece(0, 3, { id: 'b_general_corner', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });

  const moves = getGeneralMoves(board, { row: 0, col: 3 });

  // Tại (0, 3): chỉ đi được (1, 3) (xuống) và (0, 4) (phải)
  // Lên (-1, 3) ngoài bàn cờ, Trái (0, 2) ra ngoài cung -> Đều bị chặn
  assert.strictEqual(moves.length, 2);
  assert.ok(moves.some(m => m.row === 1 && m.col === 3));
  assert.ok(moves.some(m => m.row === 0 && m.col === 4));
  assert.ok(!moves.some(m => m.row === 0 && m.col === 2), 'Tướng không được đi ra ngoài cung (0, 2)');

  // Tướng Đỏ tại (9, 4) (vị trí ban đầu)
  board.clear();
  board.setPiece(9, 4, { id: 'r_general_base', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  const redMoves = getGeneralMoves(board, { row: 9, col: 4 });

  // Tại (9, 4): chỉ đi được (8, 4), (9, 3), (9, 5). Hướng xuống (10, 4) ngoài bàn cờ.
  assert.strictEqual(redMoves.length, 3);
  assert.ok(redMoves.some(m => m.row === 8 && m.col === 4));
  assert.ok(redMoves.some(m => m.row === 9 && m.col === 3));
  assert.ok(redMoves.some(m => m.row === 9 && m.col === 5));
});

runTest('2.3. Tướng bị chặn bởi quân mình và ăn được quân địch trong cung', () => {
  const board = new Board(false);
  // Tướng Đỏ tại (8, 4)
  board.setPiece(8, 4, { id: 'r_general', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  // Quân Đỏ (quân mình) tại (7, 4)
  board.setPiece(7, 4, { id: 'r_advisor', type: PIECE_TYPES.ADVISOR, color: COLORS.RED });
  // Quân Đen (quân địch) tại (8, 5)
  board.setPiece(8, 5, { id: 'b_chariot_invader', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });

  const moves = getGeneralMoves(board, { row: 8, col: 4 });

  // (7, 4) là quân mình -> không được đi vào
  assert.ok(!moves.some(m => m.row === 7 && m.col === 4));

  // (8, 5) là quân địch -> ăn được (canCapture = true)
  const capMove = moves.find(m => m.row === 8 && m.col === 5);
  assert.ok(capMove, 'Tướng ăn được quân địch tại (8, 5)');
  assert.strictEqual(capMove.canCapture, true);
  assert.strictEqual(capMove.capturedPieceId, 'b_chariot_invader');
});

// ----------------------------------------------------------------------------
// 3. KIỂM THỬ QUÂN SĨ (ADVISOR)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Kiểm thử Quân Sĩ (Advisor) ---');

runTest('3.1. Sĩ ở tâm cung (8, 4) đi được đúng 4 góc chéo trong cung', () => {
  const board = new Board(false);
  board.setPiece(8, 4, { id: 'r_advisor_center', type: PIECE_TYPES.ADVISOR, color: COLORS.RED });

  const moves = getAdvisorMoves(board, { row: 8, col: 4 });

  // 4 góc cung Đỏ: (7, 3), (7, 5), (9, 3), (9, 5)
  assert.strictEqual(moves.length, 4);
  assert.ok(moves.some(m => m.row === 7 && m.col === 3));
  assert.ok(moves.some(m => m.row === 7 && m.col === 5));
  assert.ok(moves.some(m => m.row === 9 && m.col === 3));
  assert.ok(moves.some(m => m.row === 9 && m.col === 5));
});

runTest('3.2. Tiêu chí DoD: Sĩ ở góc cung chỉ có 1 nước đi về tâm, KHÔNG ra khỏi cung', () => {
  const board = new Board(false);
  // Sĩ Đỏ ở góc cung (9, 3)
  board.setPiece(9, 3, { id: 'r_advisor_corner', type: PIECE_TYPES.ADVISOR, color: COLORS.RED });

  const moves = getAdvisorMoves(board, { row: 9, col: 3 });

  // Chỉ có đúng 1 nước đi về tâm cung (8, 4)
  assert.strictEqual(moves.length, 1);
  assert.strictEqual(moves[0].row, 8);
  assert.strictEqual(moves[0].col, 4);

  // Sĩ Đen ở góc cung (0, 5) chỉ đi được về tâm (1, 4)
  board.clear();
  board.setPiece(0, 5, { id: 'b_advisor_corner', type: PIECE_TYPES.ADVISOR, color: COLORS.BLACK });
  const blackMoves = getAdvisorMoves(board, { row: 0, col: 5 });
  assert.strictEqual(blackMoves.length, 1);
  assert.strictEqual(blackMoves[0].row, 1);
  assert.strictEqual(blackMoves[0].col, 4);
});

runTest('3.3. Sĩ không đi vào ô quân mình và ăn được quân địch', () => {
  const board = new Board(false);
  board.setPiece(8, 4, { id: 'r_advisor', type: PIECE_TYPES.ADVISOR, color: COLORS.RED });
  // Quân mình tại (7, 3)
  board.setPiece(7, 3, { id: 'r_general', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  // Quân địch tại (7, 5)
  board.setPiece(7, 5, { id: 'b_horse', type: PIECE_TYPES.HORSE, color: COLORS.BLACK });

  const moves = getAdvisorMoves(board, { row: 8, col: 4 });

  assert.ok(!moves.some(m => m.row === 7 && m.col === 3), 'Không đi vào ô quân mình');
  const cap = moves.find(m => m.row === 7 && m.col === 5);
  assert.ok(cap, 'Ăn được quân địch tại (7, 5)');
  assert.strictEqual(cap.canCapture, true);
  assert.strictEqual(cap.capturedPieceId, 'b_horse');
});

// ----------------------------------------------------------------------------
// 4. KIỂM THỬ QUÂN TƯỢNG (ELEPHANT)
// ----------------------------------------------------------------------------
console.log('\n--- 4. Kiểm thử Quân Tượng (Elephant) ---');

runTest('4.1. Tượng ở vị trí mở (9, 2) đi được đúng 2 nước chéo 2 ô trên sân nhà', () => {
  const board = new Board(false);
  board.setPiece(9, 2, { id: 'r_elephant_base', type: PIECE_TYPES.ELEPHANT, color: COLORS.RED });

  const moves = getElephantMoves(board, { row: 9, col: 2 });

  // Từ (9, 2) chỉ đi được chéo lên:
  // - Lên-Trái: (7, 0) mắt (8, 1)
  // - Lên-Phải: (7, 4) mắt (8, 3)
  // 2 hướng xuống ra ngoài bàn cờ
  assert.strictEqual(moves.length, 2);
  assert.ok(moves.some(m => m.row === 7 && m.col === 0));
  assert.ok(moves.some(m => m.row === 7 && m.col === 4));
});

runTest('4.2. Tiêu chí DoD: Tượng KHÔNG ĐƯỢC QUA SÔNG (River boundary)', () => {
  const board = new Board(false);
  // Tượng Đỏ đứng sát bờ sông tại (5, 2)
  board.setPiece(5, 2, { id: 'r_elephant_river', type: PIECE_TYPES.ELEPHANT, color: COLORS.RED });

  const moves = getElephantMoves(board, { row: 5, col: 2 });

  // Tại (5, 2):
  // - Chéo lên qua sông: đích (3, 0) và (3, 4) -> BỊ CẤM VÌ QUA SÔNG
  // - Chéo lùi về sân nhà: đích (7, 0) và (7, 4) -> HỢP LỆ
  assert.strictEqual(moves.length, 2, 'Tượng tại bờ sông chỉ có 2 nước lùi về sân nhà');
  assert.ok(moves.some(m => m.row === 7 && m.col === 0));
  assert.ok(moves.some(m => m.row === 7 && m.col === 4));
  assert.ok(!moves.some(m => m.row === 3 && m.col === 0), 'Tượng Đỏ KHÔNG được qua sông đến (3, 0)');
  assert.ok(!moves.some(m => m.row === 3 && m.col === 4), 'Tượng Đỏ KHÔNG được qua sông đến (3, 4)');

  // Tương tự kiểm tra Tượng Đen tại bờ sông (4, 2)
  board.clear();
  board.setPiece(4, 2, { id: 'b_elephant_river', type: PIECE_TYPES.ELEPHANT, color: COLORS.BLACK });
  const blackMoves = getElephantMoves(board, { row: 4, col: 2 });

  // Tượng Đen chỉ được lùi về (2, 0) và (2, 4), KHÔNG được qua sông xuống (6, 0) và (6, 4)
  assert.strictEqual(blackMoves.length, 2);
  assert.ok(blackMoves.some(m => m.row === 2 && m.col === 0));
  assert.ok(blackMoves.some(m => m.row === 2 && m.col === 4));
  assert.ok(!blackMoves.some(m => m.row === 6 && m.col === 0), 'Tượng Đen KHÔNG được qua sông đến (6, 0)');
  assert.ok(!blackMoves.some(m => m.row === 6 && m.col === 4), 'Tượng Đen KHÔNG được qua sông đến (6, 4)');
});

runTest('4.3. Tiêu chí DoD: Tượng KHÔNG ĐI ĐƯỢC khi bị cản mắt tượng (Eye block)', () => {
  const board = new Board(false);
  // Tượng Đỏ tại (9, 2)
  board.setPiece(9, 2, { id: 'r_elephant', type: PIECE_TYPES.ELEPHANT, color: COLORS.RED });

  // Đặt quân cản tại mắt tượng bên phải: (8, 3) (mắt giữa (9, 2) và (7, 4))
  board.setPiece(8, 3, { id: 'eye_blocker', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });

  const moves = getElephantMoves(board, { row: 9, col: 2 });

  // Bị cản mắt tại (8, 3) nên KHÔNG thể đi đến (7, 4)
  assert.strictEqual(moves.length, 1, 'Bị cản 1 mắt chỉ còn 1 nước đi');
  assert.strictEqual(moves[0].row, 7);
  assert.strictEqual(moves[0].col, 0);

  // Đặt tiếp quân cản tại mắt tượng bên trái: (8, 1) bằng quân ĐEN (quân địch)
  board.setPiece(8, 1, { id: 'enemy_eye_blocker', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK });
  const movesBothBlocked = getElephantMoves(board, { row: 9, col: 2 });

  // Cả 2 mắt đều bị cản -> có đúng 0 nước đi
  assert.strictEqual(movesBothBlocked.length, 0, 'Bị cản cả 2 mắt tượng thì có 0 nước đi');
});

runTest('4.4. Tượng ăn quân địch tại ô đích và không đi vào ô quân mình', () => {
  const board = new Board(false);
  board.setPiece(9, 2, { id: 'r_elephant', type: PIECE_TYPES.ELEPHANT, color: COLORS.RED });

  // Ô đích (7, 0) là quân Đen (quân địch) - mắt (8, 1) trống
  board.setPiece(7, 0, { id: 'b_cannon_target', type: PIECE_TYPES.CANNON, color: COLORS.BLACK });

  // Ô đích (7, 4) là quân Đỏ (quân mình) - mắt (8, 3) trống
  board.setPiece(7, 4, { id: 'r_soldier_friend', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });

  const moves = getElephantMoves(board, { row: 9, col: 2 });

  // (7, 4) có quân mình -> không được đi vào
  assert.ok(!moves.some(m => m.row === 7 && m.col === 4));

  // (7, 0) là quân địch -> ăn được (canCapture = true)
  const cap = moves.find(m => m.row === 7 && m.col === 0);
  assert.ok(cap, 'Tượng ăn được quân địch tại (7, 0)');
  assert.strictEqual(cap.canCapture, true);
  assert.strictEqual(cap.capturedPieceId, 'b_cannon_target');
});

// ============================================================================
// TỔNG KẾT
// ============================================================================
console.log('\n==================================================================');
console.log(`KẾT QUẢ TESTS: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} TESTS THÀNH CÔNG!`);
console.log('==================================================================\n');

