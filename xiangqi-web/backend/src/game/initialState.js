/**
 * ============================================================================
 * initialState.js - Khởi tạo Bàn cờ và Trạng thái Ván đấu ban đầu chuẩn Cờ Tướng
 * ============================================================================
 * 
 * Đặc tả:
 * - Quy ước tọa độ: row 0 là phía BLACK (nửa trên), row 9 là phía RED (nửa dưới).
 * - Cung cấp createInitialBoard(): đặt chính xác 16 quân RED và 16 quân BLACK (tổng 32 quân).
 * - Mỗi quân cờ có ID duy nhất (unique), type và color chuẩn hóa.
 * - Đảm bảo không trùng ID và không có hai quân cờ nào cùng vị trí (row, col).
 * - Cung cấp createInitialGameState(): thiết lập GameState với currentTurn RED và status PLAYING.
 * - Thuần JavaScript, không phụ thuộc Express, SQL, Socket.IO hoặc DOM.
 * 
 * Contract:
 * - createInitialBoard() -> Board
 * - createInitialGameState() -> GameState
 */

const Board = require('./Board');
const GameState = require('./GameState');
const {
  COLORS,
  STATUS,
  PIECE_TYPES: CONSTANT_PIECE_TYPES,
  normalizeColor
} = require('./constants');

/**
 * Mapping các loại quân cờ chuẩn của Cờ Tướng
 */
const PIECE_TYPES = Object.freeze({
  GENERAL: CONSTANT_PIECE_TYPES?.GENERAL || 'general',   // Tướng (帥 / 將)
  ADVISOR: CONSTANT_PIECE_TYPES?.ADVISOR || 'advisor',   // Sĩ (仕 / 士)
  ELEPHANT: CONSTANT_PIECE_TYPES?.ELEPHANT || 'elephant', // Tượng (相 / 象)
  HORSE: CONSTANT_PIECE_TYPES?.HORSE || 'horse',       // Mã (馬 / 馬)
  CHARIOT: CONSTANT_PIECE_TYPES?.CHARIOT || 'chariot',   // Xe (車 / 車)
  CANNON: CONSTANT_PIECE_TYPES?.CANNON || 'cannon',     // Pháo (炮 / 砲)
  SOLDIER: CONSTANT_PIECE_TYPES?.SOLDIER || 'soldier'    // Tốt / Binh (兵 / 卒)
});

/**
 * Danh sách định nghĩa 32 vị trí quân cờ xuất phát chuẩn Cờ Tướng
 * 16 quân BLACK (row 0 -> 3) và 16 quân RED (row 6 -> 9)
 */
const INITIAL_PIECE_DEFINITIONS = Object.freeze([
  // ==========================================================================
  // 1. PHE ĐEN (BLACK) - Nửa trên bàn cờ, row 0..3 (16 quân)
  // ==========================================================================
  // Hàng cuối (row 0): Xe - Mã - Tượng - Sĩ - Tướng - Sĩ - Tượng - Mã - Xe
  { id: 'black_chariot_0_0', type: PIECE_TYPES.CHARIOT,  color: COLORS.BLACK, row: 0, col: 0 },
  { id: 'black_horse_0_1',   type: PIECE_TYPES.HORSE,    color: COLORS.BLACK, row: 0, col: 1 },
  { id: 'black_elephant_0_2',type: PIECE_TYPES.ELEPHANT, color: COLORS.BLACK, row: 0, col: 2 },
  { id: 'black_advisor_0_3', type: PIECE_TYPES.ADVISOR,  color: COLORS.BLACK, row: 0, col: 3 },
  { id: 'black_general_0_4', type: PIECE_TYPES.GENERAL,  color: COLORS.BLACK, row: 0, col: 4 },
  { id: 'black_advisor_0_5', type: PIECE_TYPES.ADVISOR,  color: COLORS.BLACK, row: 0, col: 5 },
  { id: 'black_elephant_0_6',type: PIECE_TYPES.ELEPHANT, color: COLORS.BLACK, row: 0, col: 6 },
  { id: 'black_horse_0_7',   type: PIECE_TYPES.HORSE,    color: COLORS.BLACK, row: 0, col: 7 },
  { id: 'black_chariot_0_8', type: PIECE_TYPES.CHARIOT,  color: COLORS.BLACK, row: 0, col: 8 },

  // Hàng Pháo đen (row 2): 2 Pháo tại cột 1 và 7
  { id: 'black_cannon_2_1',  type: PIECE_TYPES.CANNON,   color: COLORS.BLACK, row: 2, col: 1 },
  { id: 'black_cannon_2_7',  type: PIECE_TYPES.CANNON,   color: COLORS.BLACK, row: 2, col: 7 },

  // Hàng Tốt đen (row 3): 5 Tốt tại cột 0, 2, 4, 6, 8
  { id: 'black_soldier_3_0', type: PIECE_TYPES.SOLDIER,  color: COLORS.BLACK, row: 3, col: 0 },
  { id: 'black_soldier_3_2', type: PIECE_TYPES.SOLDIER,  color: COLORS.BLACK, row: 3, col: 2 },
  { id: 'black_soldier_3_4', type: PIECE_TYPES.SOLDIER,  color: COLORS.BLACK, row: 3, col: 4 },
  { id: 'black_soldier_3_6', type: PIECE_TYPES.SOLDIER,  color: COLORS.BLACK, row: 3, col: 6 },
  { id: 'black_soldier_3_8', type: PIECE_TYPES.SOLDIER,  color: COLORS.BLACK, row: 3, col: 8 },

  // ==========================================================================
  // 2. PHE ĐỎ (RED) - Nửa dưới bàn cờ, row 6..9 (16 quân)
  // ==========================================================================
  // Hàng Tốt đỏ (row 6): 5 Tốt tại cột 0, 2, 4, 6, 8
  { id: 'red_soldier_6_0',   type: PIECE_TYPES.SOLDIER,  color: COLORS.RED,   row: 6, col: 0 },
  { id: 'red_soldier_6_2',   type: PIECE_TYPES.SOLDIER,  color: COLORS.RED,   row: 6, col: 2 },
  { id: 'red_soldier_6_4',   type: PIECE_TYPES.SOLDIER,  color: COLORS.RED,   row: 6, col: 4 },
  { id: 'red_soldier_6_6',   type: PIECE_TYPES.SOLDIER,  color: COLORS.RED,   row: 6, col: 6 },
  { id: 'red_soldier_6_8',   type: PIECE_TYPES.SOLDIER,  color: COLORS.RED,   row: 6, col: 8 },

  // Hàng Pháo đỏ (row 7): 2 Pháo tại cột 1 và 7
  { id: 'red_cannon_7_1',    type: PIECE_TYPES.CANNON,   color: COLORS.RED,   row: 7, col: 1 },
  { id: 'red_cannon_7_7',    type: PIECE_TYPES.CANNON,   color: COLORS.RED,   row: 7, col: 7 },

  // Hàng cuối (row 9): Xe - Mã - Tượng - Sĩ - Tướng - Sĩ - Tượng - Mã - Xe
  { id: 'red_chariot_9_0',   type: PIECE_TYPES.CHARIOT,  color: COLORS.RED,   row: 9, col: 0 },
  { id: 'red_horse_9_1',     type: PIECE_TYPES.HORSE,    color: COLORS.RED,   row: 9, col: 1 },
  { id: 'red_elephant_9_2',  type: PIECE_TYPES.ELEPHANT, color: COLORS.RED,   row: 9, col: 2 },
  { id: 'red_advisor_9_3',   type: PIECE_TYPES.ADVISOR,  color: COLORS.RED,   row: 9, col: 3 },
  { id: 'red_general_9_4',   type: PIECE_TYPES.GENERAL,  color: COLORS.RED,   row: 9, col: 4 },
  { id: 'red_advisor_9_5',   type: PIECE_TYPES.ADVISOR,  color: COLORS.RED,   row: 9, col: 5 },
  { id: 'red_elephant_9_6',  type: PIECE_TYPES.ELEPHANT, color: COLORS.RED,   row: 9, col: 6 },
  { id: 'red_horse_9_7',     type: PIECE_TYPES.HORSE,    color: COLORS.RED,   row: 9, col: 7 },
  { id: 'red_chariot_9_8',   type: PIECE_TYPES.CHARIOT,  color: COLORS.RED,   row: 9, col: 8 }
]);

/**
 * Kiểm tra tính hợp lệ và không trùng lặp của cấu hình quân cờ ban đầu
 * Đảm bảo:
 * 1. Đủ đúng 32 quân (16 RED + 16 BLACK).
 * 2. Mỗi quân có ID duy nhất.
 * 3. Không có hai quân cờ nào trùng tọa độ (row, col).
 * 
 * @param {Array<Object>} pieceDefs
 * @throws {Error} Nếu phát hiện trùng ID hoặc trùng vị trí
 */
function validateInitialPieceDefinitions(pieceDefs) {
  const seenIds = new Set();
  const seenPositions = new Set();
  let redCount = 0;
  let blackCount = 0;

  for (const p of pieceDefs) {
    // 1. Kiểm tra ID duy nhất
    if (!p.id || typeof p.id !== 'string') {
      throw new Error(`Quân cờ thiếu id hợp lệ: ${JSON.stringify(p)}`);
    }
    if (seenIds.has(p.id)) {
      throw new Error(`Phát hiện trùng lặp id quân cờ: "${p.id}"`);
    }
    seenIds.add(p.id);

    // 2. Kiểm tra vị trí duy nhất
    const posKey = `${p.row},${p.col}`;
    if (seenPositions.has(posKey)) {
      throw new Error(`Phát hiện hai quân cờ cùng vị trí (${p.row}, ${p.col}): id="${p.id}"`);
    }
    seenPositions.add(posKey);

    // 3. Đếm số lượng theo màu
    const color = normalizeColor(p.color);
    if (color === COLORS.RED) {
      redCount++;
    } else if (color === COLORS.BLACK) {
      blackCount++;
    } else {
      throw new Error(`Màu quân cờ không hợp lệ: "${p.color}"`);
    }
  }

  if (redCount !== 16 || blackCount !== 16 || pieceDefs.length !== 32) {
    throw new Error(
      `Số lượng quân cờ không hợp lệ: RED=${redCount}, BLACK=${blackCount}, Tổng=${pieceDefs.length}. Yêu cầu 16 RED + 16 BLACK = 32 quân.`
    );
  }
}

// Chạy validate tĩnh ngay khi nạp module
validateInitialPieceDefinitions(INITIAL_PIECE_DEFINITIONS);

/**
 * Tạo bàn cờ ban đầu (Board) với 32 quân cờ được đặt chính xác
 * - Row 0 là phía BLACK, row 9 là phía RED.
 * - Đảm bảo đúng 16 quân RED và 16 quân BLACK.
 * - Không có vị trí trùng, mỗi quân có id duy nhất.
 * 
 * @returns {Board} Instance Board với bố cục chuẩn Cờ Tướng
 */
function createInitialBoard() {
  const board = new Board(false); // Bàn cờ rỗng

  for (const def of INITIAL_PIECE_DEFINITIONS) {
    board.setPiece(def.row, def.col, {
      id: def.id,
      type: def.type,
      color: def.color,
      row: def.row,
      col: def.col
    });
  }

  return board;
}

/**
 * Tạo trạng thái ván cờ ban đầu (GameState)
 * - currentTurn: COLORS.RED ('RED' đi trước).
 * - status: STATUS.PLAYING ('PLAYING').
 * - winner: null.
 * - board: Khởi tạo từ createInitialBoard().
 * 
 * @param {Object} [options={}] Các tùy chọn bổ sung cho GameState (metadata, players...)
 * @returns {GameState} Instance GameState ban đầu phục vụ chơi local / test / online
 */
function createInitialGameState(options = {}) {
  const board = createInitialBoard();

  return new GameState({
    board,
    currentTurn: COLORS.RED,
    status: STATUS.PLAYING,
    winner: null,
    lastMove: null,
    metadata: {
      moveCount: 0,
      history: [],
      capturedPieces: {
        [COLORS.RED]: [],
        [COLORS.BLACK]: []
      },
      createdAt: Date.now(),
      ...(options.metadata || {})
    },
    ...options
  });
}

module.exports = {
  createInitialBoard,
  createInitialGameState,
  PIECE_TYPES,
  INITIAL_PIECE_DEFINITIONS,
  validateInitialPieceDefinitions
};

