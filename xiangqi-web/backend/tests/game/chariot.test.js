/**
 * ============================================================================
 * Unit Test cho Chariot.js (Quân Xe Cờ Tướng)
 * File: backend/tests/game/chariot.test.js
 * ============================================================================
 * 
 * Tiêu chí nghiệm thu (Definition of Done của task):
 * 1. Open path: Xe quét 4 hướng thông suốt đến biên bàn cờ.
 * 2. Blocked by own piece: Bị chặn bởi quân cùng màu và không đi xuyên qua.
 * 3. Capture enemy piece: Được ăn quân đối phương đầu tiên rồi dừng lại.
 * 4. Không cho Xe nhảy qua quân (DoD): Dừng ngay tại quân cản, không nhảy qua quân thứ hai.
 * 5. Edge board: Kiểm tra biên và góc bàn cờ, không sinh nước ra ngoài bàn cờ.
 * 6. Immutability: Không tự làm thay đổi Board.
 */

const assert = require('assert');
const Board = require('../../src/game/Board');
const { getPseudoLegalMoves, isWithinBoard } = require('../../src/game/pieces/Chariot');
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
console.log('KIỂM THỬ: CHARIOT (QUÂN XE) - PSEUDO-LEGAL MOVES');
console.log('======================================================\n');

// ----------------------------------------------------------------------------
// 1. OPEN PATH (Đường đi thông thoáng hoàn toàn)
// ----------------------------------------------------------------------------
console.log('--- 1. Kiểm thử Open Path ---');

runTest('1.1. Xe ở giữa bàn cờ trống (4, 4) có đúng 17 nước đi thông suốt', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_chariot_4_4', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });

  // Lên 4 ô: (3,4), (2,4), (1,4), (0,4)
  // Xuống 5 ô: (5,4), (6,4), (7,4), (8,4), (9,4)
  // Trái 4 ô: (4,3), (4,2), (4,1), (4,0)
  // Phải 4 ô: (4,5), (4,6), (4,7), (4,8)
  // Tổng = 4 + 5 + 4 + 4 = 17 nước
  assert.strictEqual(moves.length, 17, `Xe tại (4,4) trên bàn cờ trống phải có 17 nước đi, thực tế: ${moves.length}`);

  // Tất cả các ô này đều không ăn quân
  for (const m of moves) {
    assert.strictEqual(m.canCapture, false);
    assert.strictEqual(m.capturedPieceId, null);
    assert.ok(isWithinBoard(m.row, m.col), `Tọa độ (${m.row}, ${m.col}) phải trong bàn cờ`);
  }
});

// ----------------------------------------------------------------------------
// 2. BLOCKED BY OWN PIECE (Bị cản bởi quân mình)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Kiểm thử Blocked by Own Piece ---');

runTest('2.1. Xe bị chặn bởi quân cùng màu: không được ăn và không đi xuyên qua', () => {
  const board = new Board(false);
  // Xe Đỏ tại (4, 4)
  board.setPiece(4, 4, { id: 'r_chariot_4_4', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });
  // Quân Đỏ đồng minh tại (2, 4) hướng LÊN và (4, 6) hướng PHẢI
  board.setPiece(2, 4, { id: 'r_soldier_2_4', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  board.setPiece(4, 6, { id: 'r_soldier_4_6', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });

  // Hướng LÊN: chỉ được đi (3, 4). Ô (2, 4) bị chặn, các ô (1, 4), (0, 4) không tới được.
  assert.ok(moves.some(m => m.row === 3 && m.col === 4));
  assert.ok(!moves.some(m => m.row === 2 && m.col === 4), 'Không được đi vào ô quân mình (2, 4)');
  assert.ok(!moves.some(m => m.row === 1 && m.col === 4), 'Không được đi xuyên qua quân mình (1, 4)');
  assert.ok(!moves.some(m => m.row === 0 && m.col === 4), 'Không được đi xuyên qua quân mình (0, 4)');

  // Hướng PHẢI: chỉ được đi (4, 5). Ô (4, 6) bị chặn, các ô (4, 7), (4, 8) không tới được.
  assert.ok(moves.some(m => m.row === 4 && m.col === 5));
  assert.ok(!moves.some(m => m.row === 4 && m.col === 6), 'Không được đi vào ô quân mình (4, 6)');
  assert.ok(!moves.some(m => m.row === 4 && m.col === 7), 'Không được đi xuyên qua quân mình (4, 7)');
  assert.ok(!moves.some(m => m.row === 4 && m.col === 8), 'Không được đi xuyên qua quân mình (4, 8)');
});

runTest('2.2. Xe bị 4 quân cùng màu vây sát 4 phía thì có 0 nước đi', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_chariot', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });
  board.setPiece(3, 4, { id: 'r_up', color: COLORS.RED, type: PIECE_TYPES.SOLDIER });
  board.setPiece(5, 4, { id: 'r_down', color: COLORS.RED, type: PIECE_TYPES.SOLDIER });
  board.setPiece(4, 3, { id: 'r_left', color: COLORS.RED, type: PIECE_TYPES.SOLDIER });
  board.setPiece(4, 5, { id: 'r_right', color: COLORS.RED, type: PIECE_TYPES.SOLDIER });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });
  assert.strictEqual(moves.length, 0, 'Xe bị vây kín bởi quân mình phải có 0 nước đi');
});

// ----------------------------------------------------------------------------
// 3. CAPTURE ENEMY PIECE (Ăn quân đối phương)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Kiểm thử Capture ---');

runTest('3.1. Xe ăn quân đối phương đầu tiên trên đường đi và dừng lại', () => {
  const board = new Board(false);
  // Xe Đỏ tại (4, 4)
  board.setPiece(4, 4, { id: 'r_chariot_4_4', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });
  // Quân Đen đối phương tại (4, 2)
  board.setPiece(4, 2, { id: 'b_cannon_4_2', type: PIECE_TYPES.CANNON, color: COLORS.BLACK });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });

  // Hướng TRÁI: đi qua (4, 3) (canCapture: false), và ăn tại (4, 2) (canCapture: true)
  const emptyStep = moves.find(m => m.row === 4 && m.col === 3);
  assert.ok(emptyStep, 'Phải có nước đi (4, 3)');
  assert.strictEqual(emptyStep.canCapture, false);

  const captureMove = moves.find(m => m.row === 4 && m.col === 2);
  assert.ok(captureMove, 'Phải có nước ăn quân tại (4, 2)');
  assert.strictEqual(captureMove.canCapture, true);
  assert.strictEqual(captureMove.capturedPieceId, 'b_cannon_4_2');

  // Không được đi tiếp các ô sau quân địch: (4, 1) và (4, 0)
  assert.ok(!moves.some(m => m.row === 4 && m.col === 1), 'Không được đi xuyên qua quân địch (4, 1)');
  assert.ok(!moves.some(m => m.row === 4 && m.col === 0), 'Không được đi xuyên qua quân địch (4, 0)');
});

// ----------------------------------------------------------------------------
// 4. KHÔNG CHO XE NHẢY QUA QUÂN (DoD)
// ----------------------------------------------------------------------------
console.log('\n--- 4. Tiêu chí DoD: Không cho Xe nhảy qua quân ---');

runTest('4.1. Xe không thể nhảy qua quân địch để ăn quân thứ hai phía sau', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_chariot', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });
  // Hai quân Đen liên tiếp trên cùng hàng: (4, 2) và (4, 1)
  board.setPiece(4, 2, { id: 'b_soldier_1', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK });
  board.setPiece(4, 1, { id: 'b_soldier_2', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });

  // Xe chỉ ăn được b_soldier_1 tại (4, 2)
  assert.ok(moves.some(m => m.row === 4 && m.col === 2 && m.canCapture === true));
  // Tuyệt đối không được nhảy qua để ăn b_soldier_2 tại (4, 1) hoặc đi tiếp đến (4, 0)
  assert.ok(!moves.some(m => m.row === 4 && m.col === 1), 'Xe KHÔNG được nhảy qua quân địch đầu tiên để ăn quân thứ hai');
  assert.ok(!moves.some(m => m.row === 4 && m.col === 0), 'Xe KHÔNG được nhảy qua quân đến ô trống phía sau');
});

runTest('4.2. Xe không thể nhảy qua quân mình để ăn quân địch phía sau', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_chariot', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });
  // Quân mình tại (6, 4), quân địch tại (8, 4)
  board.setPiece(6, 4, { id: 'r_horse', type: PIECE_TYPES.HORSE, color: COLORS.RED });
  board.setPiece(8, 4, { id: 'b_general', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });

  const moves = getPseudoLegalMoves(board, { row: 4, col: 4 });

  // Hướng XUỐNG: chỉ đi được (5, 4)
  assert.ok(moves.some(m => m.row === 5 && m.col === 4));
  assert.ok(!moves.some(m => m.row === 6 && m.col === 4), 'Bị chặn tại quân mình (6, 4)');
  assert.ok(!moves.some(m => m.row === 8 && m.col === 4), 'Không được nhảy qua quân mình để ăn quân địch (8, 4)');
});

// ----------------------------------------------------------------------------
// 5. EDGE BOARD (Tọa độ biên và góc bàn cờ)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Kiểm thử Edge Board & Tọa độ biên ---');

runTest('5.1. Xe tại 4 góc biên bàn cờ không bao giờ sinh nước đi ngoài bàn cờ', () => {
  const board = new Board(false);

  // Góc trên-trái (0, 0): chỉ đi xuống (1..9: 9 ô) và sang phải (1..8: 8 ô) = 17 ô
  board.setPiece(0, 0, { id: 'r_corner_1', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });
  const movesCorner00 = getPseudoLegalMoves(board, { row: 0, col: 0 });
  assert.strictEqual(movesCorner00.length, 17);
  for (const m of movesCorner00) {
    assert.ok(m.row >= 0 && m.row <= 9 && m.col >= 0 && m.col <= 8, 'Nước đi phải nằm trong bàn cờ');
    assert.ok(m.row > 0 || m.col > 0, 'Không tự đi vào chính vị trí xuất phát');
  }

  // Góc dưới-phải (9, 8): chỉ đi lên (0..8: 9 ô) và sang trái (0..7: 8 ô) = 17 ô
  board.clear();
  board.setPiece(9, 8, { id: 'r_corner_2', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });
  const movesCorner98 = getPseudoLegalMoves(board, { row: 9, col: 8 });
  assert.strictEqual(movesCorner98.length, 17);
  for (const m of movesCorner98) {
    assert.ok(m.row >= 0 && m.row <= 9 && m.col >= 0 && m.col <= 8);
  }
});

// ----------------------------------------------------------------------------
// 6. IMMUTABILITY (Không làm thay đổi Board)
// ----------------------------------------------------------------------------
console.log('\n--- 6. Kiểm thử Tính Bất Biến (Immutability) ---');

runTest('6.1. getPseudoLegalMoves không tự ý thay đổi Board hay di chuyển quân cờ', () => {
  const board = new Board(false);
  board.setPiece(4, 4, { id: 'r_chariot', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });
  board.setPiece(4, 6, { id: 'b_cannon', type: PIECE_TYPES.CANNON, color: COLORS.BLACK });

  const initialPieceCount = board.getPieces().length;
  getPseudoLegalMoves(board, { row: 4, col: 4 });

  // Kiểm tra bàn cờ không bị thay đổi
  assert.strictEqual(board.getPieces().length, initialPieceCount, 'Số lượng quân cờ trên bàn không đổi');
  assert.ok(board.getPiece(4, 4), 'Quân Xe vẫn ở vị trí cũ');
  assert.ok(board.getPiece(4, 6), 'Quân Pháo địch vẫn ở vị trí cũ, không bị xóa');
});

// ============================================================================
// TỔNG KẾT
// ============================================================================
console.log('\n======================================================');
console.log(`KẾT QUẢ CHARIOT TESTS: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} TESTS!`);
console.log('======================================================\n');

