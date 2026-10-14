/**
 * ============================================================================
 * constants.js - Các hằng số dùng chung cho Game Engine Cờ Tướng
 * ============================================================================
 * 
 * Thuần JavaScript, không phụ thuộc Express, SQL, Socket.IO hoặc DOM.
 * Độc lập trong môi trường Node.js.
 */

// Kích thước bàn cờ Cờ Tướng (10 hàng x 9 cột)
const BOARD_ROWS = 10;
const BOARD_COLS = 9;

// Phe / Màu quân cờ
const COLORS = Object.freeze({
  RED: 'RED',
  BLACK: 'BLACK'
});

// Trạng thái ván cờ
const STATUS = Object.freeze({
  WAITING: 'WAITING',
  PLAYING: 'PLAYING',
  CHECK: 'CHECK',
  CHECKMATE: 'CHECKMATE',
  FINISHED: 'FINISHED'
});

// Các loại quân cờ chuẩn
const PIECE_TYPES = Object.freeze({
  GENERAL: 'general',   // Tướng (帥 / 將)
  ADVISOR: 'advisor',   // Sĩ (仕 / 士)
  ELEPHANT: 'elephant', // Tượng (相 / 象)
  HORSE: 'horse',       // Mã (馬 / 馬)
  CHARIOT: 'chariot',   // Xe (車 / 車)
  CANNON: 'cannon',     // Pháo (炮 / 砲)
  SOLDIER: 'soldier'    // Tốt / Binh (兵 / 卒)
});

// Tọa độ Cung Tướng (Palace)
const PALACE = Object.freeze({
  RED: {
    minRow: 7,
    maxRow: 9,
    minCol: 3,
    maxCol: 5
  },
  BLACK: {
    minRow: 0,
    maxRow: 2,
    minCol: 3,
    maxCol: 5
  }
});

// Cấu hình vị trí 32 quân cờ ban đầu chuẩn Cờ Tướng
const INITIAL_PIECES_SETUP = Object.freeze([
  // --- PHE ĐEN (BLACK) - Nửa trên bàn cờ (hàng 0 -> 3) ---
  { id: 'b_chariot_0_0', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK, row: 0, col: 0 },
  { id: 'b_horse_0_1',   type: PIECE_TYPES.HORSE,   color: COLORS.BLACK, row: 0, col: 1 },
  { id: 'b_elephant_0_2',type: PIECE_TYPES.ELEPHANT,color: COLORS.BLACK, row: 0, col: 2 },
  { id: 'b_advisor_0_3', type: PIECE_TYPES.ADVISOR, color: COLORS.BLACK, row: 0, col: 3 },
  { id: 'b_general_0_4', type: PIECE_TYPES.GENERAL, color: COLORS.BLACK, row: 0, col: 4 },
  { id: 'b_advisor_0_5', type: PIECE_TYPES.ADVISOR, color: COLORS.BLACK, row: 0, col: 5 },
  { id: 'b_elephant_0_6',type: PIECE_TYPES.ELEPHANT,color: COLORS.BLACK, row: 0, col: 6 },
  { id: 'b_horse_0_7',   type: PIECE_TYPES.HORSE,   color: COLORS.BLACK, row: 0, col: 7 },
  { id: 'b_chariot_0_8', type: PIECE_TYPES.CHARIOT, color: COLORS.BLACK, row: 0, col: 8 },

  { id: 'b_cannon_2_1',  type: PIECE_TYPES.CANNON,  color: COLORS.BLACK, row: 2, col: 1 },
  { id: 'b_cannon_2_7',  type: PIECE_TYPES.CANNON,  color: COLORS.BLACK, row: 2, col: 7 },

  { id: 'b_soldier_3_0', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK, row: 3, col: 0 },
  { id: 'b_soldier_3_2', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK, row: 3, col: 2 },
  { id: 'b_soldier_3_4', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK, row: 3, col: 4 },
  { id: 'b_soldier_3_6', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK, row: 3, col: 6 },
  { id: 'b_soldier_3_8', type: PIECE_TYPES.SOLDIER, color: COLORS.BLACK, row: 3, col: 8 },

  // --- PHE ĐỎ (RED) - Nửa dưới bàn cờ (hàng 6 -> 9) ---
  { id: 'r_soldier_6_0', type: PIECE_TYPES.SOLDIER, color: COLORS.RED,   row: 6, col: 0 },
  { id: 'r_soldier_6_2', type: PIECE_TYPES.SOLDIER, color: COLORS.RED,   row: 6, col: 2 },
  { id: 'r_soldier_6_4', type: PIECE_TYPES.SOLDIER, color: COLORS.RED,   row: 6, col: 4 },
  { id: 'r_soldier_6_6', type: PIECE_TYPES.SOLDIER, color: COLORS.RED,   row: 6, col: 6 },
  { id: 'r_soldier_6_8', type: PIECE_TYPES.SOLDIER, color: COLORS.RED,   row: 6, col: 8 },

  { id: 'r_cannon_7_1',  type: PIECE_TYPES.CANNON,  color: COLORS.RED,   row: 7, col: 1 },
  { id: 'r_cannon_7_7',  type: PIECE_TYPES.CANNON,  color: COLORS.RED,   row: 7, col: 7 },

  { id: 'r_chariot_9_0', type: PIECE_TYPES.CHARIOT, color: COLORS.RED,   row: 9, col: 0 },
  { id: 'r_horse_9_1',   type: PIECE_TYPES.HORSE,   color: COLORS.RED,   row: 9, col: 1 },
  { id: 'r_elephant_9_2',type: PIECE_TYPES.ELEPHANT,color: COLORS.RED,   row: 9, col: 2 },
  { id: 'r_advisor_9_3', type: PIECE_TYPES.ADVISOR, color: COLORS.RED,   row: 9, col: 3 },
  { id: 'r_general_9_4', type: PIECE_TYPES.GENERAL, color: COLORS.RED,   row: 9, col: 4 },
  { id: 'r_advisor_9_5', type: PIECE_TYPES.ADVISOR, color: COLORS.RED,   row: 9, col: 5 },
  { id: 'r_elephant_9_6',type: PIECE_TYPES.ELEPHANT,color: COLORS.RED,   row: 9, col: 6 },
  { id: 'r_horse_9_7',   type: PIECE_TYPES.HORSE,   color: COLORS.RED,   row: 9, col: 7 },
  { id: 'r_chariot_9_8', type: PIECE_TYPES.CHARIOT, color: COLORS.RED,   row: 9, col: 8 }
]);

/**
 * Chuẩn hóa màu quân về 'RED' hoặc 'BLACK'
 * @param {string} color
 * @returns {'RED'|'BLACK'}
 */
function normalizeColor(color) {
  if (!color) return COLORS.RED;
  const c = String(color).trim().toUpperCase();
  if (c === 'RED' || c === 'R' || c === 'ĐỎ') return COLORS.RED;
  if (c === 'BLACK' || c === 'B' || c === 'ĐEN') return COLORS.BLACK;
  return c;
}

/**
 * Chuẩn hóa loại quân cờ
 * @param {string} type
 * @returns {string}
 */
function normalizePieceType(type) {
  if (!type) return PIECE_TYPES.SOLDIER;
  const t = String(type).trim().toLowerCase();
  switch (t) {
    case 'general':
    case 'king':
    case 'k':
    case 'g':
      return PIECE_TYPES.GENERAL;
    case 'advisor':
    case 'guard':
    case 'a':
      return PIECE_TYPES.ADVISOR;
    case 'elephant':
    case 'bishop':
    case 'e':
    case 'b':
      return PIECE_TYPES.ELEPHANT;
    case 'horse':
    case 'knight':
    case 'h':
    case 'n':
      return PIECE_TYPES.HORSE;
    case 'chariot':
    case 'rook':
    case 'c':
    case 'r':
      return PIECE_TYPES.CHARIOT;
    case 'cannon':
      return PIECE_TYPES.CANNON;
    case 'soldier':
    case 'pawn':
    case 's':
    case 'p':
      return PIECE_TYPES.SOLDIER;
    default:
      return t;
  }
}

/**
 * Kiểm tra xem tọa độ row và col có nằm trong phạm vi bàn cờ (0..9, 0..8) hay không
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function isValidCoordinate(row, col) {
  return (
    typeof row === 'number' &&
    typeof col === 'number' &&
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < BOARD_ROWS &&
    col >= 0 &&
    col < BOARD_COLS
  );
}

module.exports = {
  BOARD_ROWS,
  BOARD_COLS,
  COLORS,
  STATUS,
  PIECE_TYPES,
  PALACE,
  INITIAL_PIECES_SETUP,
  normalizeColor,
  normalizePieceType,
  isValidCoordinate
};

