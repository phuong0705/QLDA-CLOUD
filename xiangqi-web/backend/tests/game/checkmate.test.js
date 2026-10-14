/**
 * ============================================================================
 * Unit Test cho checkmateValidator.js & gameStatusEvaluator.js
 * File: backend/tests/game/checkmate.test.js
 * ============================================================================
 * 
 * Tiêu chí nghiệm thu (Definition of Done của task):
 * 1. Check != Checkmate: Đang bị chiếu nhưng còn legal move thì status là CHECK, winner là null.
 * 2. Không báo checkmate nếu còn legal move (chắn chiếu hoặc chạy Tướng).
 * 3. Báo đúng CHECKMATE khi bị chiếu và không còn bất kỳ legal move nào để thoát chiếu.
 * 4. Winner chỉ có khi FINISHED hoặc CHECKMATE.
 * 5. Hỗ trợ trường hợp Tướng (General) bị capture kết thúc ván đấu ngay lập tức.
 * 6. evaluateGameStatus trả kết quả ổn định và 100% JSON-serializable.
 */

const assert = require('assert');
const Board = require('../../src/game/Board');
const GameState = require('../../src/game/GameState');
const { createInitialGameState } = require('../../src/game/initialState');
const {
  isCheckmate,
  getAllLegalMoves,
  hasAnyLegalMove
} = require('../../src/game/rules/checkmateValidator');
const evaluateGameStatus = require('../../src/game/rules/gameStatusEvaluator');
const isInCheck = require('../../src/game/rules/checkValidator');
const { COLORS, STATUS, PIECE_TYPES } = require('../../src/game/constants');

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

console.log('\n====================================================================');
console.log('KIỂM THỬ: CHECKMATE VALIDATOR & GAME STATUS EVALUATOR');
console.log('====================================================================\n');

// ============================================================================
// 1. KIỂM THỬ TRẠNG THÁI BÌNH THƯỜNG (PLAYING)
// ============================================================================
console.log('--- 1. Kiểm thử Trạng Thái Ban Đầu (PLAYING) ---');

runTest('1.1. Bàn cờ ban đầu: status PLAYING, winner null, checkColor null', () => {
  const gameState = createInitialGameState();

  // Kiểm tra legal moves ban đầu
  assert.strictEqual(hasAnyLegalMove(gameState, COLORS.RED), true);
  const redMoves = getAllLegalMoves(gameState, COLORS.RED);
  assert.ok(redMoves.length > 0, 'Phải có các nước đi hợp lệ ban đầu');

  const statusObj = evaluateGameStatus(gameState);

  assert.strictEqual(statusObj.status, STATUS.PLAYING);
  assert.strictEqual(statusObj.winner, null, 'Winner phải là null khi đang chơi');
  assert.strictEqual(statusObj.checkColor, null);
  assert.strictEqual(statusObj.currentTurn, COLORS.RED);
});

// ============================================================================
// 2. TIÊU CHÍ DoD: CHECK != CHECKMATE (CÒN NƯỚC THOÁT CHIẾU)
// ============================================================================
console.log('\n--- 2. Tiêu chí DoD: Check != Checkmate (Còn Legal Move Thoát Chiếu) ---');

runTest('2.1. Tướng Đỏ bị chiếu nhưng còn nước chạy Tướng: status là CHECK, winner là null', () => {
  const board = new Board(false);
  // Tướng Đỏ tại (9, 4)
  board.setPiece(9, 4, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  // Tướng Đen tại (0, 0)
  board.setPiece(0, 0, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  // Xe Đen tại (1, 4) đang chiếu dọc xuống (9, 4)
  board.setPiece(1, 4, { id: 'b_c', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  // 1. Đang bị chiếu
  assert.strictEqual(isInCheck(board, COLORS.RED), true);

  // 2. Còn nước đi hợp lệ: Tướng Đỏ có thể chạy sang (9, 3) hoặc (9, 5)
  assert.strictEqual(hasAnyLegalMove(gameState, COLORS.RED), true);
  const escapeMoves = getAllLegalMoves(gameState, COLORS.RED);
  assert.ok(escapeMoves.length >= 2, 'Tướng Đỏ phải có ít nhất 2 nước chạy sang 2 bên');

  // 3. KHÔNG PHẢI CHECKMATE (DoD)
  assert.strictEqual(isCheckmate(gameState, COLORS.RED), false, 'Không được báo checkmate khi còn nước chạy Tướng');

  // 4. evaluateGameStatus phải trả status là CHECK và winner là null
  const statusObj = evaluateGameStatus(gameState);
  assert.strictEqual(statusObj.status, STATUS.CHECK, 'Status phải là CHECK');
  assert.strictEqual(statusObj.winner, null, 'Winner TUYỆT ĐỐI PHẢI LÀ NULL khi chỉ mới bị chiếu');
  assert.strictEqual(statusObj.checkColor, COLORS.RED);
  assert.strictEqual(statusObj.currentTurn, COLORS.RED);
});

runTest('2.2. Tướng Đỏ bị chiếu nhưng có quân chắn đường chiếu: status là CHECK, winner là null', () => {
  const board = new Board(false);
  // Tướng Đỏ tại (9, 4)
  board.setPiece(9, 4, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  board.setPiece(0, 0, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  // Xe Đen tại (1, 4) chiếu dọc
  board.setPiece(1, 4, { id: 'b_c', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });
  // Quân Xe Đỏ tại (8, 0) có thể phi vào (8, 4) để chắn chiếu
  board.setPiece(8, 0, { id: 'r_c', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  assert.strictEqual(isCheckmate(gameState, COLORS.RED), false, 'Không báo checkmate khi có quân chắn chiếu');

  const statusObj = evaluateGameStatus(gameState);
  assert.strictEqual(statusObj.status, STATUS.CHECK);
  assert.strictEqual(statusObj.winner, null);
});

runTest('2.3. Tướng Đỏ bị chiếu nhưng có quân ăn được kẻ chiếu: status là CHECK, winner là null', () => {
  const board = new Board(false);
  board.setPiece(9, 4, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  board.setPiece(0, 0, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  // Pháo Đen tại (7, 4) chiếu Tướng Đỏ (ngòi là Tốt Đen 8, 4)
  board.setPiece(7, 4, { id: 'b_cannon', type: PIECE_TYPES.CANNON, color: COLORS.BLACK });
  board.setPiece(8, 4, { id: 'b_screen', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK });
  // Xe Đỏ tại (7, 0) có thể ăn thẳng Pháo Đen tại (7, 4)
  board.setPiece(7, 0, { id: 'r_c', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  assert.strictEqual(isCheckmate(gameState, COLORS.RED), false, 'Không báo checkmate khi có quân ăn được kẻ chiếu');
  assert.strictEqual(evaluateGameStatus(gameState).status, STATUS.CHECK);
  assert.strictEqual(evaluateGameStatus(gameState).winner, null);
});

// ============================================================================
// 3. TIÊU CHÍ DoD: CHECKMATE (CHIẾU BÍ THỰC SỰ - KHÔNG CÒN NƯỚC ĐI)
// ============================================================================
console.log('\n--- 3. Tiêu chí DoD: Checkmate (Chiếu Bí Thực Sự) ---');

runTest('3.1. Thế cờ Chiếu Bí: Tướng Đỏ bị bao vây và Xe Đen cắm đáy chiếu ngang', () => {
  const board = new Board(false);
  // Tướng Đỏ kẹt ở góc cung (9, 3)
  board.setPiece(9, 3, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  // Tướng Đen ở xa tại (0, 8)
  board.setPiece(0, 8, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  // Sĩ Đỏ tại (8, 3) (chặn lối đi lên của Tướng)
  board.setPiece(8, 3, { id: 'r_adv', type: PIECE_TYPES.ADVISOR, color: COLORS.RED });
  // Tốt Đỏ tại (9, 4) (chặn lối sang ngang của Tướng)
  board.setPiece(9, 4, { id: 'r_soldier', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });

  // Xe Đen tại (9, 0) chiếu ngang thẳng vào Tướng Đỏ (9, 3)
  board.setPiece(9, 0, { id: 'b_chariot_killer', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  // 1. Tướng Đỏ đang bị chiếu
  assert.strictEqual(isInCheck(board, COLORS.RED), true);

  // 2. Không còn bất kỳ nước đi nào hợp lệ để thoát chiếu
  const legalMoves = getAllLegalMoves(gameState, COLORS.RED);
  assert.strictEqual(legalMoves.length, 0, 'Phe Đỏ không còn nước đi hợp lệ nào');
  assert.strictEqual(hasAnyLegalMove(gameState, COLORS.RED), false);

  // 3. XÁC NHẬN CHIẾU BÍ (CHECKMATE)
  assert.strictEqual(isCheckmate(gameState, COLORS.RED), true, 'Phải xác nhận là CHECKMATE');

  // 4. evaluateGameStatus trả CHECKMATE và Winner là BLACK
  const statusObj = evaluateGameStatus(gameState);
  assert.strictEqual(statusObj.status, STATUS.CHECKMATE);
  assert.strictEqual(statusObj.winner, COLORS.BLACK, 'Winner phải là đối thủ (BLACK)');
  assert.strictEqual(statusObj.checkColor, COLORS.RED);
});

// ============================================================================
// 4. KIỂM THỬ GENERAL BỊ CAPTURE (FINISHED NGAY LẬP TỨC)
// ============================================================================
console.log('\n--- 4. Kiểm thử General Bị Capture (FINISHED) ---');

runTest('4.1. Mất Tướng Đỏ: status FINISHED, winner BLACK', () => {
  const board = new Board(false);
  // Chỉ còn Tướng Đen trên bàn cờ, Tướng Đỏ đã bị ăn
  board.setPiece(0, 4, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  const statusObj = evaluateGameStatus(gameState);
  assert.strictEqual(statusObj.status, STATUS.FINISHED);
  assert.strictEqual(statusObj.winner, COLORS.BLACK);
});

runTest('4.2. Mất Tướng Đen: status FINISHED, winner RED', () => {
  const board = new Board(false);
  // Chỉ còn Tướng Đỏ trên bàn cờ
  board.setPiece(9, 4, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });

  const gameState = new GameState({ board, currentTurn: COLORS.BLACK });

  const statusObj = evaluateGameStatus(gameState);
  assert.strictEqual(statusObj.status, STATUS.FINISHED);
  assert.strictEqual(statusObj.winner, COLORS.RED);
});

// ============================================================================
// 5. SERIALIZABILITY & TOÀN VẸN DỮ LIỆU
// ============================================================================
console.log('\n--- 5. Kiểm thử Tính Độc Lập & Serializability ---');

runTest('5.1. evaluateGameStatus trả kết quả Plain Object JSON-serializable hoàn hảo', () => {
  const gameState = createInitialGameState();
  const statusObj = evaluateGameStatus(gameState);

  const jsonStr = JSON.stringify(statusObj);
  assert.strictEqual(typeof jsonStr, 'string');
  const parsed = JSON.parse(jsonStr);

  assert.deepStrictEqual(parsed, statusObj);
});

// ============================================================================
// TỔNG KẾT
// ============================================================================
console.log('\n====================================================================');
console.log(`KẾT QUẢ TESTS: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} TESTS THÀNH CÔNG!`);
console.log('====================================================================\n');

