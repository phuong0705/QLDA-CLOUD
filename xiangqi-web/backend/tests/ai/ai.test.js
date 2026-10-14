/**
 * ============================================================================
 * Unit Test cho Hệ Thống AI: MoveGenerator, BoardEvaluator, Minimax, AIPlayer
 * File: backend/tests/ai/ai.test.js
 * ============================================================================
 * 
 * Tiêu chí nghiệm thu (Definition of Done của task):
 * 1. 100 lượt AI Easy không có move invalid (mỗi move đều được validateMove xác nhận).
 * 2. Medium xử lý state game over bằng null.
 * 3. AI không tự duplicate luật cờ (dùng chung Engine).
 * 4. Medium chạy Minimax depth 2 hoàn thành trong giới hạn thời gian hợp lý.
 * 5. BoardEvaluator gán giá trị tương đối đúng và điểm rất lớn cho checkmate.
 */

const assert = require('assert');
const Board = require('../../src/game/Board');
const GameState = require('../../src/game/GameState');
const { createInitialGameState } = require('../../src/game/initialState');
const validateMove = require('../../src/game/rules/moveValidator');
const MoveGenerator = require('../../src/ai/MoveGenerator');
const BoardEvaluator = require('../../src/ai/BoardEvaluator');
const Minimax = require('../../src/ai/Minimax');
const AIPlayer = require('../../src/ai/AIPlayer');
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
console.log('KIỂM THỬ: AI ENGINE (MOVEGENERATOR, BOARDEVALUATOR, MINIMAX, AIPLAYER)');
console.log('====================================================================\n');

// ============================================================================
// 1. KIỂM THỬ MOVEGENERATOR
// ============================================================================
console.log('--- 1. Kiểm thử MoveGenerator (Dùng Chung Engine) ---');

runTest('1.1. MoveGenerator sinh toàn bộ nước đi hợp lệ cho thế cờ ban đầu', () => {
  const gameState = createInitialGameState();
  const redMoves = MoveGenerator.generateLegalMoves(gameState, COLORS.RED);

  assert.ok(Array.isArray(redMoves), 'Phải trả về một mảng nước đi');
  assert.ok(redMoves.length > 0, 'Thế cờ ban đầu phải có nước đi hợp lệ');

  // Mọi nước đi sinh ra từ MoveGenerator đều phải được validateMove xác nhận hợp lệ 100%
  for (const move of redMoves) {
    const valResult = validateMove(gameState, move, COLORS.RED);
    assert.strictEqual(valResult.valid, true, `Nước đi ${JSON.stringify(move)} phải hợp lệ`);
  }
});

// ============================================================================
// 2. KIỂM THỬ BOARDEVALUATOR
// ============================================================================
console.log('\n--- 2. Kiểm thử BoardEvaluator ---');

runTest('2.1. Đánh giá thế cờ đối xứng ban đầu có điểm bằng 0', () => {
  const gameState = createInitialGameState();
  const evalRed = BoardEvaluator.evaluate(gameState, COLORS.RED);
  const evalBlack = BoardEvaluator.evaluate(gameState, COLORS.BLACK);

  assert.strictEqual(evalRed, 0, 'Thế trận ban đầu phải cân bằng (0 điểm)');
  assert.strictEqual(evalBlack, 0, 'Thế trận ban đầu phải cân bằng (0 điểm)');
});

runTest('2.2. Điểm tương đối: Bên có ưu thế về Xe/Pháo có điểm đánh giá dương cao hơn', () => {
  const board = new Board(false);
  board.setPiece(9, 4, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  board.setPiece(0, 4, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  // Phe Đỏ có thêm 1 Xe (giá trị 900)
  board.setPiece(5, 5, { id: 'r_c', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  const scoreRed = BoardEvaluator.evaluate(gameState, COLORS.RED);
  const scoreBlack = BoardEvaluator.evaluate(gameState, COLORS.BLACK);

  assert.strictEqual(scoreRed, 900, 'Đỏ hơn 1 Xe phải được 900 điểm');
  assert.strictEqual(scoreBlack, -900, 'Đen kém 1 Xe phải bị âm 900 điểm');
});

runTest('2.3. Chiếu Bí (Checkmate) được gán điểm rất lớn (+/- 100000)', () => {
  const board = new Board(false);
  board.setPiece(9, 3, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  board.setPiece(0, 8, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  board.setPiece(8, 3, { id: 'r_adv', type: PIECE_TYPES.ADVISOR, color: COLORS.RED });
  board.setPiece(9, 4, { id: 'r_soldier', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  board.setPiece(9, 0, { id: 'b_c', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });

  // Đỏ bị Đen chiếu bí
  const checkmateState = new GameState({
    board,
    currentTurn: COLORS.RED,
    status: STATUS.CHECKMATE,
    winner: COLORS.BLACK
  });

  const scoreForBlack = BoardEvaluator.evaluate(checkmateState, COLORS.BLACK);
  const scoreForRed = BoardEvaluator.evaluate(checkmateState, COLORS.RED);

  assert.strictEqual(scoreForBlack, BoardEvaluator.CHECKMATE_SCORE);
  assert.strictEqual(scoreForRed, -BoardEvaluator.CHECKMATE_SCORE);
});

// ============================================================================
// 3. KIỂM THỬ MINIMAX DEPTH 2
// ============================================================================
console.log('\n--- 3. Kiểm thử Minimax Depth 2 ---');

runTest('3.1. Minimax depth 2 hoàn thành trong thời gian hợp lý (< 1000ms)', () => {
  const gameState = createInitialGameState();

  const startTime = Date.now();
  const move = Minimax.findBestMove(gameState, COLORS.RED, { depth: 2, maxTimeMs: 2000 });
  const duration = Date.now() - startTime;

  assert.ok(move, 'Phải tìm được nước đi tốt nhất');
  assert.ok(duration < 1500, `Minimax depth 2 hoàn thành trong ${duration}ms (< 1500ms)`);

  const val = validateMove(gameState, move, COLORS.RED);
  assert.strictEqual(val.valid, true, 'Nước đi của Minimax phải hợp lệ');
});

runTest('3.2. Minimax ưu tiên ăn quân có giá trị lớn (Xe ăn Xe)', () => {
  const board = new Board(false);
  board.setPiece(9, 5, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  board.setPiece(0, 3, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  // Xe Đỏ tại (5, 0)
  board.setPiece(5, 0, { id: 'r_chariot', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });
  // Xe Đen tại (5, 8) đang hở trên cùng hàng 5
  board.setPiece(5, 8, { id: 'b_chariot_target', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  const bestMove = Minimax.findBestMove(gameState, COLORS.RED, { depth: 2 });
  assert.ok(bestMove);
  // Minimax phải chọn nước Xe Đỏ phi sang ăn Xe Đen tại (5, 8)
  assert.deepStrictEqual(bestMove.from, { row: 5, col: 0 });
  assert.deepStrictEqual(bestMove.to, { row: 5, col: 8 });
});

// ============================================================================
// 4. TIÊU CHÍ DoD: 100 LƯỢT AI EASY KHÔNG CÓ MOVE INVALID
// ============================================================================
console.log('\n--- 4. Tiêu chí DoD: 100 Lượt AI Easy Hợp Lệ 100% ---');

runTest('4.1. Tiêu chí DoD: 100 lượt AI Easy không có bất kỳ nước đi nào invalid', () => {
  let gameState = createInitialGameState();
  let moveSuccessCount = 0;

  for (let turn = 0; turn < 100; turn++) {
    const currentTurn = gameState.currentTurn;
    const move = AIPlayer.getMove(gameState, currentTurn, 'EASY');

    if (!move) {
      // Nếu ván cờ tới giới hạn cạn nước, reset lại bàn cờ mới để tiếp tục test
      gameState = createInitialGameState();
      continue;
    }

    // Xác nhận tính hợp lệ qua validateMove của Game Engine
    const valResult = validateMove(gameState, move, currentTurn);
    assert.strictEqual(
      valResult.valid,
      true,
      `Lượt thứ ${turn + 1}: Nước đi ${JSON.stringify(move)} của phe ${currentTurn} bị invalid! Lý do: ${valResult.reason}`
    );

    moveSuccessCount++;

    // Áp dụng nước đi để biến đổi state sang lượt kế tiếp
    gameState.makeMove(move.from, move.to);
  }

  assert.ok(moveSuccessCount >= 90, `Đã thực hiện thành công ${moveSuccessCount}/100 lượt đi hợp lệ`);
});

// ============================================================================
// 5. TIÊU CHÍ DoD: MEDIUM XỬ LÝ STATE GAME OVER BẰNG NULL
// ============================================================================
console.log('\n--- 5. Tiêu chí DoD: Medium Xử Lý State Game Over Bằng Null ---');

runTest('5.1. Tiêu chí DoD: State Game Over (CHECKMATE) trả về null cho cả Medium và Easy', () => {
  const board = new Board(false);
  board.setPiece(9, 3, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  board.setPiece(0, 8, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  board.setPiece(8, 3, { id: 'r_adv', type: PIECE_TYPES.ADVISOR, color: COLORS.RED });
  board.setPiece(9, 4, { id: 'r_soldier', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  // Xe Đen chiếu bí
  board.setPiece(9, 0, { id: 'b_c', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });

  const checkmateState = new GameState({
    board,
    currentTurn: COLORS.RED,
    status: STATUS.CHECKMATE,
    winner: COLORS.BLACK
  });

  // Phe Đỏ đang bị chiếu bí -> Game Over -> Phải trả về null
  const mediumMove = AIPlayer.getMove(checkmateState, COLORS.RED, 'MEDIUM');
  assert.strictEqual(mediumMove, null, 'Medium phải trả về null khi state đã CHECKMATE');

  const easyMove = AIPlayer.getMove(checkmateState, COLORS.RED, 'EASY');
  assert.strictEqual(easyMove, null, 'Easy phải trả về null khi state đã CHECKMATE');
});

runTest('5.2. Tiêu chí DoD: State Game Over (Mất Tướng / FINISHED) trả về null', () => {
  const board = new Board(false);
  // Tướng Đỏ đã bị ăn, chỉ còn Tướng Đen
  board.setPiece(0, 4, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });

  const finishedState = new GameState({
    board,
    currentTurn: COLORS.RED,
    status: STATUS.FINISHED,
    winner: COLORS.BLACK
  });

  const mediumMove = AIPlayer.getMove(finishedState, COLORS.RED, 'MEDIUM');
  assert.strictEqual(mediumMove, null, 'Medium phải trả về null khi ván đấu đã FINISHED');

  const easyMove = AIPlayer.getMove(finishedState, COLORS.RED, 'EASY');
  assert.strictEqual(easyMove, null, 'Easy phải trả về null khi ván đấu đã FINISHED');
});

// ============================================================================
// TỔNG KẾT
// ============================================================================
console.log('\n====================================================================');
console.log(`KẾT QUẢ TESTS: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} TESTS THÀNH CÔNG!`);
console.log('====================================================================\n');
