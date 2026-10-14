/**
 * ============================================================================
 * General.js - Luật di chuyển hình học cho quân Tướng (帥 / 將) Cờ Tướng
 * ============================================================================
 * 
 * Đặc tả:
 * - Nhận Board và vị trí quân Tướng hiện tại.
 * - Trả danh sách các nước đi giả định hợp lệ (pseudo-legal moves):
 *   [{ row, col, canCapture, capturedPieceId }].
 * - Tướng chỉ được di chuyển 1 ô ngang hoặc dọc trong Cung (Palace) của phe mình:
 *   + BLACK Palace: row 0..2, col 3..5
 *   + RED Palace: row 7..9, col 3..5
 * - Không cho phép đi vào ô chứa quân cùng màu.
 * - Không tự thay đổi Board (immutable).
 * - Ở bước này CHƯA quyết định nước đi khiến hai Tướng đối mặt (Flying General);
 *   điều này được kiểm tra và lọc ở validator tổng.
 * 
 * Contract:
 * - getPseudoLegalMoves(board, position) -> [{ row, col, canCapture, capturedPieceId }]
 */

const { BOARD_ROWS, BOARD_COLS, PALACE, normalizeColor } = require('../constants');

/**
 * Kiểm tra xem tọa độ (row, col) có nằm trong bàn cờ 10x9 hay không
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function isWithinBoard(row, col) {
  return (
    typeof row === 'number' &&
    typeof col === 'number' &&
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < (BOARD_ROWS || 10) &&
    col >= 0 &&
    col < (BOARD_COLS || 9)
  );
}

/**
 * Kiểm tra xem tọa độ (row, col) có nằm trong Cung (Palace) của phe chỉ định hay không
 * - Phe BLACK: row 0..2, col 3..5
 * - Phe RED: row 7..9, col 3..5
 * 
 * @param {string} color 'RED' hoặc 'BLACK'
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function isInsidePalace(color, row, col) {
  if (typeof row !== 'number' || typeof col !== 'number' || !Number.isInteger(row) || !Number.isInteger(col)) {
    return false;
  }

  const c = normalizeColor(color);
  const palaceBounds = PALACE?.[c] || (c === 'RED'
    ? { minRow: 7, maxRow: 9, minCol: 3, maxCol: 5 }
    : { minRow: 0, maxRow: 2, minCol: 3, maxCol: 5 });

  return (
    row >= palaceBounds.minRow &&
    row <= palaceBounds.maxRow &&
    col >= palaceBounds.minCol &&
    col <= palaceBounds.maxCol
  );
}

/**
 * Kiểm tra xem hàng (row) có nằm bên phần sân nhà của phe chỉ định (chưa qua sông) hay không
 * - Phe BLACK: row 0..4 (nửa trên sông)
 * - Phe RED: row 5..9 (nửa dưới sông)
 * 
 * @param {string} color 'RED' hoặc 'BLACK'
 * @param {number} row
 * @returns {boolean}
 */
function isOwnSideOfRiver(color, row) {
  if (typeof row !== 'number' || !Number.isInteger(row)) {
    return false;
  }

  const c = normalizeColor(color);
  if (c === 'BLACK') {
    return row >= 0 && row <= 4;
  }
  if (c === 'RED') {
    return row >= 5 && row <= 9;
  }
  return false;
}

/**
 * Kiểm tra xem một quân cờ tại ô đích có phải là đồng minh (cùng màu) hay không
 * @param {Object|null} targetPiece
 * @param {string} currentPieceColor
 * @returns {boolean}
 */
function isFriendlyPiece(targetPiece, currentPieceColor) {
  if (!targetPiece || !targetPiece.color) return false;
  return normalizeColor(targetPiece.color) === normalizeColor(currentPieceColor);
}

/**
 * 4 hướng đi ngang / dọc 1 ô của quân Tướng: [drow, dcol]
 */
const GENERAL_DIRECTIONS = Object.freeze([
  [-1, 0], // Lên 1 ô
  [1, 0],  // Xuống 1 ô
  [0, -1], // Trái 1 ô
  [0, 1]   // Phải 1 ô
]);

/**
 * Lấy danh sách nước đi giả định hợp lệ (pseudo-legal) của quân Tướng
 * 
 * @param {Object} board Instance Board
 * @param {{ row: number, col: number, color?: string }|number} piecePosition
 * @param {number} [maybeCol]
 * @returns {Array<{ row: number, col: number, canCapture: boolean, capturedPieceId: string|null }>}
 */
function getPseudoLegalMoves(board, piecePosition, maybeCol) {
  if (!board) return [];

  // Chuẩn hóa tọa độ xuất phát
  let startRow;
  let startCol;

  if (typeof piecePosition === 'number' && typeof maybeCol === 'number') {
    startRow = piecePosition;
    startCol = maybeCol;
  } else if (piecePosition && typeof piecePosition === 'object') {
    startRow = piecePosition.row;
    startCol = piecePosition.col;
  } else {
    return [];
  }

  // Tọa độ phải nằm trong bàn cờ
  if (!isWithinBoard(startRow, startCol)) {
    return [];
  }

  // Lấy thông tin quân cờ tại vị trí xuất phát
  const currentPiece = board.getPiece(startRow, startCol) ||
    (piecePosition && piecePosition.color ? piecePosition : null);

  if (!currentPiece || !currentPiece.color) {
    return [];
  }

  const myColor = normalizeColor(currentPiece.color);

  // Vị trí Tướng xuất phát phải nằm trong cung
  if (!isInsidePalace(myColor, startRow, startCol)) {
    return [];
  }

  const moves = [];

  // Duyệt 4 hướng ngang/dọc 1 ô
  for (const [drow, dcol] of GENERAL_DIRECTIONS) {
    const targetRow = startRow + drow;
    const targetCol = startCol + dcol;

    // Tướng KHÔNG được ra khỏi cung
    if (!isInsidePalace(myColor, targetRow, targetCol)) {
      continue;
    }

    const targetPiece = board.getPiece(targetRow, targetCol);

    // Không được đi vào ô chứa quân cùng màu
    if (isFriendlyPiece(targetPiece, myColor)) {
      continue;
    }

    if (!targetPiece) {
      moves.push({
        row: targetRow,
        col: targetCol,
        canCapture: false,
        capturedPieceId: null
      });
    } else {
      moves.push({
        row: targetRow,
        col: targetCol,
        canCapture: true,
        capturedPieceId: targetPiece.id || null
      });
    }
  }

  return moves;
}

// Xuất hàm tương thích CommonJS và các helpers tái sử dụng
module.exports = getPseudoLegalMoves;
module.exports.getPseudoLegalMoves = getPseudoLegalMoves;
module.exports.isInsidePalace = isInsidePalace;
module.exports.isOwnSideOfRiver = isOwnSideOfRiver;
module.exports.isWithinBoard = isWithinBoard;
module.exports.isFriendlyPiece = isFriendlyPiece;
module.exports.GENERAL_DIRECTIONS = GENERAL_DIRECTIONS;
