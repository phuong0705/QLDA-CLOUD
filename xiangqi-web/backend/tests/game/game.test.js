/**
 * ============================================================================
 * Unit Test cho Board.js, GameState.js, constants.js
 * File: backend/tests/game/game.test.js
 * ============================================================================
 * 
 * Tiêu chí nghiệm thu (Definition of Done của task):
 * 1. Unit test biên tọa độ:
 *    - Xác thực vùng hợp lệ row 0..9, col 0..8.
 *    - Bắt lỗi khi tọa độ ngoài biên (âm, >= 10, >= 9, không phải số nguyên).
 *    - getPiece, setPiece, removePiece, movePiece xử lý đúng với tọa độ biên.
 * 2. Unit test clone sâu (Deep Clone):
 *    - Board.clone() tạo bản sao độc lập hoàn toàn, không chung reference mảng hay object.
 *    - GameState.clone() tạo bản sao độc lập, thay đổi trên clone không làm biến đổi state thật.
 * 3. Serialize -> JSON -> fromJSON giữ nguyên dữ liệu 100%.
 * 4. Không có phụ thuộc express / mssql / socket.io / DOM.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const Board = require('../../src/game/Board');
const GameState = require('../../src/game/GameState');
const {
  BOARD_ROWS,
  BOARD_COLS,
  COLORS,
  STATUS,
  PIECE_TYPES,
  isValidCoordinate
} = require('../../src/game/constants');

// Bộ test runner đơn giản
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
console.log('KIỂM THỬ: BOARD, GAMESTATE & TIÊU CHÍ NGHIỆM THU (DoD)');
console.log('======================================================\n');

// ============================================================================
// 1. KIỂM THỬ BIÊN TỌA ĐỘ (BOUNDARY & COORDINATE VALIDATION)
// ============================================================================
console.log('--- 1. Kiểm thử Biên Tọa Độ (0..9 hàng, 0..8 cột) ---');

runTest('1.1. Tọa độ 4 góc biên hợp lệ', () => {
  const board = new Board(false);

  // 4 góc biên của bàn cờ 10x9
  assert.strictEqual(board.isValidPosition(0, 0), true, '(0,0) phải hợp lệ');
  assert.strictEqual(board.isValidPosition(0, 8), true, '(0,8) phải hợp lệ');
  assert.strictEqual(board.isValidPosition(9, 0), true, '(9,0) phải hợp lệ');
  assert.strictEqual(board.isValidPosition(9, 8), true, '(9,8) phải hợp lệ');

  // getPiece tại 4 góc không ném lỗi
  assert.strictEqual(board.getPiece(0, 0), null);
  assert.strictEqual(board.getPiece(0, 8), null);
  assert.strictEqual(board.getPiece(9, 0), null);
  assert.strictEqual(board.getPiece(9, 8), null);
});

runTest('1.2. Tọa độ vượt biên row < 0 hoặc row >= 10 bị từ chối và ném RangeError', () => {
  const board = new Board(false);

  // Ngoài biên trên row < 0
  assert.strictEqual(board.isValidPosition(-1, 0), false);
  assert.strictEqual(board.isValidPosition(-5, 4), false);
  assert.throws(() => board.getPiece(-1, 0), RangeError);
  assert.throws(() => board.setPiece(-1, 0, { type: 'soldier', color: 'RED' }), RangeError);
  assert.throws(() => board.removePiece(-1, 0), RangeError);

  // Ngoài biên dưới row >= 10
  assert.strictEqual(board.isValidPosition(10, 0), false);
  assert.strictEqual(board.isValidPosition(10, 8), false);
  assert.strictEqual(board.isValidPosition(100, 4), false);
  assert.throws(() => board.getPiece(10, 0), RangeError);
  assert.throws(() => board.setPiece(10, 0, { type: 'soldier', color: 'RED' }), RangeError);
  assert.throws(() => board.removePiece(10, 0), RangeError);
});

runTest('1.3. Tọa độ vượt biên col < 0 hoặc col >= 9 bị từ chối và ném RangeError', () => {
  const board = new Board(false);

  // Ngoài biên trái col < 0
  assert.strictEqual(board.isValidPosition(0, -1), false);
  assert.strictEqual(board.isValidPosition(5, -1), false);
  assert.throws(() => board.getPiece(0, -1), RangeError);
  assert.throws(() => board.setPiece(0, -1, { type: 'soldier', color: 'RED' }), RangeError);

  // Ngoài biên phải col >= 9
  assert.strictEqual(board.isValidPosition(0, 9), false);
  assert.strictEqual(board.isValidPosition(9, 9), false);
  assert.strictEqual(board.isValidPosition(5, 12), false);
  assert.throws(() => board.getPiece(0, 9), RangeError);
  assert.throws(() => board.setPiece(0, 9, { type: 'soldier', color: 'RED' }), RangeError);
});

runTest('1.4. Tọa độ không phải số nguyên (NaN, float, string, null) ném TypeError', () => {
  const board = new Board(false);

  assert.strictEqual(board.isValidPosition(1.5, 2), false);
  assert.strictEqual(board.isValidPosition('0', '0'), false);
  assert.strictEqual(board.isValidPosition(null, undefined), false);

  assert.throws(() => board.getPiece(1.5, 2), TypeError);
  assert.throws(() => board.getPiece('0', 0), TypeError);
  assert.throws(() => board.getPiece(NaN, 0), TypeError);
  assert.throws(() => board.getPiece(null, 4), TypeError);
});

runTest('1.5. movePiece validate biên cho cả vị trí from và to', () => {
  const board = new Board(true);

  // from ngoài biên
  assert.throws(() => board.movePiece({ row: -1, col: 0 }, { row: 0, col: 0 }), RangeError);
  assert.throws(() => board.movePiece({ row: 10, col: 0 }, { row: 9, col: 0 }), RangeError);

  // to ngoài biên
  assert.throws(() => board.movePiece({ row: 9, col: 0 }, { row: 10, col: 0 }), RangeError);
  assert.throws(() => board.movePiece({ row: 9, col: 0 }, { row: 9, col: 9 }), RangeError);
  assert.throws(() => board.movePiece({ row: 9, col: 0 }, { row: 9, col: -1 }), RangeError);

  // from không có quân
  assert.throws(() => board.movePiece({ row: 4, col: 4 }, { row: 5, col: 4 }), Error);
});

// ============================================================================
// 2. KIỂM THỬ THAO TÁC QUÂN CỜ TRÊN BOARD
// ============================================================================
console.log('\n--- 2. Kiểm thử Thao tác Quân cờ trên Board ---');

runTest('2.1. Khởi tạo bàn cờ mặc định có đúng 32 quân (16 Đỏ, 16 Đen)', () => {
  const board = new Board(true);
  const allPieces = board.getPieces();
  const redPieces = board.getPieces('RED');
  const blackPieces = board.getPieces('BLACK');

  assert.strictEqual(allPieces.length, 32, 'Tổng số quân phải là 32');
  assert.strictEqual(redPieces.length, 16, 'Số quân Đỏ phải là 16');
  assert.strictEqual(blackPieces.length, 16, 'Số quân Đen phải là 16');

  // Kiểm tra vị trí quân Tướng (General)
  const redGeneral = board.findGeneral('RED');
  assert.ok(redGeneral, 'Phải tìm thấy Tướng Đỏ');
  assert.strictEqual(redGeneral.row, 9);
  assert.strictEqual(redGeneral.col, 4);
  assert.strictEqual(redGeneral.type, PIECE_TYPES.GENERAL);
  assert.strictEqual(redGeneral.color, COLORS.RED);

  const blackGeneral = board.findGeneral('BLACK');
  assert.ok(blackGeneral, 'Phải tìm thấy Tướng Đen');
  assert.strictEqual(blackGeneral.row, 0);
  assert.strictEqual(blackGeneral.col, 4);
  assert.strictEqual(blackGeneral.type, PIECE_TYPES.GENERAL);
  assert.strictEqual(blackGeneral.color, COLORS.BLACK);
});

runTest('2.2. setPiece, getPiece, removePiece và đồng bộ tọa độ', () => {
  const board = new Board(false);

  // Đặt một quân Xe Đỏ vào (5, 5)
  const piece = board.setPiece(5, 5, { type: PIECE_TYPES.CHARIOT, color: COLORS.RED });
  assert.strictEqual(piece.row, 5);
  assert.strictEqual(piece.col, 5);
  assert.strictEqual(piece.type, PIECE_TYPES.CHARIOT);
  assert.strictEqual(piece.color, COLORS.RED);

  // getPiece trả về đúng quân
  const retrieved = board.getPiece(5, 5);
  assert.deepStrictEqual(retrieved, piece);
  assert.strictEqual(board.isEmpty(5, 5), false);
  assert.strictEqual(board.isEmpty(5, 6), true);

  // removePiece
  const removed = board.removePiece(5, 5);
  assert.deepStrictEqual(removed, piece);
  assert.strictEqual(board.getPiece(5, 5), null);
  assert.strictEqual(board.isEmpty(5, 5), true);
});

runTest('2.3. movePiece di chuyển quân và xử lý ăn quân', () => {
  const board = new Board(false);

  // Đặt quân Xe Đỏ tại (9, 0) và quân Tốt Đen tại (5, 0)
  board.setPiece(9, 0, { type: PIECE_TYPES.CHARIOT, color: COLORS.RED });
  board.setPiece(5, 0, { type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK });

  const moveRes = board.movePiece({ row: 9, col: 0 }, { row: 5, col: 0 });

  assert.strictEqual(board.getPiece(9, 0), null, 'Ô cũ phải rỗng');
  const target = board.getPiece(5, 0);
  assert.ok(target, 'Ô mới phải có quân');
  assert.strictEqual(target.type, PIECE_TYPES.CHARIOT);
  assert.strictEqual(target.color, COLORS.RED);
  assert.strictEqual(target.row, 5);
  assert.strictEqual(target.col, 0);

  // Thông tin moveResult
  assert.strictEqual(moveRes.capturedPiece.type, PIECE_TYPES.SOLDIER);
  assert.strictEqual(moveRes.capturedPiece.color, COLORS.BLACK);
  assert.strictEqual(moveRes.movedPiece.row, 5);
  assert.strictEqual(moveRes.movedPiece.col, 0);
});

// ============================================================================
// 3. KIỂM THỬ CLONE SÂU (DEEP CLONE)
// ============================================================================
console.log('\n--- 3. Kiểm thử Clone Sâu (Deep Clone) ---');

runTest('3.1. Board.clone() tạo bản sao sâu, không chung reference mảng hay object', () => {
  const original = new Board(true);
  const cloned = original.clone();

  // Reference của board khác nhau
  assert.notStrictEqual(cloned, original, 'Instance Board phải khác nhau');
  assert.notStrictEqual(cloned.grid, original.grid, 'Mảng grid cấp 1 phải khác nhau');
  assert.notStrictEqual(cloned.grid[0], original.grid[0], 'Mảng từng hàng phải khác nhau');

  // Reference của từng piece object phải khác nhau
  const originalPiece = original.getPiece(9, 4);
  const clonedPiece = cloned.getPiece(9, 4);
  assert.notStrictEqual(clonedPiece, originalPiece, 'Object quân cờ trên bản clone phải khác reference bản gốc');
  assert.deepStrictEqual(clonedPiece, originalPiece, 'Nội dung quân cờ phải tương đương');

  // Đột biến trên bản clone: sửa thuộc tính piece
  clonedPiece.type = 'altered_piece';
  assert.strictEqual(original.getPiece(9, 4).type, PIECE_TYPES.GENERAL, 'Bản gốc không bị ảnh hưởng khi mutate piece của clone');

  // Đột biến trên bản clone: di chuyển quân
  cloned.movePiece({ row: 9, col: 0 }, { row: 8, col: 0 });
  assert.strictEqual(cloned.getPiece(9, 0), null);
  assert.ok(cloned.getPiece(8, 0));
  // Kiểm tra bản gốc vẫn nguyên vẹn
  assert.ok(original.getPiece(9, 0), 'Bản gốc vẫn có Xe tại (9, 0)');
  assert.strictEqual(original.getPiece(8, 0), null, 'Bản gốc ô (8, 0) vẫn trống');

  // Đột biến trên bản clone: xóa toàn bộ
  cloned.clear();
  assert.strictEqual(cloned.getPieces().length, 0);
  assert.strictEqual(original.getPieces().length, 32, 'Bản gốc vẫn đủ 32 quân');
});

runTest('3.2. GameState.clone() tạo bản sao sâu độc lập cho thuật toán AI', () => {
  const originalState = new GameState({
    currentTurn: COLORS.RED,
    status: STATUS.PLAYING,
    winner: null,
    metadata: {
      moveCount: 0,
      customNote: 'Original Game',
      history: []
    }
  });

  const clonedState = originalState.clone();

  // Khác biệt về reference
  assert.notStrictEqual(clonedState, originalState);
  assert.notStrictEqual(clonedState.board, originalState.board);
  assert.notStrictEqual(clonedState.metadata, originalState.metadata);
  assert.notStrictEqual(clonedState.metadata.history, originalState.metadata.history);

  // AI thử thực hiện nước đi trên bản clone: Tốt Đỏ tiến (6, 4) -> (5, 4)
  clonedState.makeMove({ row: 6, col: 4 }, { row: 5, col: 4 });

  // Kiểm tra trạng thái bản clone đã thay đổi
  assert.strictEqual(clonedState.currentTurn, COLORS.BLACK, 'Clone phải đổi lượt sang BLACK');
  assert.strictEqual(clonedState.metadata.moveCount, 1, 'Clone moveCount = 1');
  assert.strictEqual(clonedState.metadata.history.length, 1, 'Clone history có 1 nước');
  assert.ok(clonedState.lastMove, 'Clone có lastMove');
  assert.strictEqual(clonedState.board.getPiece(6, 4), null);
  assert.ok(clonedState.board.getPiece(5, 4));

  // KIỂM TRA BẢN GỐC TUYỆT ĐỐI KHÔNG BỊ BIẾN ĐỔI:
  assert.strictEqual(originalState.currentTurn, COLORS.RED, 'Bản gốc vẫn là lượt RED');
  assert.strictEqual(originalState.metadata.moveCount, 0, 'Bản gốc moveCount vẫn là 0');
  assert.strictEqual(originalState.metadata.history.length, 0, 'Bản gốc history rỗng');
  assert.strictEqual(originalState.lastMove, null, 'Bản gốc lastMove vẫn là null');
  assert.ok(originalState.board.getPiece(6, 4), 'Bản gốc Tốt vẫn ở (6, 4)');
  assert.strictEqual(originalState.board.getPiece(5, 4), null, 'Bản gốc ô (5, 4) vẫn trống');
});

// ============================================================================
// 4. KIỂM THỬ SERIALIZE / FROMJSON (SOCKET & PERSISTENCE)
// ============================================================================
console.log('\n--- 4. Kiểm thử Serialize -> JSON -> fromJSON ---');

runTest('4.1. Chu kỳ Serialize -> JSON -> fromJSON giữ nguyên toàn bộ dữ liệu', () => {
  const gameState = new GameState({
    currentTurn: COLORS.RED,
    status: STATUS.PLAYING,
    winner: null,
    metadata: {
      gameId: 101,
      timeControl: 15
    }
  });

  // Đi 2 nước: Đỏ đi, Đen đi
  gameState.makeMove({ row: 6, col: 4 }, { row: 5, col: 4 }); // Đỏ đi
  gameState.makeMove({ row: 3, col: 4 }, { row: 4, col: 4 }); // Đen đi

  // 1. Serialize thành plain object
  const serialized = gameState.serialize();
  assert.strictEqual(typeof serialized, 'object');
  assert.strictEqual(serialized.currentTurn, COLORS.RED, 'Sau 2 nước lượt lại về RED');
  assert.strictEqual(serialized.metadata.moveCount, 2);
  assert.strictEqual(serialized.metadata.history.length, 2);

  // 2. Chuyển thành chuỗi JSON (như gửi qua Socket.IO hoặc lưu DB)
  const jsonString = JSON.stringify(serialized);
  assert.strictEqual(typeof jsonString, 'string');

  // 3. Khôi phục từ chuỗi JSON bằng GameState.fromJSON
  const restoredState = GameState.fromJSON(jsonString);

  // Kiểm tra instance khôi phục có đầy đủ methods
  assert.ok(restoredState instanceof GameState);
  assert.ok(restoredState.board instanceof Board);
  assert.strictEqual(typeof restoredState.clone, 'function');
  assert.strictEqual(typeof restoredState.makeMove, 'function');
  assert.strictEqual(typeof restoredState.board.getPiece, 'function');

  // Kiểm tra tính toàn vẹn dữ liệu
  assert.strictEqual(restoredState.currentTurn, gameState.currentTurn);
  assert.strictEqual(restoredState.status, gameState.status);
  assert.strictEqual(restoredState.winner, gameState.winner);
  assert.deepStrictEqual(restoredState.lastMove, gameState.lastMove);
  assert.strictEqual(restoredState.metadata.moveCount, gameState.metadata.moveCount);
  assert.deepStrictEqual(restoredState.metadata.history, gameState.metadata.history);

  // Vị trí quân cờ khớp 100%
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const origPiece = gameState.board.getPiece(r, c);
      const restPiece = restoredState.board.getPiece(r, c);
      assert.deepStrictEqual(restPiece, origPiece, `Quân cờ tại (${r}, ${c}) phải khớp hoàn toàn`);
    }
  }

  // Khôi phục tiếp tục chơi được nước thứ 3
  const nextMove = restoredState.makeMove({ row: 7, col: 1 }, { row: 7, col: 4 });
  assert.ok(nextMove);
  assert.strictEqual(restoredState.currentTurn, COLORS.BLACK);
  assert.strictEqual(restoredState.metadata.moveCount, 3);
});

// ============================================================================
// 5. KIỂM THỬ KHÔNG PHỤ THUỘC NGOẠI VI (EXPRESS, MSSQL, SOCKET.IO, DOM)
// ============================================================================
console.log('\n--- 5. Kiểm thử Độc Lập (Không phụ thuộc Express, MSSQL, Socket.IO, DOM) ---');

runTest('5.1. Board.js, GameState.js, constants.js không chứa require hoặc import express, mssql, socket.io, DOM', () => {
  const filesToCheck = [
    path.join(__dirname, '../../src/game/Board.js'),
    path.join(__dirname, '../../src/game/GameState.js'),
    path.join(__dirname, '../../src/game/constants.js'),
    path.join(__dirname, '../../src/game/initialState.js')
  ];

  const forbiddenTerms = [
    'express',
    'mssql',
    'socket.io',
    'window',
    'document',
    'HTMLElement',
    'localStorage'
  ];

  for (const filePath of filesToCheck) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const term of forbiddenTerms) {
      // Regex tìm kiếm các lệnh require('...') hoặc import ... from '...'
      const requireRegex = new RegExp(`require\\s*\\(\\s*['"]${term}['"]\\s*\\)`, 'i');
      const importRegex = new RegExp(`from\\s*['"]${term}['"]`, 'i');
      
      assert.strictEqual(
        requireRegex.test(content),
        false,
        `File ${path.basename(filePath)} không được require('${term}')`
      );
      assert.strictEqual(
        importRegex.test(content),
        false,
        `File ${path.basename(filePath)} không được import từ '${term}'`
      );
    }
  }
});

// ============================================================================
// 6. KIỂM THỬ INITIALSTATE (createInitialBoard & createInitialGameState)
// ============================================================================
console.log('\n--- 6. Kiểm thử Khởi tạo Bàn cờ & GameState (initialState.js) ---');

const {
  createInitialBoard,
  createInitialGameState,
  PIECE_TYPES: INITIAL_PIECE_TYPES
} = require('../../src/game/initialState');

runTest('6.1. createInitialBoard() trả đúng 32 quân (16 RED + 16 BLACK)', () => {
  const board = createInitialBoard();
  assert.ok(board instanceof Board, 'Kết quả phải là instance của Board');

  const allPieces = board.getPieces();
  const redPieces = board.getPieces('RED');
  const blackPieces = board.getPieces('BLACK');

  assert.strictEqual(allPieces.length, 32, 'Tổng số quân phải đúng 32');
  assert.strictEqual(redPieces.length, 16, 'Số quân RED phải đúng 16');
  assert.strictEqual(blackPieces.length, 16, 'Số quân BLACK phải đúng 16');
});

runTest('6.2. Test số lượng từng loại quân cho mỗi màu (1 Tướng, 2 Sĩ, 2 Tượng, 2 Mã, 2 Xe, 2 Pháo, 5 Tốt)', () => {
  const board = createInitialBoard();

  const countPiecesByType = (color) => {
    const pieces = board.getPieces(color);
    const counts = {};
    for (const p of pieces) {
      counts[p.type] = (counts[p.type] || 0) + 1;
    }
    return counts;
  };

  const expectedCounts = {
    [INITIAL_PIECE_TYPES.GENERAL]: 1,
    [INITIAL_PIECE_TYPES.ADVISOR]: 2,
    [INITIAL_PIECE_TYPES.ELEPHANT]: 2,
    [INITIAL_PIECE_TYPES.HORSE]: 2,
    [INITIAL_PIECE_TYPES.CHARIOT]: 2,
    [INITIAL_PIECE_TYPES.CANNON]: 2,
    [INITIAL_PIECE_TYPES.SOLDIER]: 5
  };

  const redCounts = countPiecesByType('RED');
  const blackCounts = countPiecesByType('BLACK');

  for (const [type, expected] of Object.entries(expectedCounts)) {
    assert.strictEqual(
      redCounts[type],
      expected,
      `Phe RED phải có đúng ${expected} quân ${type}, thực tế: ${redCounts[type]}`
    );
    assert.strictEqual(
      blackCounts[type],
      expected,
      `Phe BLACK phải có đúng ${expected} quân ${type}, thực tế: ${blackCounts[type]}`
    );
  }
});

runTest('6.3. Test các tọa độ pháo/tốt đặc thù và hàng cuối của hai bên', () => {
  const board = createInitialBoard();

  // Pháo Đen: row 2, col 1 và 7
  const bCannon1 = board.getPiece(2, 1);
  const bCannon2 = board.getPiece(2, 7);
  assert.ok(bCannon1 && bCannon1.type === INITIAL_PIECE_TYPES.CANNON && bCannon1.color === COLORS.BLACK);
  assert.ok(bCannon2 && bCannon2.type === INITIAL_PIECE_TYPES.CANNON && bCannon2.color === COLORS.BLACK);

  // Pháo Đỏ: row 7, col 1 và 7
  const rCannon1 = board.getPiece(7, 1);
  const rCannon2 = board.getPiece(7, 7);
  assert.ok(rCannon1 && rCannon1.type === INITIAL_PIECE_TYPES.CANNON && rCannon1.color === COLORS.RED);
  assert.ok(rCannon2 && rCannon2.type === INITIAL_PIECE_TYPES.CANNON && rCannon2.color === COLORS.RED);

  // Tốt Đen: row 3, các cột chẵn 0, 2, 4, 6, 8
  const blackSoldierCols = [0, 2, 4, 6, 8];
  for (const col of blackSoldierCols) {
    const soldier = board.getPiece(3, col);
    assert.ok(
      soldier && soldier.type === INITIAL_PIECE_TYPES.SOLDIER && soldier.color === COLORS.BLACK,
      `Tốt đen phải ở vị trí (3, ${col})`
    );
  }

  // Tốt Đỏ: row 6, các cột chẵn 0, 2, 4, 6, 8
  const redSoldierCols = [0, 2, 4, 6, 8];
  for (const col of redSoldierCols) {
    const soldier = board.getPiece(6, col);
    assert.ok(
      soldier && soldier.type === INITIAL_PIECE_TYPES.SOLDIER && soldier.color === COLORS.RED,
      `Tốt đỏ phải ở vị trí (6, ${col})`
    );
  }

  // Hàng cuối Đen (row 0)
  const expectedBlackRow0 = [
    INITIAL_PIECE_TYPES.CHARIOT,
    INITIAL_PIECE_TYPES.HORSE,
    INITIAL_PIECE_TYPES.ELEPHANT,
    INITIAL_PIECE_TYPES.ADVISOR,
    INITIAL_PIECE_TYPES.GENERAL,
    INITIAL_PIECE_TYPES.ADVISOR,
    INITIAL_PIECE_TYPES.ELEPHANT,
    INITIAL_PIECE_TYPES.HORSE,
    INITIAL_PIECE_TYPES.CHARIOT
  ];
  for (let c = 0; c < 9; c++) {
    const piece = board.getPiece(0, c);
    assert.ok(piece, `Ô (0, ${c}) phải có quân`);
    assert.strictEqual(piece.type, expectedBlackRow0[c]);
    assert.strictEqual(piece.color, COLORS.BLACK);
  }

  // Hàng cuối Đỏ (row 9)
  const expectedRedRow9 = [
    INITIAL_PIECE_TYPES.CHARIOT,
    INITIAL_PIECE_TYPES.HORSE,
    INITIAL_PIECE_TYPES.ELEPHANT,
    INITIAL_PIECE_TYPES.ADVISOR,
    INITIAL_PIECE_TYPES.GENERAL,
    INITIAL_PIECE_TYPES.ADVISOR,
    INITIAL_PIECE_TYPES.ELEPHANT,
    INITIAL_PIECE_TYPES.HORSE,
    INITIAL_PIECE_TYPES.CHARIOT
  ];
  for (let c = 0; c < 9; c++) {
    const piece = board.getPiece(9, c);
    assert.ok(piece, `Ô (9, ${c}) phải có quân`);
    assert.strictEqual(piece.type, expectedRedRow9[c]);
    assert.strictEqual(piece.color, COLORS.RED);
  }
});

runTest('6.4. Bảo đảm không trùng id và không có hai quân cùng vị trí', () => {
  const board = createInitialBoard();
  const pieces = board.getPieces();

  assert.strictEqual(pieces.length, 32);

  const seenIds = new Set();
  const seenPositions = new Set();

  for (const piece of pieces) {
    // 1. Kiểm tra id
    assert.ok(piece.id, 'Mỗi quân cờ phải có id');
    assert.strictEqual(seenIds.has(piece.id), false, `ID không được trùng lặp: ${piece.id}`);
    seenIds.add(piece.id);

    // 2. Kiểm tra vị trí
    const posKey = `${piece.row},${piece.col}`;
    assert.strictEqual(seenPositions.has(posKey), false, `Vị trí không được trùng lặp: (${piece.row}, ${piece.col})`);
    seenPositions.add(posKey);

    // 3. Kiểm tra tính khớp giữa vị trí trên board và thuộc tính trong piece
    const boardPiece = board.getPiece(piece.row, piece.col);
    assert.strictEqual(boardPiece.id, piece.id);
  }

  assert.strictEqual(seenIds.size, 32, 'Phải có 32 ID duy nhất phân biệt');
  assert.strictEqual(seenPositions.size, 32, 'Phải có 32 ô phân biệt chứa quân');
});

runTest('6.5. createInitialGameState() khởi tạo với currentTurn RED và status PLAYING', () => {
  const state = createInitialGameState();

  assert.ok(state instanceof GameState, 'Phải là instance của GameState');
  assert.ok(state.board instanceof Board, 'state.board phải là instance của Board');
  assert.strictEqual(state.currentTurn, COLORS.RED, 'currentTurn ban đầu phải là RED');
  assert.strictEqual(state.status, STATUS.PLAYING, 'status ban đầu phải là PLAYING');
  assert.strictEqual(state.winner, null, 'winner ban đầu phải là null');
  assert.strictEqual(state.lastMove, null, 'lastMove ban đầu phải là null');
  assert.strictEqual(state.metadata.moveCount, 0, 'moveCount ban đầu phải là 0');
  assert.strictEqual(state.board.getPieces().length, 32, 'Bàn cờ ban đầu phải có đúng 32 quân');
});

// ============================================================================
// TỔNG KẾT KẾT QUẢ
// ============================================================================
console.log('\n======================================================');
console.log(`KẾT QUẢ: ĐÃ VƯỢT QUA ${passedTests}/${totalTests} TESTS THÀNH CÔNG!`);
console.log('======================================================\n');

