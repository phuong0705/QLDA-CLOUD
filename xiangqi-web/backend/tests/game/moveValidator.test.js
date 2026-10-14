/**
 * ============================================================================
 * Unit Test cho moveValidator.js, checkValidator.js, flyingGeneralValidator.js
 * File: backend/tests/game/moveValidator.test.js
 * ============================================================================
 * 
 * Tiêu chí nghiệm thu (Definition of Done của task):
 * 1. Test move hợp lệ (valid: true, trả nextState, capturedPiece).
 * 2. Test từng nhóm invalid reason:
 *    - OUT_OF_BOARD
 *    - NO_PIECE
 *    - NOT_YOUR_TURN
 *    - ILLEGAL_PATTERN
 *    - SELF_CHECK
 *    - FLYING_GENERAL
 * 3. Test tình huống chắn chiếu (Interposition/Block check).
 * 4. Test tình huống bỏ chắn gây flying general (Unpinning causes flying general).
 * 5. Không làm thay đổi board thật khi chỉ validate (Immutability).
 */

const assert = require('assert');
const Board = require('../../src/game/Board');
const GameState = require('../../src/game/GameState');
const { createInitialGameState } = require('../../src/game/initialState');
const validateMove = require('../../src/game/rules/moveValidator');
const { MOVE_INVALID_REASONS } = require('../../src/game/rules/moveValidator');
const isInCheck = require('../../src/game/rules/checkValidator');
const isFlyingGeneral = require('../../src/game/rules/flyingGeneralValidator');
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
console.log('KIỂM THỬ: MOVE VALIDATOR, CHECK VALIDATOR & FLYING GENERAL VALIDATOR');
console.log('====================================================================\n');

// ============================================================================
// 1. KIỂM THỬ NƯỚC ĐI HỢP LỆ (VALID MOVES)
// ============================================================================
console.log('--- 1. Kiểm thử Nước Đi Hợp Lệ ---');

runTest('1.1. Nước mở màn kinh điển: Tốt Đỏ tiến 1 bước (6, 4) -> (5, 4) hợp lệ', () => {
  const gameState = createInitialGameState();

  const res = validateMove(gameState, {
    from: { row: 6, col: 4 },
    to: { row: 5, col: 4 },
    playerColor: COLORS.RED
  });

  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.reason, undefined);
  assert.strictEqual(res.capturedPiece, null);
  assert.ok(res.nextState instanceof GameState);
  assert.strictEqual(res.nextState.currentTurn, COLORS.BLACK, 'nextState đã đổi lượt sang BLACK');
  assert.strictEqual(res.nextState.metadata.moveCount, 1);
  assert.ok(res.nextState.board.getPiece(5, 4));
  assert.strictEqual(res.nextState.board.getPiece(6, 4), null);
});

runTest('1.2. Nước đi ăn quân hợp lệ: Pháo bắn quân địch có ngòi', () => {
  const board = new Board(false);
  board.setPiece(9, 4, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  board.setPiece(0, 4, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  // Pháo Đỏ tại (7, 1)
  board.setPiece(7, 1, { id: 'r_c', type: PIECE_TYPES.CANNON, color: COLORS.RED });
  // Ngòi Đỏ tại (7, 4)
  board.setPiece(7, 4, { id: 'r_screen', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });
  // Mục tiêu Đen tại (7, 7)
  board.setPiece(7, 7, { id: 'b_chariot', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  const res = validateMove(gameState, {
    from: { row: 7, col: 1 },
    to: { row: 7, col: 7 }
  });

  assert.strictEqual(res.valid, true);
  assert.ok(res.capturedPiece);
  assert.strictEqual(res.capturedPiece.type, PIECE_TYPES.CHARIOT);
  assert.strictEqual(res.capturedPiece.color, COLORS.BLACK);
});

// ============================================================================
// 2. KIỂM THỬ CÁC NHÓM LỖI (INVALID REASONS)
// ============================================================================
console.log('\n--- 2. Kiểm thử Từng Nhóm Invalid Reason ---');

runTest('2.1. OUT_OF_BOARD: Tọa độ ngoài biên hoặc không hợp lệ', () => {
  const gameState = createInitialGameState();

  // from ngoài biên
  assert.strictEqual(
    validateMove(gameState, { from: { row: -1, col: 0 }, to: { row: 0, col: 0 } }).reason,
    MOVE_INVALID_REASONS.OUT_OF_BOARD
  );
  // to ngoài biên
  assert.strictEqual(
    validateMove(gameState, { from: { row: 6, col: 4 }, to: { row: 6, col: 9 } }).reason,
    MOVE_INVALID_REASONS.OUT_OF_BOARD
  );
  // null hoặc thiếu tọa độ
  assert.strictEqual(
    validateMove(gameState, null).reason,
    MOVE_INVALID_REASONS.OUT_OF_BOARD
  );
});

runTest('2.2. NO_PIECE: Ô xuất phát không có quân cờ', () => {
  const gameState = createInitialGameState();

  const res = validateMove(gameState, {
    from: { row: 4, col: 4 }, // Ô trống
    to: { row: 5, col: 4 }
  });

  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.reason, MOVE_INVALID_REASONS.NO_PIECE);
});

runTest('2.3. NOT_YOUR_TURN: Lượt của bên này nhưng đi quân bên kia', () => {
  const gameState = createInitialGameState(); // currentTurn = RED

  // 1. Cố tình chọn quân Đen khi đang lượt Đỏ
  const res1 = validateMove(gameState, {
    from: { row: 3, col: 4 }, // Tốt Đen
    to: { row: 4, col: 4 }
  });
  assert.strictEqual(res1.valid, false);
  assert.strictEqual(res1.reason, MOVE_INVALID_REASONS.NOT_YOUR_TURN);

  // 2. Truyền playerColor = 'BLACK' khi ván đấu đang lượt RED
  const res2 = validateMove(gameState, {
    from: { row: 6, col: 4 }, // Tốt Đỏ
    to: { row: 5, col: 4 },
    playerColor: COLORS.BLACK
  });
  assert.strictEqual(res2.valid, false);
  assert.strictEqual(res2.reason, MOVE_INVALID_REASONS.NOT_YOUR_TURN);
});

runTest('2.4. ILLEGAL_PATTERN: Đi sai luật hình học / vật cản của quân cờ', () => {
  const gameState = createInitialGameState();

  // 1. Mã Đỏ nhảy vào ô không phải chữ L: (9, 1) -> (8, 1)
  const resHorse = validateMove(gameState, {
    from: { row: 9, col: 1 },
    to: { row: 8, col: 1 }
  });
  assert.strictEqual(resHorse.reason, MOVE_INVALID_REASONS.ILLEGAL_PATTERN);

  // 2. Tốt Đỏ chưa qua sông cố đi ngang: (6, 4) -> (6, 3)
  const resSoldier = validateMove(gameState, {
    from: { row: 6, col: 4 },
    to: { row: 6, col: 3 }
  });
  assert.strictEqual(resSoldier.reason, MOVE_INVALID_REASONS.ILLEGAL_PATTERN);

  // 3. Pháo Đỏ bắn quân địch (2, 1) không có ngòi
  const resCannon = validateMove(gameState, {
    from: { row: 7, col: 1 },
    to: { row: 2, col: 1 } // Ô (2, 1) là Pháo Đen, không có ngòi ở giữa
  });
  assert.strictEqual(resCannon.valid, false);
  assert.strictEqual(resCannon.reason, MOVE_INVALID_REASONS.ILLEGAL_PATTERN);
});

// ============================================================================
// 3. KIỂM THỬ TÌNH HUỐNG CHẮN CHIẾU & SELF_CHECK (DoD)
// ============================================================================
console.log('\n--- 3. Tiêu chí DoD: Tình huống Chắn Chiếu & SELF_CHECK ---');

runTest('3.1. SELF_CHECK: Tướng Đỏ đang bị Xe Đen chiếu, đi quân khác không giải chiếu bị từ chối', () => {
  const board = new Board(false);
  // Tướng Đỏ tại (9, 4)
  board.setPiece(9, 4, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  // Tướng Đen tại (0, 0)
  board.setPiece(0, 0, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  // Xe Đen tại (1, 4) đang chiếu thẳng dọc xuống Tướng Đỏ (9, 4)
  board.setPiece(1, 4, { id: 'b_c', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });
  // Quân Mã Đỏ tại (9, 1)
  board.setPiece(9, 1, { id: 'r_h', type: PIECE_TYPES.HORSE, color: COLORS.RED });

  // Kiểm tra xác thực Tướng Đỏ đang bị chiếu
  assert.strictEqual(isInCheck(board, COLORS.RED), true, 'Tướng Đỏ phải đang bị chiếu');

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  // Đỏ cố đi Mã (9, 1) -> (7, 2), không giải được chiếu
  const res = validateMove(gameState, {
    from: { row: 9, col: 1 },
    to: { row: 7, col: 2 }
  });

  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.reason, MOVE_INVALID_REASONS.SELF_CHECK, 'Phải báo SELF_CHECK vì Tướng vẫn bị chiếu');
});

runTest('3.2. Chắn chiếu: Đi quân vào giữa đường chiếu để chắn chiếu là HỢP LỆ', () => {
  const board = new Board(false);
  // Tướng Đỏ tại (9, 4)
  board.setPiece(9, 4, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  // Tướng Đen tại (0, 0)
  board.setPiece(0, 0, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  // Xe Đen tại (1, 4) đang chiếu dọc
  board.setPiece(1, 4, { id: 'b_c', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });
  // Xe Đỏ tại (8, 0)
  board.setPiece(8, 0, { id: 'r_c', type: PIECE_TYPES.CHARIOT, color: COLORS.RED });

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  // Xe Đỏ đi vào (8, 4) để CHẮN ĐƯỜNG CHIẾU của Xe Đen
  const res = validateMove(gameState, {
    from: { row: 8, col: 0 },
    to: { row: 8, col: 4 }
  });

  assert.strictEqual(res.valid, true, 'Nước đi chắn chiếu phải hợp lệ');
  assert.strictEqual(res.reason, undefined);
  // Sau khi Xe Đỏ đứng tại (8, 4), Tướng Đỏ không còn bị chiếu
  assert.strictEqual(isInCheck(res.nextState.board, COLORS.RED), false);
});

runTest('3.3. Tự đi Tướng vào ô bị chiếu bị từ chối với SELF_CHECK', () => {
  const board = new Board(false);
  // Tướng Đỏ tại (9, 4)
  board.setPiece(9, 4, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  board.setPiece(0, 0, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  // Xe Đen tại (0, 5) đang kiểm soát cột 5
  board.setPiece(0, 5, { id: 'b_c', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK });

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  // Tướng Đỏ cố bước sang ngang (9, 5) - ô đang bị Xe Đen chiếu
  const res = validateMove(gameState, {
    from: { row: 9, col: 4 },
    to: { row: 9, col: 5 }
  });

  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.reason, MOVE_INVALID_REASONS.SELF_CHECK);
});

// ============================================================================
// 4. KIỂM THỬ FLYING GENERAL (DoD)
// ============================================================================
console.log('\n--- 4. Tiêu chí DoD: Bỏ Chắn Gây FLYING_GENERAL ---');

runTest('4.1. Tiêu chí DoD: Bỏ quân cờ chắn duy nhất khiến 2 Tướng đối mặt bị từ chối với FLYING_GENERAL', () => {
  const board = new Board(false);
  // Tướng Đen tại (0, 4)
  board.setPiece(0, 4, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  // Tướng Đỏ tại (9, 4)
  board.setPiece(9, 4, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  // Duy nhất 1 quân Tốt Đỏ tại (4, 4) đang đứng chắn giữa 2 Tướng trên cột 4
  board.setPiece(4, 4, { id: 'r_pawn_shield', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });

  // Hiện tại có quân chắn nên không bị Flying General
  assert.strictEqual(isFlyingGeneral(board), false);

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  // Tốt Đỏ đã qua sông, cố đi sang ngang (4, 4) -> (4, 3) (RỜI KHỎI CỘT 4)
  const res = validateMove(gameState, {
    from: { row: 4, col: 4 },
    to: { row: 4, col: 3 }
  });

  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.reason, MOVE_INVALID_REASONS.FLYING_GENERAL, 'Bỏ chắn làm lộ mặt Tướng phải báo FLYING_GENERAL');
});

runTest('4.2. Tốt Đỏ tiến dọc trên cùng cột 4: (4, 4) -> (3, 4) KHÔNG gây Flying General (HỢP LỆ)', () => {
  const board = new Board(false);
  board.setPiece(0, 4, { id: 'b_g', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK });
  board.setPiece(9, 4, { id: 'r_g', type: PIECE_TYPES.GENERAL, color: COLORS.RED });
  // Tốt Đỏ tại (4, 4)
  board.setPiece(4, 4, { id: 'r_pawn', type: PIECE_TYPES.SOLDIER, color: COLORS.RED });

  const gameState = new GameState({ board, currentTurn: COLORS.RED });

  // Tốt Đỏ tiến thẳng lên (3, 4) (VẪN Ở TRÊN CỘT 4, VẪN CHẮN GIỮA 2 TƯỚNG)
  const res = validateMove(gameState, {
    from: { row: 4, col: 4 },
    to: { row: 3, col: 4 }
  });

  assert.strictEqual(res.valid, true, 'Vẫn chắn cột 4 thì hợp lệ');
  assert.strictEqual(res.reason, undefined);
});

// ============================================================================
// 5. KIỂM THỬ IMMUTABILITY (Không làm thay đổi Board thật)
// ============================================================================
console.log('\n--- 5. Kiểm thử Tính Bất Biến (Immutability) ---');

runTest('5.1. validateMove không làm thay đổi Board và GameState ban đầu khi chỉ validate', () => {
  const gameState = createInitialGameState();

  const originalTurn = gameState.currentTurn;
  const originalMoveCount = gameState.metadata.moveCount;
  const originalPieceCount = gameState.board.getPieces().length;

  // Thử validate một nước đi hợp lệ
  validateMove(gameState, { from: { row: 6, col: 4 }, to: { row: 5, col: 4 } });

  // Thử validate một nước đi không hợp lệ
  validateMove(gameState, { from: { row: 6, col: 4 }, to: { row: 4, col: 4 } });

  // Kiểm tra GameState gốc hoàn toàn không bị mutate
  assert.strictEqual(gameState.currentTurn, originalTurn, 'currentTurn gốc không đổi');
  assert.strictEqual(gameState.metadata.moveCount, originalMoveCount, 'moveCount gốc không đổi');
  assert.strictEqual(gameState.board.getPieces().length, originalPieceCount, 'Số quân cờ gốc không đổi');
  assert.ok(gameState.board.getPiece(6, 4), 'Quân tại (6, 4) vẫn còn nguyên');
  assert.strictEqual(gameState.board.getPiece(5, 4), null, 'Ô (5, 4) trên board gốc vẫn trống');
});

// ============================================================================
// TỔNG KẾT
// ============================================================================
console.log('\n====================================================================');
console.log(`KẾT QUẢ TESTS: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} TESTS THÀNH CÔNG!`);
console.log('====================================================================\n');
